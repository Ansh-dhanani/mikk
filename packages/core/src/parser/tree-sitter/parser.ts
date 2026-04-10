/* eslint-disable @typescript-eslint/no-explicit-any */
import * as path from 'node:path'
import { TreeSitterResolver } from './resolver.js'
import { LanguageRegistry } from '../language-registry.js'
import { createRequire } from 'node:module'
import { hashContent } from '../../hash/file-hasher.js'
import { BaseExtractor } from '../base-extractor.js'
import type { ParsedFile, ParsedFunction, ParsedClass, ParsedParam, ParsedImport, ParsedGeneric } from '../types.js'
import * as Queries from './queries.js'

const getRequire = () => {
    if (typeof require !== 'undefined') return require
    return createRequire(import.meta.url)
}
const _require = getRequire()

let Parser: any = null
let Language: any = null
let initialized = false
let initPromise: Promise<boolean> | null = null

function isValidTreeSitterModule(module: any): boolean {
    if (!module) return false
    if (module.HEAP8 || module.HEAP16 || module.HEAP32) return false
    const hasInit = typeof module.init === 'function'
    const hasLanguage = typeof module.Language !== 'undefined'
    const hasDefault = module.default?.Language
    const isFunctionWithInit = typeof module === 'function' && module.prototype?.init
    const isFunctionWithLanguage = typeof module === 'function' && module.prototype?.Language
    return hasInit || hasLanguage || !!hasDefault || isFunctionWithInit || isFunctionWithLanguage
}

