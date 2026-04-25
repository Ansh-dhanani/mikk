/* eslint-disable @typescript-eslint/no-explicit-any */
import * as path from 'node:path'
import { TreeSitterResolver } from './resolver.js'
import { LanguageRegistry } from '../language-registry.js'
import { createRequire } from 'node:module'
import { hashContent } from '../../hash/file-hasher.js'
import { makeIdAllocator, normalizeFsPath, toPosixPath } from '../../utils/id.js'
import { BaseExtractor } from '../base-extractor.js'
import type { ExtractOptions } from '../base-extractor.js'
import type { ParsedFile, ParsedFunction, ParsedClass, ParsedParam, ParsedImport, ParsedGeneric } from '../types.js'
import * as Queries from './queries.js'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Worker, isMainThread, parentPort } from 'node:worker_threads'
import * as os from 'node:os'
import { EventEmitter } from 'node:events'

let _filename = '';
let _dirname = '';
try {
    _filename = fileURLToPath(import.meta.url);
    _dirname = path.dirname(_filename);
} catch {
    _filename = typeof __filename !== 'undefined' ? __filename : process.cwd();
    _dirname = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
}

if (process.env.MIKK_DEBUG) {
    console.warn(`[tree-sitter] Module loaded. __filename: ${_filename}`);
}

const getRequire = (): any => {
    try {
        if (typeof require !== 'undefined') return require
        const reqPath = (typeof import.meta !== 'undefined' && import.meta.url) ? import.meta.url : _filename || process.cwd() + '/index.js';
        const req = createRequire(reqPath)
        return req
    } catch {
        const fallback = (pkg: string) => {
            console.error(`Cannot require ${pkg} - environment not supported`)
            return null
        };
        (fallback as any).resolve = (pkg: string) => pkg
        return fallback
    }
}

const _require: any = getRequire()

// Languages with known web-tree-sitter WASM runtime issues
const UNSUPPORTED_LANGUAGES = new Set([
    'ruby',   // "undefined is not an object (evaluating 'r.apply')"
    'dart',   // Incompatible language version 15 (expects 13-14)
    'objc',   // Query fails: e.length undefined
    'elm',    // WASM out of bounds memory access
    'css',    // No query captures working
    'json',   // No query captures working
])

const LANG_WASM_MAP: Record<string, string> = {
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
    javascript: 'tree-sitter-wasms/out/tree-sitter-javascript.wasm',
    typescript: 'tree-sitter-wasms/out/tree-sitter-typescript.wasm',
    json: 'tree-sitter-wasms/out/tree-sitter-json.wasm',
    yaml: 'tree-sitter-wasms/out/tree-sitter-yaml.wasm',
    toml: 'tree-sitter-wasms/out/tree-sitter-toml.wasm',
    html: 'tree-sitter-wasms/out/tree-sitter-html.wasm',
    css: 'tree-sitter-wasms/out/tree-sitter-css.wasm',
    objc: 'tree-sitter-wasms/out/tree-sitter-objc.wasm',
    elm: 'tree-sitter-wasms/out/tree-sitter-elm.wasm',
    solidity: 'tree-sitter-wasms/out/tree-sitter-solidity.wasm',
}

const EXT_TO_LANG: Record<string, string> = {
    '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
    '.ts': 'typescript', '.tsx': 'typescript', '.vue': 'typescript',
    '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml', '.xml': 'xml',
    '.html': 'html', '.css': 'css', '.scss': 'css', '.sass': 'css', '.less': 'css',
    '.sol': 'solidity', '.elm': 'elm',
    '.py': 'python', '.pyw': 'python',
    '.java': 'java',
    '.kt': 'kotlin', '.kts': 'kotlin',
    '.scala': 'scala', '.sc': 'scala',
    '.swift': 'swift',
    '.dart': 'dart',
    '.c': 'c', '.h': 'c',
    '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp', '.hxx': 'cpp', '.hh': 'cpp',
    '.cs': 'csharp',
    '.go': 'go',
    '.rs': 'rust',
    '.zig': 'zig',
    '.php': 'php',
    '.rb': 'ruby',
    '.ex': 'elixir', '.exs': 'elixir',
    '.ml': 'ocaml', '.mli': 'ocaml',
    '.lua': 'lua',
    '.sh': 'bash', '.bash': 'bash', '.zsh': 'bash',
    '.m': 'objc', '.mm': 'objc',
}

