import * as path from 'node:path'
import { createRequire } from 'node:module'
import { hashContent } from '../../hash/file-hasher.js'
import { BaseParser } from '../base-parser.js'
import type { ParsedFile, ParsedFunction, ParsedClass, ParsedParam, ParsedImport } from '../types.js'
import * as Queries from './queries.js'

// Safely require web-tree-sitter via CJS
const getRequire = () => {
    if (typeof require !== 'undefined') return require
    return createRequire(import.meta.url)
}
const _require = getRequire()
const ParserModule = _require('web-tree-sitter')
const Parser = ParserModule.Parser || ParserModule

// ---------------------------------------------------------------------------
// Language-specific export visibility rules
// ---------------------------------------------------------------------------

/**
 * Determine whether a function node is exported based on language conventions.
 * Python: public if name does not start with underscore.
 * Java/C#/Rust: requires an explicit visibility keyword in the node text.
 * Go: exported if name starts with an uppercase letter.
 * All others (C, C++, PHP, Ruby): default to false (no reliable static rule).
 */
function isExportedByLanguage(ext: string, name: string, nodeText: string): boolean {
    switch (ext) {
        case '.py':
            return !name.startsWith('_')
        case '.java':
        case '.cs':
            return /\bpublic\b/.test(nodeText)
        case '.go':
            return name.length > 0 && name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase()
        case '.rs':
            return /\bpub\b/.test(nodeText)
        default:
            return false
    }
}

// ---------------------------------------------------------------------------
// Parameter extraction from tree-sitter nodes
// ---------------------------------------------------------------------------

/**
 * Best-effort parameter extraction from a function definition node.
 * Walks child nodes looking for parameter/formal_parameter identifiers.
 * Returns an empty array on failure — never throws.
 */
function extractParamsFromNode(defNode: any): ParsedParam[] {
    const params: ParsedParam[] = []
    if (!defNode || !defNode.children) return params

    // Walk all descendants looking for parameter-like nodes
    const walk = (node: any) => {
        if (!node) return
        const t = node.type ?? ''
        // Common parameter node type names across tree-sitter grammars
        if (
            t === 'parameter' || t === 'formal_parameter' || t === 'simple_parameter' ||
            t === 'variadic_parameter' || t === 'typed_parameter' || t === 'typed_default_parameter' ||
            t === 'keyword_argument' || t === 'field_declaration'
        ) {
            // Try to find the identifier within this param node
            const identNode = findFirstChild(node, n => n.type === 'identifier' || n.type === 'name')
            const typeNode = findFirstChild(node, n =>
                n.type === 'type' || n.type === 'type_annotation' ||
                n.type === 'type_identifier' || n.type === 'predefined_type'
            )
            const name = identNode?.text ?? node.text ?? ''
            const type = typeNode?.text ?? 'any'
            if (name && name !== '' && !params.some(p => p.name === name)) {
                params.push({ name, type, optional: false })
            }
            return // Don't recurse into parameter children
        }
        if (node.children) {
            for (const child of node.children) walk(child)
        }
    }

    walk(defNode)
    return params
}

function findFirstChild(node: any, predicate: (n: any) => boolean): any {
    if (!node?.children) return null
    for (const child of node.children) {
        if (predicate(child)) return child
    }
    return null
}

// ---------------------------------------------------------------------------
// Scope-aware call resolver
// ---------------------------------------------------------------------------

/**
 * Given the ordered list of functions (with startLine/endLine already set)
 * and a map of callName → line, assign each call to the innermost function
 * whose line range contains that call's line.
 *
 * A call that falls outside every function range (module-level call) is
 * discarded rather than dumped into the first function.
 */
function assignCallsToFunctions(
    functions: ParsedFunction[],
    callEntries: Array<{ name: string; line: number }>
): void {
    for (const { name, line } of callEntries) {
        // Find the innermost (smallest range) function that contains this line
        let best: ParsedFunction | null = null
        let bestRange = Infinity
        for (const fn of functions) {
            if (line >= fn.startLine && line <= fn.endLine) {
                const range = fn.endLine - fn.startLine
                if (range < bestRange) {
                    best = fn
                    bestRange = range
                }
            }
        }
        if (best && !best.calls.includes(name)) {
            best.calls.push(name)
        }
    }
}

// ---------------------------------------------------------------------------
// Main parser class
// ---------------------------------------------------------------------------

export class TreeSitterParser extends BaseParser {
    private parser: any = null
    private languages = new Map<string, any>()

    getSupportedExtensions(): string[] {
        return ['.py', '.java', '.c', '.cpp', '.cc', '.h', '.hpp', '.cs', '.go', '.rs', '.php', '.rb']
    }

    private async init() {
        if (!this.parser) {
            await Parser.init()
            this.parser = new Parser()
        }
    }

