/* eslint-disable @typescript-eslint/no-explicit-any */
import * as path from 'node:path'
import { TreeSitterResolver } from './resolver.js'
import { LanguageRegistry } from '../language-registry.js'
import { createRequire } from 'node:module'
import { hashContent } from '../../hash/file-hasher.js'
import { BaseExtractor } from '../base-extractor.js'
import type { ParsedFile, ParsedFunction, ParsedClass, ParsedParam, ParsedImport, ParsedGeneric } from '../types.js'
import * as Queries from './queries.js'
import { fileURLToPath } from 'node:url'

const getSafeDirname = (): string => {
    try {
        if (typeof __dirname !== 'undefined') return __dirname
        return path.dirname(fileURLToPath(import.meta.url))
    } catch {
        return process.cwd()
    }
}

const getRequire = (): any => {
    try {
        if (typeof require !== 'undefined') return require
        const req = createRequire(import.meta.url)
        return req
    } catch {
        const fallback = (pkg: string) => { 
            console.error(`Cannot require ${pkg} - environment not supported`); 
            return null; 
        };
        (fallback as any).resolve = (pkg: string) => pkg;
        return fallback;
    }
}

const __dirname = getSafeDirname()
const _require: any = getRequire()

// Languages that have known issues with web-tree-sitter WASM
// Languages that have known issues with web-tree-sitter WASM
// These fail at runtime due to grammar bugs or version incompatibility
const UNSUPPORTED_LANGUAGES = new Set([
    'ruby',       // Known issue: "undefined is not an object (evaluating 'r.apply')"
    'dart',      // Incompatible language version 15 (expects 13-14)
    'objc',      // Query fails: e.length undefined 
    'elm',       // WASM out of bounds memory access
    'css',       // No query captures working - needs different node names
    'json',      // No query captures working - needs different node names
])
// These will be resolved at runtime using the project's node_modules
const LANG_WASM_MAP: Record<string, string> = {
    // Core languages (most used)
    python: 'tree-sitter-wasms/out/tree-sitter-python.wasm',
    java: 'tree-sitter-wasms/out/tree-sitter-java.wasm',
    kotlin: 'tree-sitter-wasms/out/tree-sitter-kotlin.wasm',
    scala: 'tree-sitter-wasms/out/tree-sitter-scala.wasm',
    swift: 'tree-sitter-wasms/out/tree-sitter-swift.wasm',
    dart: 'tree-sitter-wasms/out/tree-sitter-dart.wasm',
    c: 'tree-sitter-wasms/out/tree-sitter-c.wasm',
    cpp: 'tree-sitter-wasms/out/tree-sitter-cpp.wasm',
    csharp: 'tree-sitter-wasms/out/tree-sitter-c_sharp.wasm',
    go: 'tree-sitter-wasms/out/tree-sitter-go.wasm',
    rust: 'tree-sitter-wasms/out/tree-sitter-rust.wasm',
    zig: 'tree-sitter-wasms/out/tree-sitter-zig.wasm',
    php: 'tree-sitter-wasms/out/tree-sitter-php.wasm',
    ruby: 'tree-sitter-wasms/out/tree-sitter-ruby.wasm',
    elixir: 'tree-sitter-wasms/out/tree-sitter-elixir.wasm',
    ocaml: 'tree-sitter-wasms/out/tree-sitter-ocaml.wasm',
    lua: 'tree-sitter-wasms/out/tree-sitter-lua.wasm',
    bash: 'tree-sitter-wasms/out/tree-sitter-bash.wasm',
    // Web languages
    javascript: 'tree-sitter-wasms/out/tree-sitter-javascript.wasm',
    typescript: 'tree-sitter-wasms/out/tree-sitter-typescript.wasm',
    // Config/data formats
    json: 'tree-sitter-wasms/out/tree-sitter-json.wasm',
    yaml: 'tree-sitter-wasms/out/tree-sitter-yaml.wasm',
    toml: 'tree-sitter-wasms/out/tree-sitter-toml.wasm',
    html: 'tree-sitter-wasms/out/tree-sitter-html.wasm',
    css: 'tree-sitter-wasms/out/tree-sitter-css.wasm',
    // Other
    objc: 'tree-sitter-wasms/out/tree-sitter-objc.wasm',
    elm: 'tree-sitter-wasms/out/tree-sitter-elm.wasm',
    solidity: 'tree-sitter-wasms/out/tree-sitter-solidity.wasm',
}

