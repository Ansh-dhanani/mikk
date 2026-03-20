import * as path from 'node:path'
import { createRequire } from 'node:module'
import { hashContent } from '../../hash/file-hasher.js'
import { BaseParser } from '../base-parser.js'
import type { ParsedFile, ParsedFunction, ParsedClass, ParsedParam, ParsedImport, ParsedExport, ParsedRoute } from '../types.js'
import * as Queries from './queries.js'

// Safely require web-tree-sitter via CJS
const getRequire = () => {
    if (typeof require !== 'undefined') return require;
    return createRequire(import.meta.url);
};
const _require = getRequire();
const ParserModule = _require('web-tree-sitter')
const Parser = ParserModule.Parser || ParserModule

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
            // Fallback to empty if language not supported or grammar failed to load
            return this.buildEmptyFile(filePath, content, ext)
        }

        this.parser!.setLanguage(config.lang)
        const tree = this.parser!.parse(content)
        const query = config.lang.query(config.query)
        const matches = query.matches(tree.rootNode)

        const functions: ParsedFunction[] = []
        const classesMap = new Map<string, ParsedClass>()
        const imports: ParsedImport[] = []
        const calls = new Set<string>()

        for (const match of matches) {
            const captures: Record<string, any> = {}
            for (const c of match.captures) {
                captures[c.name] = c.node
            }

            // Calls
            if (captures['call.name']) {
                calls.add(captures['call.name'].text)
                continue
            }

            // Imports
            if (captures['import.source']) {
                const src = captures['import.source'].text.replace(/['"]/g, '')
                imports.push({
                    source: src,
                    resolvedPath: '',
                    names: [],
                    isDefault: false,
                    isDynamic: false
                })
                continue
            }

            // Functions / Methods
            if (captures['definition.function'] || captures['definition.method']) {
                const nameNode = captures['name']
                const defNode = captures['definition.function'] || captures['definition.method']
                
                if (nameNode && defNode) {
                    const fnName = nameNode.text
                    functions.push({
                        id: `fn:${filePath}:${fnName}`,
                        name: fnName,
                        file: filePath,
                        startLine: defNode.startPosition.row + 1,
                        endLine: defNode.endPosition.row + 1,
                        params: [],
                        returnType: 'any',
                        isExported: true, // simplified for universal parser
                        isAsync: false,
                        calls: [], // We aggregate at file level currently
                        hash: hashContent(defNode.text),
                        purpose: '',
                        edgeCasesHandled: [],
                        errorHandling: [],
                        detailedLines: [],
                    })
                }
            }

            // Classes / Structs / Interfaces
            if (captures['definition.class'] || captures['definition.struct'] || captures['definition.interface']) {
                const nameNode = captures['name']
                const defNode = captures['definition.class'] || captures['definition.struct'] || captures['definition.interface']
                
                if (nameNode && defNode) {
                    const clsName = nameNode.text
                    if (!classesMap.has(clsName)) {
                        classesMap.set(clsName, {
                            id: `cls:${filePath}:${clsName}`,
                            name: clsName,
                            file: filePath,
                            startLine: defNode.startPosition.row + 1,
                            endLine: defNode.endPosition.row + 1,
                            methods: [],
                            isExported: true,
                        })
                    }
                }
            }
        }

        // Attach global calls to the first function as a heuristic, or store in a dummy
        if (functions.length > 0) {
            functions[0].calls = Array.from(calls)
        }

        let finalLang: ParsedFile['language'] = 'go'
        switch (ext) {
            case '.py': finalLang = 'python'; break
            case '.java': finalLang = 'java'; break
            case '.c': case '.h': finalLang = 'c'; break
            case '.cpp': case '.cc': case '.hpp': finalLang = 'cpp'; break
            case '.cs': finalLang = 'csharp'; break
            case '.go': finalLang = 'go'; break
            case '.rs': finalLang = 'rust'; break
            case '.php': finalLang = 'php'; break
            case '.rb': finalLang = 'ruby'; break
        }

        return {
            path: filePath,
            language: finalLang,
            functions,
            classes: Array.from(classesMap.values()),
            generics: [],
            imports,
            exports: functions.map(f => ({ name: f.name, type: 'function', file: filePath })),
            routes: [],
            hash: hashContent(content),
            parsedAt: Date.now()
        }
    }

    resolveImports(files: ParsedFile[], projectRoot: string): ParsedFile[] {
        // Universal resolver: just link absolute paths if they exist locally
        // Basic heuristic for all 11 languages
        return files
    }

    private buildEmptyFile(filePath: string, content: string, ext: string): ParsedFile {
        let finalLang: ParsedFile['language'] = 'unknown'
        switch (ext) {
            case '.py': finalLang = 'python'; break
            case '.java': finalLang = 'java'; break
            case '.c': case '.h': finalLang = 'c'; break
            case '.cpp': case '.cc': case '.hpp': finalLang = 'cpp'; break
            case '.cs': finalLang = 'csharp'; break
            case '.go': finalLang = 'go'; break
            case '.rs': finalLang = 'rust'; break
            case '.php': finalLang = 'php'; break
            case '.rb': finalLang = 'ruby'; break
        }
        return {
            path: filePath,
            language: finalLang,
            functions: [], classes: [], generics: [], imports: [], exports: [], routes: [],
            hash: hashContent(content),
            parsedAt: Date.now()
        }
    }

    private async loadLang(name: string): Promise<any> {
        if (this.languages.has(name)) return this.languages.get(name)
        try {
            // Get module root path to locate wasms
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