async function ensureInitialized(): Promise<boolean> {
    if (initialized && Language) return true
    
    const attemptInit = async (): Promise<boolean> => {
        try {
            let ParserModule = _require('web-tree-sitter')
            if (!ParserModule) return false
            
            if (typeof ParserModule === 'function') {
                if (ParserModule.prototype?.Language) {
                    Language = ParserModule.prototype.Language
                    Parser = ParserModule
                    initialized = true
                    return true
                }
                if (ParserModule.prototype?.init) {
                    await ParserModule.prototype.init()
                    Language = ParserModule.prototype.Language
                    Parser = ParserModule
                    initialized = !!Language
                    return initialized
                }
            }
            
            if (!isValidTreeSitterModule(ParserModule)) {
                ParserModule = ParserModule?.default || ParserModule
            }
            
            if (!isValidTreeSitterModule(ParserModule)) {
                const moduleCache = _require.cache
                const keys = Object.keys(moduleCache || {})
                for (const key of keys) {
                    if (key.includes('web-tree-sitter')) {
                        delete moduleCache[key]
                    }
                }
                ParserModule = _require('web-tree-sitter')
                if (typeof ParserModule === 'function' && ParserModule.prototype?.Language) {
                    Language = ParserModule.prototype.Language
                    Parser = ParserModule
                    initialized = true
                    return true
                }
                if (!isValidTreeSitterModule(ParserModule)) {
                    ParserModule = ParserModule?.default || ParserModule
                }
            }
            
            if (!isValidTreeSitterModule(ParserModule)) {
                return false
            }
            
            Parser = ParserModule
            
            if (typeof ParserModule.init === 'function') {
                await ParserModule.init()
                Language = ParserModule.Language
                initialized = !!Language
            } else if (ParserModule.default?.Language) {
                Language = ParserModule.default.Language
                initialized = true
            } else if (ParserModule.Language) {
                Language = ParserModule.Language
                initialized = true
            }
            
            return initialized && !!Language
        } catch (err) {
            console.warn('[tree-sitter] Initialization failed:', err)
            return false
        }
    }
    
    if (initPromise) {
        await initPromise.catch(() => {})
        if (!initialized && Language) {
            initPromise = attemptInit()
            const retryResult = await initPromise
            return retryResult
        }
        return initialized && !!Language
    }
    
    initPromise = attemptInit()
    const result = await initPromise
    return result
}

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
        return ['.py', '.java', '.kt', '.kts', '.swift', '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx', '.hh', '.cs', '.go', '.rs', '.php', '.rb']
    }

    private async init() {
        if (this.parser) return
        const ready = await ensureInitialized()
        if (ready && Parser) {
            this.parser = new Parser()
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
        this.parser!.setLanguage(config.lang)
        
        let tree: any = null
        try {
            tree = this.parser!.parse(content)
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

    private async loadLang(name: string): Promise<any> {
        if (this.languages.has(name)) return this.languages.get(name)
        if (this.wasmLoadError) return null

        try {
            const nameForFile = name.replace(/-/g, '_')
            
            // Try multiple possible WASM locations, including parent directories and siblings for monorepos
            const baseDirs = new Set<string>()
            baseDirs.add(process.cwd())
            
            // Add parent directories (up to 4 levels) for monorepo setups
            let current = process.cwd()
            let parentDir = ''
            for (let i = 0; i < 4; i++) {
                parentDir = path.dirname(current)
                if (parentDir === current) break
                baseDirs.add(parentDir)
                baseDirs.add(path.join(parentDir, 'node_modules'))
                
                // Also check sibling directories in the parent for monorepo setups
                // Also check subdirs like Mesh/packages/core/node_modules
                try {
                    const fs = await import('node:fs')
                    const entries = fs.readdirSync(parentDir, { withFileTypes: true })
                    for (const entry of entries) {
                        if (entry.isDirectory() && entry.name !== path.basename(current)) {
                            baseDirs.add(path.join(parentDir, entry.name, 'node_modules'))
                            // Also check for packages/*/node_modules patterns
                            const subPath = path.join(parentDir, entry.name, 'packages')
                            if (fs.existsSync(subPath)) {
                                try {
                                    const pkgEntries = fs.readdirSync(subPath, { withFileTypes: true })
                                    for (const pkg of pkgEntries) {
                                        if (pkg.isDirectory()) {
                                            baseDirs.add(path.join(subPath, pkg.name, 'node_modules'))
                                        }
                                    }
                                } catch { /* skip */ }
                            }
                        }
                    }
                } catch { /* skip */ }
                
                current = parentDir
            }

            const possiblePaths: string[] = []
            for (const baseDir of baseDirs) {
                if (!baseDir) continue
                const p = path.join(baseDir, 'node_modules/tree-sitter-wasms/out', `tree-sitter-${nameForFile}.wasm`)
                possiblePaths.push(p)
                
                // Also check Mesh/packages/*/node_modules directly
                const meshBase = path.join(baseDir, '..', 'Mesh', 'packages')
                try {
                    const fs = await import('node:fs')
                    if (fs.existsSync(meshBase)) {
                        const entries = fs.readdirSync(meshBase, { withFileTypes: true })
                        for (const entry of entries) {
                            if (entry.isDirectory()) {
                                possiblePaths.push(path.join(meshBase, entry.name, 'node_modules', 'tree-sitter-wasms', 'out', `tree-sitter-${nameForFile}.wasm`))
                            }
                        }
                    }
                } catch { /* skip */ }
            }
            
            if (process.env.MIKK_DEBUG) {
                console.log('[tree-sitter] Searching for:', name)
                console.log('[tree-sitter] Paths checked:', possiblePaths.slice(0, 5).map(p => p.slice(-50)))
            }
            
            let wasmPath = ''
            for (const p of possiblePaths) {
                try {
                    const fs = await import('node:fs')
                    if (fs.existsSync(p)) {
                        wasmPath = p
                        break
                    }
                } catch { /* skip */ }
            }
            
            if (!wasmPath) {
                // Try common variations of the language name
                const variations = [
                    nameForFile,
                    name.replace(/_/g, '-'),
                    name,
                ]
                
                for (const variant of variations) {
                    for (const base of possiblePaths) {
                        const testPath = base.replace(/tree-sitter-[^/]+\.wasm/, `tree-sitter-${variant}.wasm`)
                        try {
                            const fs = await import('node:fs')
                            if (fs.existsSync(testPath)) {
                                wasmPath = testPath
                                break
                            }
                        } catch { /* skip */ }
                    }
                    if (wasmPath) break
                }
            }
            
            if (!wasmPath) {
                // WASM not found - but don't mark as permanent error, just skip this language
                return null
            }
            
            // Try to load the WASM file with error handling
            let lang: any = null
            try {
                lang = await Language.load(wasmPath)
            } catch (loadErr) {
                console.warn(`Failed to load WASM for ${name} at ${wasmPath}:`, loadErr)
                // Try with dynamic import as fallback
                try {
                    const wasmModule = await import(wasmPath)
                    if (wasmModule.default) {
                        lang = await wasmModule.default()
                    }
                } catch { /* skip */ }
            }
            
            if (lang) {
                this.languages.set(name, lang)
                return lang
            }
            
            return null
        } catch (err) {
            // Only mark as permanent error after all retries exhausted
            console.warn(`Failed to load Tree-sitter WASM for ${name}:`, err)
            return null
        }
    }

    private async getLanguageConfig(ext: string) {
        // Ensure parser is initialized first
        await this.init()
        
        if (!this.parser) {
            console.warn('[tree-sitter] Parser not initialized, returning null for', ext)
            return null
        }
        
        switch (ext) {
            case '.py':
                return { lang: await this.loadLang('python'), query: Queries.PYTHON_QUERIES }
            case '.java':
                return { lang: await this.loadLang('java'), query: Queries.JAVA_QUERIES }
            case '.kt':
            case '.kts':
                return { lang: await this.loadLang('kotlin'), query: Queries.KOTLIN_QUERIES }
            case '.scala':
            case '.sc':
                return { lang: await this.loadLang('scala'), query: Queries.SCALA_QUERIES }
            case '.swift':
                return { lang: await this.loadLang('swift'), query: Queries.SWIFT_QUERIES }
            case '.dart':
                return { lang: await this.loadLang('dart'), query: Queries.SWIFT_QUERIES }
            case '.c':
            case '.h':
                return { lang: await this.loadLang('c'), query: Queries.C_QUERIES }
            case '.cpp':
            case '.cc':
            case '.cxx':
            case '.hpp':
            case '.hxx':
            case '.hh':
                return { lang: await this.loadLang('cpp'), query: Queries.CPP_QUERIES }
            case '.cs':
                return { lang: await this.loadLang('c-sharp'), query: Queries.CSHARP_QUERIES }
            case '.go':
                return { lang: await this.loadLang('go'), query: Queries.GO_QUERIES }
            case '.rs':
                return { lang: await this.loadLang('rust'), query: Queries.RUST_QUERIES }
            case '.zig':
                return { lang: await this.loadLang('zig'), query: Queries.ZIG_QUERIES }
            case '.php':
                return { lang: await this.loadLang('php'), query: Queries.PHP_QUERIES }
            case '.rb':
                return { lang: await this.loadLang('ruby'), query: Queries.RUBY_QUERIES }
            case '.hs':
                return { lang: await this.loadLang('haskell'), query: Queries.HASKELL_QUERIES }
            case '.ex':
            case '.exs':
                return { lang: await this.loadLang('elixir'), query: Queries.ELIXIR_QUERIES }
            case '.clj':
            case '.cljs':
            case '.cljc':
                return { lang: await this.loadLang('clojure'), query: Queries.CLOJURE_QUERIES }
            case '.fs':
            case '.fsx':
            case '.fsi':
                return { lang: await this.loadLang('fsharp'), query: Queries.FSHARP_QUERIES }
            case '.ml':
            case '.mli':
                return { lang: await this.loadLang('ocaml'), query: Queries.OCAML_QUERIES }
            case '.pl':
            case '.pm':
                return { lang: await this.loadLang('perl'), query: Queries.PERL_QUERIES }
            case '.r':
            case '.R':
                return { lang: await this.loadLang('r'), query: Queries.R_QUERIES }
            case '.jl':
                return { lang: await this.loadLang('julia'), query: Queries.JULIA_QUERIES }
            case '.lua':
                return { lang: await this.loadLang('lua'), query: Queries.LUA_QUERIES }
            case '.sql':
                return { lang: await this.loadLang('sql'), query: Queries.SQL_QUERIES }
            case '.tf':
                return { lang: await this.loadLang('hcl'), query: Queries.HCL_QUERIES }
            case '.sh':
            case '.bash':
            case '.zsh':
                return { lang: await this.loadLang('bash'), query: Queries.BASH_QUERIES }
            default:
                return null
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
    const langMap: Record<string, ParsedFile['language']> = {
        '.py': 'python', '.pyw': 'python',
        '.java': 'java',
        '.kt': 'kotlin', '.kts': 'kotlin',
        '.scala': 'scala', '.sc': 'scala',
        '.swift': 'swift',
        '.dart': 'dart',
        '.c': 'c', '.h': 'c',
        '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp', '.hxx': 'cpp', '.hh': 'cpp',
        '.cs': 'csharp',
        '.rs': 'rust',
        '.zig': 'rust',
        '.php': 'php',
        '.rb': 'ruby',
        '.go': 'go',
        '.hs': 'haskell',
        '.ex': 'elixir', '.exs': 'elixir',
        '.clj': 'clojure', '.cljs': 'clojure', '.cljc': 'clojure',
        '.fs': 'csharp', '.fsx': 'csharp', '.fsi': 'csharp',
        '.ml': 'ocaml', '.mli': 'ocaml',
        '.pl': 'perl', '.pm': 'perl',
        '.r': 'r', '.R': 'r',
        '.jl': 'julia',
        '.lua': 'lua',
        '.sql': 'sql',
        '.tf': 'terraform',
        '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell',
    };
    return langMap[ext] ?? 'unknown';
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