const EXT_TO_LANG: Record<string, string> = {
    // JavaScript/TypeScript (uses tree-sitter-javascript)
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.vue': 'typescript',  // Vue uses TS parser
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    
    // Config formats
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.toml': 'toml',
    '.xml': 'xml',
    
    // Web
    '.html': 'html',
    '.css': 'css',
    '.scss': 'css',
    '.sass': 'css',
    '.less': 'css',
    
    // Smart contracts
    '.sol': 'solidity',
    
    // Functional
    '.elm': 'elm',
    
    // Other
    '.py': 'python',
    '.java': 'java',
    '.kt': 'kotlin',
    '.kts': 'kotlin',
    '.scala': 'scala',
    '.sc': 'scala',
    '.swift': 'swift',
    '.dart': 'dart',
    '.c': 'c',
    '.h': 'c',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.cxx': 'cpp',
    '.hpp': 'cpp',
    '.hxx': 'cpp',
    '.hh': 'cpp',
    '.cs': 'csharp',
    '.go': 'go',
    '.rs': 'rust',
    '.zig': 'zig',
    '.php': 'php',
    '.rb': 'ruby',
    '.ex': 'elixir',
    '.exs': 'elixir',
    '.ml': 'ocaml',
    '.mli': 'ocaml',
    '.lua': 'lua',
    '.sh': 'bash',
    '.bash': 'bash',
    '.zsh': 'bash',
    '.m': 'objc',
    '.mm': 'objc',
}

let Parser: any = null
let Language: any = null
let initialized = false
let parserInitPromise: Promise<void> | null = null
const langCache = new Map<string, any>()

/**
 * Ensures the core Tree-sitter parser is initialized with the correct WASM runtime.
 */
async function ensureParser(): Promise<void> {
    if (parserInitPromise) return parserInitPromise

    parserInitPromise = (async () => {
        try {
            const ParserModule = _require('web-tree-sitter')
            await ParserModule.init({
                locateFile: (name: string) => {
                    // Check local package node_modules first, then root
                    try {
                        return _require.resolve(path.join('web-tree-sitter', name))
                    } catch {
                        return path.join(__dirname, '..', '..', '..', 'node_modules', 'web-tree-sitter', name)
                    }
                }
            })
            Parser = ParserModule
            Language = ParserModule.Language
            initialized = true
        } catch (err: any) {
            console.error(`[tree-sitter] Core initialization failed: ${err.message}`)
            throw err
        }
    })()

    return parserInitPromise
}

/**
 * Loads a specific language grammar from the tree-sitter-wasms package.
 */
async function loadLang(name: string): Promise<any> {
    await ensureParser()
    
    if (langCache.has(name)) return langCache.get(name)

    const wasmPath = LANG_WASM_MAP[name]
    if (!wasmPath) throw new Error(`[tree-sitter] No grammar mapping for language: ${name}`)

    try {
        const absoluteWasmPath = _require.resolve(wasmPath)
        if (process.env.MIKK_DEBUG) {
            console.log(`[tree-sitter] Loading ${name} from ${absoluteWasmPath}`)
        }
        const lang = await Language.load(absoluteWasmPath)
        langCache.set(name, lang)
        return lang
    } catch (err: any) {
        console.error(`[tree-sitter] Failed to load grammar for ${name}: ${err.message}`)
        throw err
    }
}
// Residual old init logic removed. (replaced by ensureParser/loadLang above)