let Parser: any = null
let Language: any = null
let initialized = false
let parserInitPromise: Promise<void> | null = null
const langCache = new Map<string, any>()

async function ensureParser(): Promise<void> {
    if (initialized) return
    if (parserInitPromise) return parserInitPromise

    parserInitPromise = (async () => {
        try {
            const ParserModule = _require('web-tree-sitter')
            await ParserModule.init({
                locateFile: (name: string) => {
                    try {
                        return _require.resolve(path.join('web-tree-sitter', name))
                    } catch {
                        return path.join(_dirname, '..', '..', '..', 'node_modules', 'web-tree-sitter', name)
                    }
                },
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

// ─── Language-aware export detection ────────────────────────────────────────

function isExportedByLanguage(ext: string, name: string, nodeText: string): boolean {
    switch (ext) {
        case '.py':
            return !name.startsWith('_')
        case '.java':
            return /\bpublic\b/.test(nodeText)
        case '.kt': case '.kts':
            return !/\b(?:private|internal|protected)\b/.test(nodeText)
        case '.swift':
            return !/\b(?:private|fileprivate)\b/.test(nodeText)
        case '.cs':
            return /\bpublic\b/.test(nodeText)
        case '.go':
            return name.length > 0 && name[0] === name[0].toUpperCase() && /[A-Z]/.test(name[0])
        case '.rs':
            return /\bpub\b/.test(nodeText)
        case '.php':
            return !/\b(?:private|protected)\b/.test(nodeText)
        case '.rb':
            return !name.startsWith('private_') && !name.startsWith('protected_')
        case '.c': case '.h':
            return true
        case '.cpp': case '.cc': case '.hpp': case '.hh':
            return !/\b(?:private|protected)\b/.test(nodeText)
        default:
            return false
    }
}

// ─── AST helpers ─────────────────────────────────────────────────────────────

function findFirstChild(node: any, predicate: (n: any) => boolean): any {
    const count = node.childCount
    for (let i = 0; i < count; i++) {
        const child = node.child(i)
        if (predicate(child)) return child
    }
    return null
}

function findAllChildren(node: any, predicate: (n: any) => boolean): any[] {
    const results: any[] = []
    const count = node.childCount
    for (let i = 0; i < count; i++) {
        const child = node.child(i)
        if (predicate(child)) results.push(child)
        results.push(...findAllChildren(child, predicate))
    }
    return results
}

function extractParamsFromNode(defNode: any): ParsedParam[] {
    const params: ParsedParam[] = []
    if (!defNode) return params

    const PARAM_NODE_TYPES = new Set([
        'parameter', 'formal_parameter', 'simple_parameter',
        'variadic_parameter', 'typed_parameter', 'typed_default_parameter',
        'keyword_argument', 'field_declaration', 'required_parameter', 'optional_parameter',
    ])

    const walk = (node: any) => {
        if (!node) return
        if (PARAM_NODE_TYPES.has(node.type)) {
            const identNode = findFirstChild(node, n =>
                n.type === 'identifier' || n.type === 'name' || n.type === 'simple_identifier',
            )
            const typeNode = findFirstChild(node, n =>
                n.type === 'type' || n.type === 'type_annotation' ||
                n.type === 'type_identifier' || n.type === 'predefined_type' ||
                n.type === 'type_reference',
            )
            const pName = identNode?.text ?? node.text ?? ''
            const pType = typeNode?.text ?? 'any'
            if (pName && !params.some(p => p.name === pName)) {
                params.push({ name: pName, type: pType, optional: /\?/.test(pType) })
            }
            return
        }

        const count = node.childCount
        for (let i = 0; i < count; i++) {
            walk(node.child(i))
        }
    }

    walk(defNode)
    return params
}

function extractDecoratorsFromNode(defNode: any): string[] {
    const decorators: string[] = []
    if (!defNode) return decorators

    const count = defNode.childCount
    for (let i = 0; i < count; i++) {
        const child = defNode.child(i)
        if (child.type === 'decorator' || child.type === 'attribute' || child.type === 'annotation') {
            const text = child.text ?? ''
            decorators.push(text.replace(/^@/, '').trim())
        }
    }
    return decorators
}

function assignCallsToFunctions(
    functions: ParsedFunction[],
    callEntries: Array<{ name: string; line: number }>,
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
                best.calls.push({ name, line, type: 'function' as const })
            }
        } else {
            unassigned.push({ name, line })
        }
    }
    return unassigned
}

function extractReturnType(ext: string, defNode: any, nodeText: string): string {
    if (!defNode && !nodeText) return 'unknown'
    const text = nodeText || defNode?.text || ''

    if (defNode && defNode.childCount > 0) {
        const rtn = findFirstChild(defNode, (n: any) =>
            n.type === 'type' ||
            n.type === 'type_annotation' ||
            n.type === 'return_type' ||
            n.type === 'result_type' ||
            n.type === 'function_result' ||
            n.type === 'type_reference',
        )
        if (rtn?.text) {
            return rtn.text.replace(/^[\s:>-]+/, '').trim() || 'unknown'
        }
    }

    if (ext === '.py') {
        const m = text.match(/def\s+\w+[^)]*\)\s*->\s*([\w[], |.'"`]+?)\s*:/)
        if (m?.[1]) return m[1].trim()
        const tc = text.match(/#\s*type:\s*.*?->\s*([^\n]+)/)
        if (tc?.[1]) return tc[1].trim()
        return 'unknown'
    }

    if (ext === '.rs') {
        const m = text.match(/fn\s+\w+[\w<>, ]*\([^)]*\)\s*->\s*([\w:<>, &'[\]]+)/)
        if (m?.[1]) return m[1].trim()
        return 'unknown'
    }

    if (ext === '.go') {
        const tuple = text.match(/\)\s+(\([^)]+\))/)
        if (tuple?.[1]) return tuple[1].trim()
        const single = text.match(/\)\s+([\w.*[\]]+)(?:\s*\{|$)/)
        if (single?.[1] && single[1] !== '{') return single[1].trim()
        return 'unknown'
    }

    const arrowM = text.match(/\)\s*(?:->|=>)\s*([\w<>[ \], |?&':.\s]+?)(?:\s*[\n{;]|$)/)
    if (arrowM?.[1]) {
        const ret = arrowM[1].trim()
        if (ret && ret !== 'void' && ret !== 'null') return ret
    }

    const colonM = text.match(/\)\s*:\s*([\w<>[ \], |?&.'`"\\]+?)(?:\s*[\n{;=>]|$)/)
    if (colonM?.[1]) {
        const ret = colonM[1].trim()
        const skipWords = new Set(['void', 'public', 'private', 'protected', 'internal', 'static', 'abstract'])
        if (ret && !skipWords.has(ret)) return ret
    }

    const javaM = text.match(
        /(?:(?:public|private|protected|internal|static|final|virtual|override|async|sealed|abstract|extern|readonly)\s+)+([\w<>[ \], .?]+?)\s+\w+\s*\(/,
    )
    if (javaM?.[1]) {
        const ret = javaM[1].trim()
        const skip = new Set(['void', 'public', 'private', 'protected', 'internal', 'static',
            'final', 'virtual', 'override', 'async', 'abstract', 'new', 'sealed', 'extern', 'const'])
        if (ret && !skip.has(ret)) return ret
    }
    const cFallback = text.match(/^([\w*&[\]]+)\s+\w+\s*\(/m)
    if (cFallback?.[1]) {
        const ret = cFallback[1].trim()
        const skip = new Set(['if', 'for', 'while', 'switch', 'return', 'new', 'class',
            'void', 'interface', 'enum', 'struct', 'namespace', 'template'])
        if (ret && !skip.has(ret.toLowerCase())) return ret
    }

    const phpM = text.match(/function\s+\w+[^)]*\)\s*:\s*(\??[\w\\|]+)/)
    if (phpM?.[1]) return phpM[1].trim()

    return 'unknown'
}

function extractDocComment(content: string, startLine: number): string {
    const lines = content.split('\n')
    const targetIdx = startLine - 2
    if (targetIdx < 0) return ''

    const prev = lines[targetIdx]?.trim() ?? ''
    for (const prefix of ['# ', '// ', '/// ', '-- ', '; ']) {
        if (prev.startsWith(prefix)) return prev.slice(prefix.length).trim()
    }
    if (prev === '*/') {
        for (let i = targetIdx - 1; i >= 0; i--) {
            const line = lines[i].trim()
            const cleaned = line.replace(/^\*+\s?/, '')
            if (cleaned && !/^[ \-_=*]{3,}$/.test(cleaned)) return cleaned
        }
    }
    if (prev.startsWith('"""') || prev.startsWith("'''")) {
        return prev.replace(/^["']{3}|["']{3}$/g, '').trim()
    }
    return ''
}

function linkMethodsToClasses(
    functions: ParsedFunction[],
    classesMap: Map<string, ParsedClass>,
): void {
    const classes = Array.from(classesMap.values())
    if (classes.length === 0) return

    for (const fn of functions) {
        if (fn.name === '<module>' || fn.name.includes('.')) continue

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

function extensionToLanguage(ext: string): ParsedFile['language'] {
    const langKey = EXT_TO_LANG[ext.toLowerCase()]
    if (!langKey) return 'unknown'
    return langKey as ParsedFile['language']
}

// ─── Main extractor class ────────────────────────────────────────────────────

export class TreeSitterParser extends BaseExtractor {
    public static instance: TreeSitterParser | null = null
    private static sharedParser: any = null
    private static initialized = false
    public static pool: ParserWorker[] = []
    private static poolSize = Math.max(2, Math.min(os.cpus().length, 8))
    private static taskQueue: Array<{ id: number, filePath: string, content: string, options?: ExtractOptions, resolve: (...args: any[]) => any, reject: (...args: any[]) => any }> = []
    private static nextTaskId = 0

    constructor() {
        super()
        TreeSitterParser.instance = this
    }

    getSupportedExtensions(): string[] {
        return Object.keys(EXT_TO_LANG)
    }

    private async init() {
        if (!isMainThread) {
            await ensureParser()
            if (!TreeSitterParser.sharedParser && Parser) {
                TreeSitterParser.sharedParser = new Parser()
            }
        }
    }

    private async getLanguageConfig(ext: string) {
        const langKey = EXT_TO_LANG[ext]
        if (!langKey) return null
        if (UNSUPPORTED_LANGUAGES.has(langKey)) return null

        try {
            const lang = await loadLang(langKey)
            const queryName = `${langKey.replace(/-/g, '').toUpperCase()}_QUERIES`
            const query = (Queries as any)[queryName]
            if (!query && process.env.MIKK_DEBUG) {
                console.warn(`[tree-sitter] No query found for ${langKey} (looked for ${queryName})`)
            }
            return { lang, query }
        } catch (err) {
            if (process.env.MIKK_DEBUG) {
                console.warn(`[tree-sitter] Failed to prepare config for ${ext}:`, err)
            }
            return null
        }
    }

    async isRuntimeAvailable(): Promise<boolean> {
        await this.init()
        return typeof Parser !== 'undefined'
    }

    async extract(filePath: string, content: string, options?: ExtractOptions): Promise<ParsedFile> {
        if (!isMainThread) {
            return this._extractLocal(filePath, content, options)
        }
        return this.delegateToWorker(filePath, content, options)
    }

    private async delegateToWorker(filePath: string, content: string, options?: ExtractOptions): Promise<ParsedFile> {
        return new Promise((resolve, reject) => {
            const taskId = TreeSitterParser.nextTaskId++
            TreeSitterParser.taskQueue.push({ id: taskId, filePath, content, options, resolve, reject })
            this.processQueue()
        })
    }

    public processQueue() {
        if (TreeSitterParser.taskQueue.length === 0) return

        let worker = TreeSitterParser.pool.find(w => w.status === 'idle')

        if (!worker && TreeSitterParser.pool.length < TreeSitterParser.poolSize) {
            worker = new ParserWorker()
            TreeSitterParser.pool.push(worker)
        }

        if (worker) {
            const task = TreeSitterParser.taskQueue.shift()!
            worker.run(task)
        }
    }

    private async _extractLocal(filePath: string, content: string, options?: ExtractOptions): Promise<ParsedFile> {
        await this.init()
        if (typeof Parser === 'undefined') return this.buildEmptyFile(filePath, content, path.extname(filePath))

        const depth = options?.depth ?? 'full'
        const ext = path.extname(filePath).toLowerCase()

        if (depth === 'metadata-only') {
            return this.buildEmptyFile(filePath, content, ext)
        }

        const config = await this.getLanguageConfig(ext)
        if (!config?.lang) return this.buildEmptyFile(filePath, content, ext)

        return this.parseWithConfig(filePath, content, ext, config, options)
    }

    private async parseWithConfig(
        filePath: string,
        content: string,
        ext: string,
        config: any,
        options?: ExtractOptions
    ): Promise<ParsedFile> {
        const parser = TreeSitterParser.sharedParser
        if (!parser) return this.buildEmptyFile(filePath, content, ext)

        try {
            parser.setLanguage(config.lang)
        } catch {
            return this.buildEmptyFile(filePath, content, ext)
        }

        let tree: any = null
        let query: any = null

        try {
            try {
                tree = parser.parse(content)
                if (!tree?.rootNode) return this.buildEmptyFile(filePath, content, ext)
            } catch {
                return this.buildEmptyFile(filePath, content, ext)
            }

            if (!config.query) return this.buildEmptyFile(filePath, content, ext)

            try {
                query = config.lang.query(config.query)
            } catch {
                return this.buildEmptyFile(filePath, content, ext)
            }

            let matches: any[] = []
            try {
                matches = query.matches(tree.rootNode)
            } catch {
                return this.buildEmptyFile(filePath, content, ext)
            }

            return this.processMatches(filePath, content, ext, matches, options)
        } finally {
            if (query && typeof query.delete === 'function') query.delete()
            if (tree && typeof tree.delete === 'function') tree.delete()
        }
    }

    private processMatches(
        filePath: string,
        content: string,
        ext: string,
        matches: any[],
        options?: ExtractOptions
    ): ParsedFile {
        const depth = options?.depth ?? 'full'
        try {
            // Fresh allocator per file — tracks duplicates, normalizes path
            const allocateId = makeIdAllocator(filePath)
            const canonicalPath = normalizeFsPath(filePath)
            const displayPath = toPosixPath(filePath)

            const functions: ParsedFunction[] = []
            const classesMap = new Map<string, ParsedClass>()
            const imports: ParsedImport[] = []
            const generics: ParsedGeneric[] = []
            const callEntries: Array<{ name: string; line: number }> = []
            const routes: Array<{ method: string; path: string; handler: string; line: number }> = []

            const HTTP_ROUTE_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'resource', 'apiresource', 'any'])

            for (const match of matches) {
                const captures: Record<string, any> = {}
                for (const c of match.captures) {
                    captures[c.name] = c.node
                }

                // --- Routes ---
                if (captures['route.name'] || captures['call.name']) {
                    const routeNameNode = captures['route.name'] ?? captures['call.name']
                    const routeName = routeNameNode?.text ?? ''
                    const routeLine = (routeNameNode?.startPosition?.row ?? 0) + 1

                    if (routeName && HTTP_ROUTE_METHODS.has(routeName.toLowerCase())) {
                        let routePath = '/'
                        if (captures['route.path']) {
                            routePath = captures['route.path'].text?.replace(/['"]/g, '') || '/'
                        } else {
                            const argLists = findAllChildren(match.node ?? routeNameNode?.parent, (n: any) => n.type === 'argument_list')
                            for (const arg of argLists) {
                                const str = findFirstChild(arg, (n: any) => n.type === 'string' || n.type === 'string_content')
                                if (str) {
                                    routePath = str.text?.replace(/['"]/g, '') || '/'
                                    break
                                }
                            }
                        }
                        if (routePath && routePath !== '/') {
                            routes.push({ method: routeName.toUpperCase(), path: routePath, handler: '', line: routeLine })
                        }
                    }
                }

                // --- Calls ---
                if (captures['call.name']) {
                    const callNode = captures['call.name']
                    const name = callNode?.text
                    if (name && !HTTP_ROUTE_METHODS.has(name.toLowerCase())) {
                        callEntries.push({ name, line: (callNode.startPosition?.row ?? 0) + 1 })
                    }
                    continue
                }

                // --- Imports ---
                if (captures['import.source']) {
                    const src = captures['import.source'].text?.replace(/['"]/g, '') || ''
                    if (src) {
                        imports.push({ source: src, resolvedPath: '', names: [], isDefault: false, isDynamic: false })
                    }
                    continue
                }

                // --- Functions / Methods ---
                if (captures['definition.function'] || captures['definition.method']) {
                    const nameNode = captures['name']
                    const defNode = captures['definition.function'] ?? captures['definition.method']

                    if (nameNode && defNode) {
                        const fnName = nameNode.text
                        const startLine = defNode.startPosition.row + 1
                        const endLine = defNode.endPosition.row + 1
                        const nodeText = defNode.text ?? ''
                        const fnId = allocateId('fn', fnName)

                        // Collect decorators from @decorator capture (Python decorated_definition)
                        // and from AST child nodes (Java/TS annotations)
                        const capturedDecorators: string[] = []
                        if (captures['decorator']) {
                            const dec = captures['decorator'].text ?? ''
                            if (dec) capturedDecorators.push(dec.replace(/^@/, '').trim())
                        }
                        const astDecorators = extractDecoratorsFromNode(defNode)
                        const allDecorators = [...new Set([...capturedDecorators, ...astDecorators])]

                        functions.push({
                            id: fnId,
                            name: fnName,
                            file: displayPath,
                            startLine,
                            endLine,
                            params: extractParamsFromNode(defNode),
                            returnType: extractReturnType(ext, defNode, nodeText),
                            isExported: isExportedByLanguage(ext, fnName, nodeText),
                            isAsync: /\basync\b/.test(nodeText),
                            calls: depth === 'full' ? [] : [], // Tree-sitter currently collects calls in processMatches loop
                            hash: hashContent(nodeText),
                            purpose: extractDocComment(content, startLine),
                            edgeCasesHandled: [],
                            errorHandling: [],
                            detailedLines: [],
                            decorators: allDecorators.length > 0 ? allDecorators : undefined,
                        })
                    }
                }

                // --- Classes / Structs / Interfaces / Enums ---
                const CLASS_CAPTURE_TYPES = [
                    'definition.class', 'definition.struct', 'definition.interface',
                    'definition.enum', 'definition.union', 'definition.trait',
                    'definition.record', 'definition.module', 'definition.namespace',
                ]
                for (const capType of CLASS_CAPTURE_TYPES) {
                    if (captures[capType]) {
                        const nameNode = captures['name']
                        const defNode = captures[capType]
                        if (nameNode && defNode) {
                            const clsName = nameNode.text
                            const clsId = allocateId('class', clsName)
                            if (!classesMap.has(clsId)) {
                                const nodeText = defNode.text ?? ''
                                classesMap.set(clsId, {
                                    id: clsId,
                                    name: clsName,
                                    file: displayPath,
                                    startLine: defNode.startPosition.row + 1,
                                    endLine: defNode.endPosition.row + 1,
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

            // Assign orphan calls to a module-level synthetic function
            const unassignedCalls = assignCallsToFunctions(functions, callEntries)
            if (unassignedCalls.length > 0) {
                const lineCount = content.split('\n').length
                functions.push({
                    id: allocateId('fn', '<module>'),
                    name: '<module>',
                    file: displayPath,
                    startLine: 1,
                    endLine: lineCount || 1,
                    params: [],
                    returnType: 'void',
                    isExported: false,
                    isAsync: false,
                    calls: unassignedCalls.map(c => ({ name: c.name, line: c.line, type: 'function' as const })),
                    hash: '',
                    purpose: 'Module-level initialization code',
                    edgeCasesHandled: [],
                    errorHandling: [],
                    detailedLines: [],
                })
            }

            linkMethodsToClasses(functions, classesMap)

            return {
                path: displayPath,
                language: extensionToLanguage(ext),
                functions,
                classes: Array.from(classesMap.values()),
                generics,
                imports,
                exports: functions
                    .filter(f => f.isExported)
                    .map(f => ({ name: f.name, type: 'function' as const, file: displayPath })),
                routes: routes.map(r => ({
                    method: r.method,
                    path: r.path,
                    handler: r.handler || '',
                    middlewares: [],
                    file: displayPath,
                    line: r.line,
                })),
                variables: [],
                calls: [],
                hash: hashContent(content),
                parsedAt: Date.now(),
            }
        } catch (err) {
            if (process.env.MIKK_DEBUG) {
                console.warn(`[tree-sitter] Error processing matches for ${filePath}:`, err)
            }
            return this.buildEmptyFile(filePath, content, ext)
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
                file.imports = resolver.resolveAll(file.imports, file.path, allFiles)
            }
        }
        return files
    }

    private buildEmptyFile(filePath: string, content: string, ext: string): ParsedFile {
        return {
            path: toPosixPath(filePath),
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

// ─── Worker implementation ────────────────────────────────────────────────────

class ParserWorker {
    public status: 'idle' | 'busy' | 'dead' = 'idle'
    private worker: Worker | null = null
    private currentTask: { resolve: (...args: any[]) => any, reject: (...args: any[]) => any } | null = null

    constructor() {
        this.spawn()
    }

    private spawn() {
        try {
            const isTs = _filename.endsWith('.ts')

            if (process.env.MIKK_DEBUG) {
                console.warn(`[tree-sitter] Spawning worker: ${_filename} (isTs: ${isTs})`)
            }

            this.worker = new Worker(_filename, {
                execArgv: isTs ? ['--import', 'tsx'] : undefined
            })
            this.status = 'idle'

            this.worker.on('message', (msg) => {
                if (msg.type === 'result') {
                    this.currentTask?.resolve(msg.result)
                    this.onTaskComplete()
                } else if (msg.type === 'error') {
                    this.currentTask?.reject(new Error(msg.error))
                    this.onTaskComplete()
                }
            })

            this.worker.on('error', (err) => {
                this.currentTask?.reject(err)
                this.terminate()
            })

            this.worker.on('exit', () => {
                this.terminate()
            })
        } catch (err) {
            console.error('[tree-sitter] Failed to spawn worker:', err)
            this.status = 'dead'
        }
    }

    public run(task: { id: number, filePath: string, content: string, options?: ExtractOptions, resolve: (...args: any[]) => any, reject: (...args: any[]) => any }) {
        if (!this.worker || this.status !== 'idle') return

        this.status = 'busy'
        this.currentTask = { resolve: task.resolve, reject: task.reject }
        this.worker.postMessage({ type: 'extract', id: task.id, filePath: task.filePath, content: task.content, options: task.options })
    }

    private onTaskComplete() {
        this.status = 'idle'
        this.currentTask = null
        // Process the next queued task immediately
        TreeSitterParser.instance?.processQueue()
    }

    public terminate() {
        this.status = 'dead'
        if (this.worker) {
            this.worker.terminate()
            this.worker = null
        }

        const idx = TreeSitterParser.pool.indexOf(this)
        if (idx !== -1) {
            TreeSitterParser.pool.splice(idx, 1)
        }

        TreeSitterParser.instance?.processQueue()
    }
}

// ─── Language registry setup ──────────────────────────────────────────────────

const tsParser = new TreeSitterParser()
const registry = LanguageRegistry.getInstance()

const standardFeatures = { hasTypeSystem: true, hasGenerics: true, hasMacros: false, hasAnnotations: true, hasPatternMatching: true }
const functionalFeatures = { hasTypeSystem: true, hasGenerics: true, hasMacros: false, hasAnnotations: false, hasPatternMatching: true }
const scriptingFeatures = { hasTypeSystem: false, hasGenerics: false, hasMacros: false, hasAnnotations: false, hasPatternMatching: false }

const languages: Array<{ name: string; extensions: string[]; features: typeof standardFeatures }> = [
    { name: 'java', extensions: ['.java'], features: standardFeatures },
    { name: 'kotlin', extensions: ['.kt', '.kts'], features: standardFeatures },
    { name: 'scala', extensions: ['.scala', '.sc'], features: standardFeatures },
    { name: 'swift', extensions: ['.swift'], features: standardFeatures },
    { name: 'dart', extensions: ['.dart'], features: standardFeatures },
    { name: 'c', extensions: ['.c', '.h'], features: standardFeatures },
    { name: 'cpp', extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.hxx', '.hh'], features: standardFeatures },
    { name: 'csharp', extensions: ['.cs'], features: standardFeatures },
    { name: 'go', extensions: ['.go'], features: standardFeatures },
    { name: 'rust', extensions: ['.rs'], features: standardFeatures },
    { name: 'zig', extensions: ['.zig'], features: standardFeatures },
    { name: 'php', extensions: ['.php'], features: standardFeatures },
    { name: 'ruby', extensions: ['.rb'], features: scriptingFeatures },
    { name: 'python', extensions: ['.py', '.pyw'], features: scriptingFeatures },
    { name: 'lua', extensions: ['.lua'], features: scriptingFeatures },
    { name: 'elixir', extensions: ['.ex', '.exs'], features: functionalFeatures },
    { name: 'ocaml', extensions: ['.ml', '.mli'], features: functionalFeatures },
    { name: 'shell', extensions: ['.sh', '.bash', '.zsh'], features: scriptingFeatures },
    { name: 'sql', extensions: ['.sql'], features: scriptingFeatures },
    { name: 'terraform', extensions: ['.tf'], features: scriptingFeatures },
]

for (const lang of languages) {
    registry.register({
        ...lang,
        treeSitterGrammar: `tree-sitter-${lang.name}`,
        extractor: tsParser,
        semanticFeatures: lang.features,
    })
}

// ─── Worker execution ────────────────────────────────────────────────────────

if (!isMainThread && parentPort) {
    const workerParser = new TreeSitterParser()
    parentPort.on('message', async (message) => {
        if (message.type === 'extract') {
            const { filePath, content, options } = message
            try {
                const result = await (workerParser as any)._extractLocal(filePath, content, options)
                parentPort!.postMessage({ type: 'result', id: message.id, result })
            } catch (err: any) {
                parentPort!.postMessage({ type: 'error', id: message.id, error: err.message })
            }
        } else if (message.type === 'exit') {
            process.exit(0)
        }
    })
}
