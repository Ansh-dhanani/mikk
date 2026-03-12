import * as path from 'node:path'
import * as fs from 'node:fs'
import { BaseParser } from '../base-parser.js'
import { TypeScriptExtractor } from './ts-extractor.js'
import { TypeScriptResolver } from './ts-resolver.js'
import { hashContent } from '../../hash/file-hasher.js'
import type { ParsedFile } from '../types.js'

/**
 * TypeScript parser — uses TS Compiler API to parse .ts/.tsx files
 * and extract structured data (functions, classes, imports, exports).
 */
export class TypeScriptParser extends BaseParser {
    /** Parse a single TypeScript file */
    parse(filePath: string, content: string): ParsedFile {
        const extractor = new TypeScriptExtractor(filePath, content)
        const functions = extractor.extractFunctions()
        const classes = extractor.extractClasses()
        const generics = extractor.extractGenerics()
        const imports = extractor.extractImports()
        const exports = extractor.extractExports()
        const routes = extractor.extractRoutes()

        // Cross-reference: if a function/class/generic is named in an export { Name }
        // or export default declaration, mark it as exported.
        const exportedNames = new Set(exports.map(e => e.name))
        for (const fn of functions) {
            if (!fn.isExported && exportedNames.has(fn.name)) {
                fn.isExported = true
            }
        }
        for (const cls of classes) {
            if (!cls.isExported && exportedNames.has(cls.name)) {
                cls.isExported = true
            }
        }
        for (const gen of generics) {
            if (!gen.isExported && exportedNames.has(gen.name)) {
                gen.isExported = true
            }
        }

        return {
            path: filePath,
            language: 'typescript',
            functions,
            classes,
            generics,
            imports,
            exports,
            routes,
            hash: hashContent(content),
            parsedAt: Date.now(),
        }
    }

    /** Resolve all import paths in parsed files to absolute project paths */
    resolveImports(files: ParsedFile[], projectRoot: string): ParsedFile[] {
        const tsConfigPaths = loadTsConfigPaths(projectRoot)
        const resolver = new TypeScriptResolver(projectRoot, tsConfigPaths)
        const allFilePaths = files.map(f => f.path)
        return files.map(file => ({
            ...file,
            imports: file.imports.map(imp => resolver.resolve(imp, file.path, allFilePaths)),
        }))
    }

    getSupportedExtensions(): string[] {
        return ['.ts', '.tsx']
    }
}

/**
 * Read compilerOptions.paths from tsconfig.json in projectRoot.
 * Recursively follows "extends" chains (e.g. extends ./tsconfig.base.json,
 * extends @tsconfig/node-lts/tsconfig.json) and merges paths.
 * 
 * Handles:
 *  - extends with relative paths (./tsconfig.base.json)
 *  - extends with node_modules packages (@tsconfig/node-lts)
 *  - baseUrl prefix so aliases like "@/*" → ["src/*"] resolve correctly
 *  - JSON5-style comments (line and block comments)
 */
function loadTsConfigPaths(projectRoot: string): Record<string, string[]> {
    const candidates = ['tsconfig.json', 'tsconfig.base.json']
    for (const name of candidates) {
        const tsConfigPath = path.join(projectRoot, name)
        try {
            const merged = loadTsConfigWithExtends(tsConfigPath, new Set())
            const options = merged.compilerOptions ?? {}
            const rawPaths: Record<string, string[]> = options.paths ?? {}
            if (Object.keys(rawPaths).length === 0) continue

            const baseUrl: string = options.baseUrl ?? '.'
            const resolved: Record<string, string[]> = {}
            for (const [alias, targets] of Object.entries(rawPaths)) {
                resolved[alias] = (targets as string[]).map(t =>
                    t.startsWith('.') ? path.posix.join(baseUrl, t) : t
                )
            }
            return resolved
        } catch { /* tsconfig not found or invalid — continue */ }
    }
    return {}
}

/**
 * Recursively load a tsconfig, following the "extends" chain.
 * Merges compilerOptions from parent → child (child wins on conflict).
 * Prevents infinite loops via a visited set.
 */
function loadTsConfigWithExtends(configPath: string, visited: Set<string>): any {
    const resolved = path.resolve(configPath)
    if (visited.has(resolved)) return {}
    visited.add(resolved)

    let raw: string
    try {
        raw = fs.readFileSync(resolved, 'utf-8')
    } catch {
        return {}
    }

    // Strip JSON5 comments
    const stripped = raw.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
    let config: any
    try {
        config = JSON.parse(stripped)
    } catch {
        try { config = JSON.parse(raw) } catch { return {} }
    }

    if (!config.extends) return config

    // Resolve the parent config path
    const extendsValue = config.extends
    let parentPath: string

    if (extendsValue.startsWith('.')) {
        // Relative path: ./tsconfig.base.json or ../tsconfig.json
        parentPath = path.resolve(path.dirname(resolved), extendsValue)
        // Add .json if missing
        if (!parentPath.endsWith('.json')) parentPath += '.json'
    } else {
        // Node module: @tsconfig/node-lts or @tsconfig/node-lts/tsconfig.json
        try {
            // Try resolving as a node module from projectRoot
            const projectRoot = path.dirname(resolved)
            const modulePath = path.join(projectRoot, 'node_modules', extendsValue)
            if (fs.existsSync(modulePath + '.json')) {
                parentPath = modulePath + '.json'
            } else if (fs.existsSync(path.join(modulePath, 'tsconfig.json'))) {
                parentPath = path.join(modulePath, 'tsconfig.json')
            } else if (fs.existsSync(modulePath)) {
                parentPath = modulePath
            } else {
                // Can't resolve — skip extends
                delete config.extends
                return config
            }
        } catch {
            delete config.extends
            return config
        }
    }

    // Load parent recursively
    const parent = loadTsConfigWithExtends(parentPath, visited)

    // Merge: parent compilerOptions → child compilerOptions (child wins)
    const merged = { ...config }
    delete merged.extends
    merged.compilerOptions = {
        ...(parent.compilerOptions ?? {}),
        ...(config.compilerOptions ?? {}),
    }

    // Merge paths specifically (child paths override parent paths for same alias)
    if (parent.compilerOptions?.paths || config.compilerOptions?.paths) {
        merged.compilerOptions.paths = {
            ...(parent.compilerOptions?.paths ?? {}),
            ...(config.compilerOptions?.paths ?? {}),
        }
    }

    return merged
}