function isExportedByLanguage(ext: string, name: string, nodeText: string): boolean {
    switch (ext) {
        case '.py':
            return !name.startsWith('_')
        case '.java':
            return /\bpublic\b/.test(nodeText)
        case '.kt':
        case '.kts':
            return !/\bprivate\b/.test(nodeText) && !/\binternal\b/.test(nodeText) && !/\bprotected\b/.test(nodeText)
        case '.swift':
            return !/\bprivate\b/.test(nodeText) && !/\bfileprivate\b/.test(nodeText)
        case '.cs':
            return /\bpublic\b/.test(nodeText) && !/\binternal\b/.test(nodeText)
        case '.go':
            return name.length > 0 && name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase()
        case '.rs':
            return /\bpub\b/.test(nodeText) || /\bpub\s*\(crate\)/.test(nodeText)
        case '.php':
            return !/\bprivate\b/.test(nodeText) && !/\bprotected\b/.test(nodeText)
        case '.rb':
            if (name.startsWith('private_') || name.startsWith('protected_')) return false
            if (/\bprivate\b/.test(nodeText.split('\n')[0] || '')) return false
            if (/\bprotected\b/.test(nodeText.split('\n')[0] || '')) return false
            return true
        case '.c':
        case '.h':
            return true
        case '.cpp':
        case '.cc':
        case '.hpp':
        case '.hh':
            if (/\bprivate\b/.test(nodeText) || /\bprotected\b/.test(nodeText)) return false
            return true
        default:
            return false
    }
}