    async parse(filePath: string, content: string): Promise<ParsedFile> {
        await this.init()
        const ext = path.extname(filePath).toLowerCase()
        const config = await this.getLanguageConfig(ext)

        if (!config || !config.lang) {
            return this.buildEmptyFile(filePath, content, ext)
        }

        this.parser!.setLanguage(config.lang)
        const tree = this.parser!.parse(content)
        const query = config.lang.query(config.query)
        const matches = query.matches(tree.rootNode)

        const functions: ParsedFunction[] = []
        const classesMap = new Map<string, ParsedClass>()
        const imports: ParsedImport[] = []
        // callEntries stores name + line so we can scope them to the right function
        const callEntries: Array<{ name: string; line: number }> = []
        // Track processed function IDs to avoid collisions from overloads
        const seenFnIds = new Set<string>()

        for (const match of matches) {
            const captures: Record<string, any> = {}
            for (const c of match.captures) {
                captures[c.name] = c.node
            }

            // --- Calls: record name and line position ---
            if (captures['call.name']) {
                const callNode = captures['call.name']
                callEntries.push({
                    name: callNode.text,
                    line: (callNode.startPosition?.row ?? 0) + 1,
                })
                continue
            }

            // --- Imports ---
            if (captures['import.source']) {
                const src = captures['import.source'].text.replace(/['"]/g, '')
                imports.push({
                    source: src,
                    resolvedPath: '',
                    names: [],
                    isDefault: false,
                    isDynamic: false,
                })
                continue
            }

            // --- Functions / Methods ---
            if (captures['definition.function'] || captures['definition.method']) {
                const nameNode = captures['name']
                const defNode = captures['definition.function'] || captures['definition.method']

                if (nameNode && defNode) {
                    const fnName = nameNode.text
                    const startLine = defNode.startPosition.row + 1
                    const endLine = defNode.endPosition.row + 1
                    const nodeText = defNode.text ?? ''

                    // Unique ID: include start line to handle overloads and same-name scoped functions
                    let fnId = `fn:${filePath}:${fnName}:${startLine}`
                    if (seenFnIds.has(fnId)) {
                        // Extremely rare duplicate — skip rather than corrupt
                        continue
                    }
                    seenFnIds.add(fnId)

                    const exported = isExportedByLanguage(ext, fnName, nodeText)
                    const isAsync = /\basync\b/.test(nodeText)

                    // Detect return type — language-specific heuristics
                    const returnType = extractReturnType(ext, defNode)

                    const params = extractParamsFromNode(defNode)

                    functions.push({
                        id: fnId,
                        name: fnName,
                        file: filePath,
                        startLine,
                        endLine,
                        params,
                        returnType,
                        isExported: exported,
                        isAsync,
                        calls: [], // populated after all functions are collected
                        hash: hashContent(nodeText),
                        purpose: extractDocComment(content, startLine),
                        edgeCasesHandled: [],
                        errorHandling: [],
                        detailedLines: [],
                    })
                }
            }

            // --- Classes / Structs / Interfaces ---
            if (
                captures['definition.class'] ||
                captures['definition.struct'] ||
                captures['definition.interface']
            ) {
                const nameNode = captures['name']
                const defNode =
                    captures['definition.class'] ||
                    captures['definition.struct'] ||
                    captures['definition.interface']

                if (nameNode && defNode) {
                    const clsName = nameNode.text
                    const startLine = defNode.startPosition.row + 1
                    const endLine = defNode.endPosition.row + 1
                    const nodeText = defNode.text ?? ''
                    const clsId = `cls:${filePath}:${clsName}:${startLine}`

                    if (!classesMap.has(clsId)) {
                        classesMap.set(clsId, {
                            id: clsId,
                            name: clsName,
                            file: filePath,
                            startLine,
                            endLine,
                            methods: [],
                            isExported: isExportedByLanguage(ext, clsName, nodeText),
                        })
                    }
                }
            }
        }

        // Assign calls to their enclosing function scopes.
        // This replaces the broken `functions[0].calls = Array.from(calls)` pattern.
        assignCallsToFunctions(functions, callEntries)

        const finalLang = extensionToLanguage(ext)

        // Link methods: functions whose names contain '.' belong to a class
        // (Go receiver methods, Java/C# member methods detected via method capture)
        linkMethodsToClasses(functions, classesMap)

        return {
            path: filePath,
            language: finalLang,
            functions,
            classes: Array.from(classesMap.values()),
            generics: [],
            imports,
            exports: functions.filter(f => f.isExported).map(f => ({
                name: f.name,
                type: 'function' as const,
                file: filePath,
            })),
            routes: [],
            hash: hashContent(content),
            parsedAt: Date.now(),
        }
    }

    resolveImports(files: ParsedFile[], _projectRoot: string): ParsedFile[] {
        // Tree-sitter resolver: no cross-file resolution implemented.
        // Imports are left with resolvedPath = '' which signals unresolved to the graph builder.
        // A future pass can resolve Go/Python/Java imports using language-specific rules.
        return files
    }

    private buildEmptyFile(filePath: string, content: string, ext: string): ParsedFile {
        return {
            path: filePath,
            language: extensionToLanguage(ext),
            functions: [],
            classes: [],
            generics: [],
            imports: [],
            exports: [],
            routes: [],
            hash: hashContent(content),
            parsedAt: Date.now(),
        }
    }

    private async loadLang(name: string): Promise<any> {
        if (this.languages.has(name)) return this.languages.get(name)
        try {
            const tcPath = _require.resolve('tree-sitter-wasms/package.json')
            const wasmPath = path.join(path.dirname(tcPath), 'out', `tree-sitter-${name}.wasm`)
            const lang = await Parser.Language.load(wasmPath)
            this.languages.set(name, lang)
            return lang
        } catch (err) {
            console.warn(`Failed to load Tree-sitter WASM for ${name}:`, err)
            return null
        }
    }

    private async getLanguageConfig(ext: string) {
        switch (ext) {
            case '.py':
                return { lang: await this.loadLang('python'), query: Queries.PYTHON_QUERIES }
            case '.java':
                return { lang: await this.loadLang('java'), query: Queries.JAVA_QUERIES }
            case '.c':
            case '.h':
                return { lang: await this.loadLang('c'), query: Queries.C_QUERIES }
            case '.cpp':
            case '.cc':
            case '.hpp':
                return { lang: await this.loadLang('cpp'), query: Queries.CPP_QUERIES }
            case '.cs':
                return { lang: await this.loadLang('c-sharp'), query: Queries.CSHARP_QUERIES }
            case '.go':
                return { lang: await this.loadLang('go'), query: Queries.GO_QUERIES }
            case '.rs':
                return { lang: await this.loadLang('rust'), query: Queries.RUST_QUERIES }
            case '.php':
                return { lang: await this.loadLang('php'), query: Queries.PHP_QUERIES }
            case '.rb':
                return { lang: await this.loadLang('ruby'), query: Queries.RUBY_QUERIES }
            default:
                return null
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extensionToLanguage(ext: string): ParsedFile['language'] {
    switch (ext) {
        case '.py': return 'python'
        case '.java': return 'java'
        case '.c': case '.h': return 'c'
        case '.cpp': case '.cc': case '.hpp': return 'cpp'
        case '.cs': return 'csharp'
        case '.go': return 'go'
        case '.rs': return 'rust'
        case '.php': return 'php'
        case '.rb': return 'ruby'
        default: return 'unknown'
    }
}

/**
 * Extract a simple return type hint from the function node text.
 * Falls back to 'unknown' rather than 'any' to distinguish "not parsed"
 * from "genuinely untyped".
 */
function extractReturnType(ext: string, defNode: any): string {
    const text: string = defNode?.text ?? ''
    // TypeScript/Go/Rust: look for "-> Type" or ": Type" after parameters
    const arrowMatch = text.match(/\)\s*->\s*([^\s{]+)/)
    if (arrowMatch) return arrowMatch[1].trim()
    // Java/C# style: "public int foo(" — type precedes the name
    // This is too fragile to do reliably here; return 'unknown'
      if (ext === '.go') {
          // Go: "func foo() (int, error)" or "func foo() error"
          const goReturnTuple = text.match(/\)\s+(\([^)]+\))/)
          if (goReturnTuple) return goReturnTuple[1].trim()
          const goReturn = text.match(/\)\s+([^\s{(]+)/)
          if (goReturn) return goReturn[1].trim()
      }
    return 'unknown'
}

/**
 * Extract a single-line doc comment immediately preceding the given line.
 * Scans backwards from startLine looking for `#`, `//`, `/**`, or `"""` comments.
 */
function extractDocComment(content: string, startLine: number): string {
    const lines = content.split('\n')
    const targetIdx = startLine - 2 // 0-indexed line before the function
    if (targetIdx < 0) return ''

    const prev = lines[targetIdx]?.trim() ?? ''
    // Single-line comment styles
    for (const prefix of ['# ', '// ', '/// ']) {
        if (prev.startsWith(prefix)) return prev.slice(prefix.length).trim()
    }
    // JSDoc / block comment end
    if (prev === '*/') {
        // Walk back to find the first meaningful JSDoc line
        for (let i = targetIdx - 1; i >= 0; i--) {
            const line = lines[i].trim()
            if (line.startsWith('/*') || line.startsWith('/**')) break
            const cleaned = line.replace(/^\*+\s?/, '')
            if (cleaned && !/^[\-_=*]{3,}$/.test(cleaned)) return cleaned
        }
    }
    return ''
}

/**
 * Move functions that are class methods (identified by having a receiver or
 * by being within the line range of a class) into the class's methods array.
 * This is a best-effort heuristic; direct tree-sitter capture of method
 * declarations already places them correctly in most languages.
 */
function linkMethodsToClasses(
    functions: ParsedFunction[],
    classesMap: Map<string, ParsedClass>
): void {
    const classes = Array.from(classesMap.values())
    if (classes.length === 0) return

    for (const fn of functions) {
        // Already categorised if name contains "." (e.g. "MyClass.method")
        if (fn.name.includes('.')) continue

        // Check if this function falls entirely within a class's line range
        for (const cls of classes) {
            if (fn.startLine > cls.startLine && fn.endLine <= cls.endLine) {
                if (!cls.methods.some(m => m.id === fn.id)) {
                    cls.methods.push(fn)
                }
                break
            }
        }
    }
}