function extractParamsFromNode(defNode: any): ParsedParam[] {
    const params: ParsedParam[] = []
    if (!defNode || !defNode.children) return params

    const walk = (node: any) => {
        if (!node) return
        const t = node.type ?? ''
        if (
            t === 'parameter' || t === 'formal_parameter' || t === 'simple_parameter' ||
            t === 'variadic_parameter' || t === 'typed_parameter' || t === 'typed_default_parameter' ||
            t === 'keyword_argument' || t === 'field_declaration'
        ) {
            const identNode = findFirstChild(node, n => n.type === 'identifier' || n.type === 'name')
            const typeNode = findFirstChild(node, n =>
                n.type === 'type' || n.type === 'type_annotation' ||
                n.type === 'type_identifier' || n.type === 'predefined_type'
            )
            const name = identNode?.text ?? node.text ?? ''
            const type = typeNode?.text ?? 'any'
            if (name && name !== '' && !params.some(p => p.name === name)) {
                params.push({ name, type, optional: /\?/.test(type) })
            }
            return
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

function findAllChildren(node: any, predicate: (n: any) => boolean): any[] {
    const results: any[] = []
    if (!node?.children) return results
    for (const child of node.children) {
        if (predicate(child)) results.push(child)
        results.push(...findAllChildren(child, predicate))
    }
    return results
}

function extractDecoratorsFromNode(defNode: any): string[] {
    const decorators: string[] = []
    if (!defNode?.children) return decorators
    
    for (const child of defNode.children) {
        if (child.type === 'decorator' || child.type === 'attribute' || child.type === 'annotation') {
            const nameNode = findFirstChild(child, n => 
                n.type === 'identifier' || 
                n.type === 'attribute' ||
                n.type === 'decorator_target'
            )
            if (nameNode?.text) {
                decorators.push(nameNode.text)
            }
        }
        if (child.type === 'expression_statement') {
            const innerChild = findFirstChild(child, n => n.type === 'decorator' || n.type === 'attribute')
            if (innerChild) {
                const nameNode = findFirstChild(innerChild, n => n.type === 'identifier')
                if (nameNode?.text) {
                    decorators.push(nameNode.text)
                }
            }
        }
    }
    return decorators
}

function _extractGenericsFromNode(defNode: any, filePath: string): ParsedGeneric[] {
    const generics: ParsedGeneric[] = []
    if (!defNode) return generics

    const typeParamNodes = findAllChildren(defNode, n => 
        n.type === 'type_parameter' || n.type === 'type_parameters'
    )

    for (const tpNode of typeParamNodes) {
        if (tpNode.type === 'type_parameters') {
            const params = findAllChildren(tpNode, n => n.type === 'type_parameter')
            for (const param of params) {
                const paramName = findFirstChild(param, n => n.type === 'type_identifier' || n.type === 'identifier')
                if (paramName) {
                    generics.push({
                        id: `generic:${filePath}:${paramName.text}`,
                        name: paramName.text,
                        type: 'type',
                        file: filePath,
                        startLine: param.startPosition?.row + 1 || 0,
                        endLine: param.endPosition?.row + 1 || 0,
                        isExported: false,
                        hash: '',
                    })
                }
            }
        }
    }

    return generics
}

function assignCallsToFunctions(
    functions: ParsedFunction[],
    callEntries: Array<{ name: string; line: number }>
): Array<{ name: string; line: number }> {
    const unassigned: Array<{ name: string; line: number }> = []
    for (const { name, line } of callEntries) {
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
        if (best) {
            if (!best.calls.some(c => c.name === name && c.line === line)) {
                best.calls.push({ name, line, type: 'function' })
            }
        } else {
            unassigned.push({ name, line })
        }
    }
    return unassigned
}

export class TreeSitterParser extends BaseExtractor {
    private parser: any = null
    private languages = new Map<string, any>()
    private nameCounter = new Map<string, number>()
    private wasmLoadError = false

    getSupportedExtensions(): string[] {
        return Object.keys(EXT_TO_LANG)
    }

    private async init() {
        if (this.parser) return
        await ensureParser()
        if (Parser) {
            this.parser = new Parser()
        }
    }

    private async getLanguageConfig(ext: string) {
        const langKey = EXT_TO_LANG[ext]
        if (!langKey) return null

        // Skip languages with known WASM issues
        if (UNSUPPORTED_LANGUAGES.has(langKey)) {
            console.warn(`[tree-sitter] Skipping ${ext} - known runtime issue`)
            return null
        }

        try {
            const lang = await loadLang(langKey)
            
            // Normalize mapping for hyphenated names (e.g., c-sharp -> CSHARP)
            const queryName = `${langKey.replace(/-/g, '').toUpperCase()}_QUERIES`
            const query = (Queries as any)[queryName]
            
            if (!query && process.env.MIKK_DEBUG) {
                console.warn(`[tree-sitter] No query found for ${langKey} (looked for ${queryName})`)
            }
            
            return { lang, query }
        } catch (err) {
            console.warn(`[tree-sitter] Failed to prepare config for ${ext}:`, err)
            return null
        }
    }

    async isRuntimeAvailable(): Promise<boolean> {
        await this.init()
        return Boolean(this.parser)
    }

    async extract(filePath: string, content: string): Promise<ParsedFile> {
        await this.init()
        
        if (!this.parser) {
            console.warn('[tree-sitter] Parser not initialized')
            return this.buildEmptyFile(filePath, content, path.extname(filePath))
        }

        const ext = path.extname(filePath).toLowerCase()
        const config = await this.getLanguageConfig(ext)
        
        if (!config || !config.lang) {
            console.warn('[tree-sitter] Language not available for', ext)
            return this.buildEmptyFile(filePath, content, ext)
        }

        const result = await this.parseWithConfig(filePath, content, ext, config)
        
        return result
    }

    private async parseWithConfig(filePath: string, content: string, ext: string, config: any): Promise<ParsedFile> {
        try {
            this.parser!.setLanguage(config.lang)
        } catch (langErr) {
            console.warn(`[tree-sitter] Failed to set language for ${ext}:`, langErr instanceof Error ? langErr.message : String(langErr))
            return this.buildEmptyFile(filePath, content, ext)
        }
        
        let tree: any = null
        try {
            tree = this.parser!.parse(content)
            if (!tree || !tree.rootNode) {
                console.warn(`[tree-sitter] Parse returned empty tree for ${ext}`)
                return this.buildEmptyFile(filePath, content, ext)
            }
        } catch (parseErr) {
            console.warn(`[tree-sitter] Parse failed for ${ext}:`, parseErr instanceof Error ? parseErr.message : String(parseErr))
            return this.buildEmptyFile(filePath, content, ext)
        }

        let query: any = null
        try {
            query = config.lang.query(config.query)
        } catch (queryErr) {
            console.warn(`[tree-sitter] Query compilation failed for ${ext}:`, queryErr instanceof Error ? queryErr.message : String(queryErr))
            return this.buildEmptyFile(filePath, content, ext)
        }

        if (!query) {
            return this.buildEmptyFile(filePath, content, ext)
        }

        let matches: any[] = []
        try {
            matches = query.matches(tree.rootNode)
        } catch (matchErr) {
            console.warn(`[tree-sitter] Query execution failed for ${ext}:`, matchErr instanceof Error ? matchErr.message : String(matchErr))
            return this.buildEmptyFile(filePath, content, ext)
        }

        const functions: ParsedFunction[] = []
        const classesMap = new Map<string, ParsedClass>()
        const imports: ParsedImport[] = []
        const generics: ParsedGeneric[] = []
        const callEntries: Array<{ name: string; line: number }> = []
        const seenFnIds = new Set<string>()
        const routes: Array<{ method: string; path: string; handler: string; line: number }> = []

        for (const match of matches) {
            const captures: Record<string, any> = {}
            for (const c of match.captures) {
                captures[c.name] = c.node
            }

            // --- Routes ---
            if (captures['route.name'] || captures['call.name']) {
                let routeName = ''
                let routePath = '/'
                let method = 'GET'
                let routeLine = 0

                if (captures['route.name']) {
                    routeName = captures['route.name'].text ?? ''
                    routeLine = (captures['route.name'].startPosition?.row ?? 0) + 1
                } else if (captures['call.name']) {
                    routeName = captures['call.name'].text ?? ''
                    routeLine = (captures['call.name'].startPosition?.row ?? 0) + 1
                }

                if (routeName && /^(get|post|put|delete|patch|options|head|resource|apiResource|any)$/i.test(routeName)) {
                    method = routeName.toUpperCase()
                    
                    if (captures['route.path']) {
                        routePath = captures['route.path'].text?.replace(/['"]/g, '') || '/'
                    } else {
                        const args = findAllChildren(match.node, n => n.type === 'argument_list')
                        for (const arg of args) {
                            const str = findFirstChild(arg, n => n.type === 'string' || n.type === 'string_content')
                            if (str) {
                                routePath = str.text?.replace(/['"]/g, '') || '/'
                                break
                            }
                        }
                    }

                    if (routePath !== '/' && routePath !== '') {
                        routes.push({ method, path: routePath, handler: '', line: routeLine })
                    }
                }
            }

            // --- Base routes for class-level route ---
            if (captures['route.basepath']) {
                // Store base path for class-level routes
            }

            // --- Calls ---
            if (captures['call.name']) {
                const callNode = captures['call.name']
                const name = callNode?.text
                if (name && !/^(get|post|put|delete|patch|options|head|resource)$/i.test(name)) {
                    callEntries.push({
                        name,
                        line: (callNode.startPosition?.row ?? 0) + 1,
                    })
                }
                continue
            }

            // --- Imports ---
            if (captures['import.source']) {
                const src = captures['import.source'].text?.replace(/['"]/g, '') || ''
                imports.push({
                    source: src,
                    resolvedPath: '',
                    names: [],
                    isDefault: false,
                    isDynamic: false,
                })
                continue
            }

            // --- Generic types ---
            if (captures['generic.name'] || captures['generic.arg']) {
                const genArg = captures['generic.arg']?.text || ''
                if (genArg && !generics.some(g => g.name === genArg)) {
                    generics.push({
                        id: `generic:${filePath}:${genArg}`,
                        name: genArg,
                        type: 'type',
                        file: filePath,
                        startLine: (captures['generic.arg']?.startPosition?.row ?? 0) + 1,
                        endLine: (captures['generic.arg']?.endPosition?.row ?? 0) + 1,
                        isExported: false,
                        hash: '',
                    })
                }
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
                    const count = (this.nameCounter.get(fnName) ?? 0) + 1
                    this.nameCounter.set(fnName, count)

                    const fnId = count === 1 ? `fn:${filePath}:${fnName}` : `fn:${filePath}:${fnName}#${count}`
                    if (seenFnIds.has(fnId)) {
                        continue
                    }
                    seenFnIds.add(fnId)

                    const exported = isExportedByLanguage(ext, fnName, nodeText)
                    const isAsync = /\basync\b/.test(nodeText)

                    const returnType = extractReturnType(ext, defNode, nodeText)
                    const params = extractParamsFromNode(defNode)
                    const decorators = extractDecoratorsFromNode(defNode)

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
                        calls: [],
                        decorators: decorators.length > 0 ? decorators : undefined,
                        hash: hashContent(nodeText),
                        purpose: extractDocComment(content, startLine),
                        edgeCasesHandled: [],
                        errorHandling: [],
                        detailedLines: [],
                    })
                }
            }

            // --- Classes / Structs / Interfaces / Enums / Unions ---
            const classTypes = [
                'definition.class', 'definition.struct', 'definition.interface',
                'definition.enum', 'definition.union', 'definition.trait',
                'definition.record', 'definition.module', 'definition.namespace'
            ]
            
            for (const type of classTypes) {
                if (captures[type]) {
                    const nameNode = captures['name']
                    const defNode = captures[type]

                    if (nameNode && defNode) {
                        const clsName = nameNode.text
                        const startLine = defNode.startPosition.row + 1
                        const endLine = defNode.endPosition.row + 1
                        const nodeText = defNode.text ?? ''
                        const clsId = `class:${filePath}:${clsName}`

                        if (!classesMap.has(clsId)) {
                            classesMap.set(clsId, {
                                id: clsId,
                                name: clsName,
                                file: filePath,
                                startLine,
                                endLine,
                                methods: [],
                                properties: [],
                                isExported: isExportedByLanguage(ext, clsName, nodeText),
                                hash: hashContent(nodeText),
                            })
                        }
                    }
                }
            }
        }

        const unassignedCalls = assignCallsToFunctions(functions, callEntries)

        if (unassignedCalls.length > 0) {
            const lineCount = content.split('\n').length
            functions.push({
                id: `fn:${filePath}:<module>:1`,
                name: '<module>',
                file: filePath,
                startLine: 1,
                endLine: lineCount || 1,
                params: [],
                returnType: 'void',
                isExported: false,
                isAsync: false,
                calls: unassignedCalls.map(c => ({ name: c.name, line: c.line, type: 'function' })),
                hash: '',
                purpose: 'Module-level initialization code',
                edgeCasesHandled: [],
                errorHandling: [],
                detailedLines: [],
            })
        }

        const finalLang = extensionToLanguage(ext)
        linkMethodsToClasses(functions, classesMap)

        return {
            path: filePath,
            language: finalLang,
            functions,
            classes: Array.from(classesMap.values()),
            generics,
            imports,
            exports: functions.filter(f => f.isExported).map(f => ({
                name: f.name,
                type: 'function' as const,
                file: filePath,
            })),
            routes: routes.map(r => ({
                method: r.method,
                path: r.path,
                handler: r.handler || '',
                middlewares: [],
                file: filePath,
                line: r.line,
            })),
            variables: [],
            calls: [],
            hash: hashContent(content),
            parsedAt: Date.now(),
        }
    }

    async resolveImports(files: ParsedFile[], projectRoot: string): Promise<ParsedFile[]> {
        if (files.length === 0) return files

        const ext = path.extname(files[0].path).toLowerCase()
        const language = extensionToLanguage(ext)
        const resolver = new TreeSitterResolver(projectRoot, language)

        const allFiles = files.map(f => f.path)

        for (const file of files) {
            if (file.imports.length > 0) {
                const resolved = resolver.resolveAll(file.imports, file.path, allFiles)
                file.imports = resolved
            }
        }

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
            variables: [],
            calls: [],
            hash: hashContent(content),
            parsedAt: Date.now(),
        }
    }


}

// Register Tree-sitter for all supported languages (22+ languages)
const tsParser = new TreeSitterParser();
const registry = LanguageRegistry.getInstance();

const standardFeatures = {
    hasTypeSystem: true,
    hasGenerics: true,
    hasMacros: false,
    hasAnnotations: false,
    hasPatternMatching: true,
};

const functionalFeatures = {
    hasTypeSystem: true,
    hasGenerics: true,
    hasMacros: false,
    hasAnnotations: false,
    hasPatternMatching: false,
};

const scriptingFeatures = {
    hasTypeSystem: false,
    hasGenerics: false,
    hasMacros: false,
    hasAnnotations: false,
    hasPatternMatching: false,
};

// All 22+ supported languages
const languages: Array<{ name: string; extensions: string[]; features: typeof standardFeatures }> = [
    // JVM Languages
    { name: 'java', extensions: ['.java'], features: standardFeatures },
    { name: 'kotlin', extensions: ['.kt', '.kts'], features: standardFeatures },
    { name: 'scala', extensions: ['.scala', '.sc'], features: standardFeatures },
    
    // Apple Languages
    { name: 'swift', extensions: ['.swift'], features: standardFeatures },
    { name: 'dart', extensions: ['.dart'], features: standardFeatures },
    
    // C Family
    { name: 'c', extensions: ['.c', '.h'], features: standardFeatures },
    { name: 'cpp', extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.hxx', '.hh'], features: standardFeatures },
    { name: 'csharp', extensions: ['.cs'], features: standardFeatures },
    
    // Systems Languages
    { name: 'rust', extensions: ['.rs'], features: standardFeatures },
    { name: 'zig', extensions: ['.zig'], features: standardFeatures },
    
    // Web Languages
    { name: 'php', extensions: ['.php'], features: standardFeatures },
    { name: 'ruby', extensions: ['.rb'], features: scriptingFeatures },
    
    // Scripting Languages
    { name: 'python', extensions: ['.py', '.pyw'], features: scriptingFeatures },
    { name: 'lua', extensions: ['.lua'], features: scriptingFeatures },
    
    // Functional Languages
    { name: 'haskell', extensions: ['.hs'], features: functionalFeatures },
    { name: 'elixir', extensions: ['.ex', '.exs'], features: functionalFeatures },
    { name: 'clojure', extensions: ['.clj', '.cljs', '.cljc'], features: functionalFeatures },
    
    // .NET Family
    { name: 'fsharp', extensions: ['.fs', '.fsx', '.fsi'], features: standardFeatures },
    
    // ML Family
    { name: 'ocaml', extensions: ['.ml', '.mli'], features: functionalFeatures },
    
    // Other Languages
    { name: 'perl', extensions: ['.pl', '.pm'], features: scriptingFeatures },
    { name: 'r', extensions: ['.r', '.R'], features: scriptingFeatures },
    { name: 'julia', extensions: ['.jl'], features: scriptingFeatures },
    
    // Config/Special Purpose
    { name: 'sql', extensions: ['.sql'], features: scriptingFeatures },
    { name: 'terraform', extensions: ['.tf'], features: scriptingFeatures },
    { name: 'shell', extensions: ['.sh', '.bash', '.zsh'], features: scriptingFeatures },
];

for (const lang of languages) {
    registry.register({
        ...lang,
        treeSitterGrammar: `tree-sitter-${lang.name}`,
        extractor: tsParser,
        semanticFeatures: lang.features
    });
}

function extensionToLanguage(ext: string): ParsedFile['language'] {
    const langKey = EXT_TO_LANG[ext.toLowerCase()]
    if (!langKey) return 'unknown'
    return langKey as ParsedFile['language']
}

function extractReturnType(ext: string, defNode: any, nodeText: string): string {
    if (!defNode && !nodeText) return 'unknown'
    const text = nodeText || defNode?.text || ''

    // Try to find return type from AST node directly first
    if (defNode?.children) {
        const returnTypeNode = findFirstChild(defNode, n => 
            n.type === 'type' || 
            n.type === 'type_annotation' || 
            n.type === 'return_type' ||
            n.type === 'result_type'
        )
        if (returnTypeNode?.text) {
            return returnTypeNode.text.trim()
        }
    }

    // Arrow return type (Rust, TS, Go)
    const arrowMatch = text.match(/\)\s*(->|=>)\s*([^\s{;]+)/)
    if (arrowMatch && arrowMatch[3]) {
        const ret = arrowMatch[3].trim()
        if (ret && ret !== 'void' && ret !== 'null') return ret
    }

    // Go: "func foo() (int, error)" or "func foo() error"
    if (ext === '.go') {
        const goReturnTuple = text.match(/\)\s+(\([^)]+\))/)
        if (goReturnTuple && goReturnTuple[1]) return goReturnTuple[1].trim()
        const goReturn = text.match(/\)\s+([^\s{(]+)/)
        if (goReturn && goReturn[1]) return goReturn[1].trim()
    }

    // Java/C#/TypeScript: "public int foo(" - type before name
    const javaMatch = text.match(/(?:public|private|protected|internal)?\s*(?:static\s*)?(?:async\s*)?([\w<>[\],\s]+?)\s+\w+\s*\(/)
    if (javaMatch && javaMatch[1]) {
        const ret = javaMatch[1].trim()
        if (ret && ret !== 'void' && ret !== 'public' && ret !== 'private' && ret !== 'protected') {
            return ret
        }
    }

    // Python type annotations
    const pyMatch = text.match(/def\s+\w+.*?\)\s*->\s*([^\s:]+)/)
    if (pyMatch && pyMatch[1]) return pyMatch[1].trim()

    // Python: try to find return type from type comment
    const pyTypeComment = text.match(/#\s*type:\s*([^\n]+)/)
    if (pyTypeComment && pyTypeComment[1]) return pyTypeComment[1].trim()

    // PHP return type
    const phpMatch = text.match(/function\s+\w+.*?\)\s*:\s*(\??[\w\\]+)/)
    if (phpMatch && phpMatch[1]) return phpMatch[1].trim()

    // Ruby return type
    const rubyMatch = text.match(/def\s+\w+.*?\s+(->\s*[\w?]+)?/)
    if (rubyMatch && rubyMatch[1]) return rubyMatch[1].replace('->', '').trim()

    // C/C++ return type
    const cMatch = text.match(/^[\w*&\s]+\s+(\w+)\s*\(/m)
    if (cMatch && cMatch[1] && cMatch[1] !== 'if' && cMatch[1] !== 'while') {
        return cMatch[1]
    }

    // Rust: try to find return type from node directly
    if (ext === '.rs') {
        const rustMatch = text.match(/fn\s+\w+.*?\s*->\s*([^\s{]+)/)
        if (rustMatch && rustMatch[1]) return rustMatch[1].trim()
    }

    return 'unknown'
}

function extractDocComment(content: string, startLine: number): string {
    const lines = content.split('\n')
    const targetIdx = startLine - 2
    if (targetIdx < 0) return ''

    const prev = lines[targetIdx]?.trim() ?? ''
    for (const prefix of ['# ', '// ', '/// ']) {
        if (prev.startsWith(prefix)) return prev.slice(prefix.length).trim()
    }
    if (prev === '*/') {
        for (let i = targetIdx - 1; i >= 0; i--) {
            const line = lines[i].trim()
            const cleaned = line.replace(/^\*+\s?/, '')
            if (cleaned && !/^[ \-_=*]{3,}$/.test(cleaned)) return cleaned
        }
    }
    return ''
}

function linkMethodsToClasses(
    functions: ParsedFunction[],
    classesMap: Map<string, ParsedClass>
): void {
    const classes = Array.from(classesMap.values())
    if (classes.length === 0) return

    for (const fn of functions) {
        if (fn.name === '<module>' || fn.name.includes('.')) continue

        const isNestedInFunction = functions.some(f => 
            f.id !== fn.id && 
            fn.startLine >= f.startLine && fn.endLine <= f.endLine
        )
        if (isNestedInFunction) continue

        let bestCls: ParsedClass | null = null
        let bestRange = Infinity
        for (const cls of classes) {
            if (fn.startLine > cls.startLine && fn.endLine <= cls.endLine) {
                const range = cls.endLine - cls.startLine
                if (range < bestRange) {
                    bestCls = cls
                    bestRange = range
                }
            }
        }
        if (bestCls && !bestCls.methods.some(m => m.id === fn.id)) {
            bestCls.methods.push(fn)
        }
    }
}
