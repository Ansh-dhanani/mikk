import * as path from 'node:path'
import * as fs from 'node:fs'
import { BaseParser } from '../base-parser.js'
import { JavaScriptExtractor } from './js-extractor.js'
import { JavaScriptResolver } from './js-resolver.js'
import { hashContent } from '../../hash/file-hasher.js'
import type { ParsedFile } from '../types.js'

/**
 * JavaScriptParser -- implements BaseParser for .js / .mjs / .cjs / .jsx files.
 *
 * Uses the TypeScript Compiler API (ScriptKind.JS / ScriptKind.JSX) which correctly
 * parses JavaScript without type annotations.  JavaScriptExtractor extends
 * TypeScriptExtractor and adds CommonJS require() / module.exports support.
 */
export class JavaScriptParser extends BaseParser {
    async parse(filePath: string, content: string): Promise<ParsedFile> {
        const extractor = new JavaScriptExtractor(filePath, content)

        const functions = extractor.extractFunctions()
        const classes   = extractor.extractClasses()
        const generics  = extractor.extractGenerics()
        const imports   = extractor.extractImports()
        const exports   = extractor.extractExports()
        const routes    = extractor.extractRoutes()

        // Cross-reference: CJS exports may mark a name exported even when the
        // declaration itself had no `export` keyword.
        //
        // We only mark a symbol as exported when the export list contains an
        // entry with BOTH a matching name AND a non-default type. This prevents
        // `module.exports = function() {}` (which produces name='default', type='default')
        // from accidentally marking an unrelated local function called 'default' as exported.
        const exportedNonDefault = new Set(
            exports.filter(e => e.type !== 'default').map(e => e.name)
        )
        for (const fn  of functions) { if (!fn.isExported  && exportedNonDefault.has(fn.name))  fn.isExported  = true }
        for (const cls of classes)   { if (!cls.isExported && exportedNonDefault.has(cls.name)) cls.isExported = true }
        for (const gen of generics)  { if (!gen.isExported && exportedNonDefault.has(gen.name)) gen.isExported = true }

        return {
            path: filePath,
            language: 'javascript',
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

    resolveImports(files: ParsedFile[], projectRoot: string): ParsedFile[] {
        const aliases = loadAliases(projectRoot)
        // Only pass the file list when it represents a reasonably complete scan.
        // A sparse list (< 10 files) causes valid alias-resolved imports to return ''
        // because the target file is not in the partial list.
        const allFilePaths = files.length >= 10 ? files.map(f => f.path) : []
        const resolver = new JavaScriptResolver(projectRoot, aliases)
        return files.map(file => ({
            ...file,
            imports: resolver.resolveAll(file.imports, file.path, allFilePaths),
        }))
    }

    getSupportedExtensions(): string[] {
        return ['.js', '.mjs', '.cjs', '.jsx']
    }
}

/**
 * Load path aliases from jsconfig.json → tsconfig.json → tsconfig.base.json.
 * Strips JS/block comments before parsing (both formats allow them).
 * Falls back to raw content if comment-stripping breaks a URL.
 * Returns {} when no config is found.
 */
function loadAliases(projectRoot: string): Record<string, string[]> {
    for (const name of ['jsconfig.json', 'tsconfig.json', 'tsconfig.base.json']) {
        const configPath = path.join(projectRoot, name)
        try {
            const raw = fs.readFileSync(configPath, 'utf-8')
            // Strip line comments that are NOT inside strings.
            // The naive /\/\/.*$/gm regex breaks URLs like "https://example.com" by
            // removing everything after the //. We use a safer approach: only strip
            // a // comment when it is not preceded by an even number of quote characters
            // on the same line (i.e. it is not inside a string literal).
            // For block comments (/* ... */) the existing replacement is fine since
            // tsconfig/jsconfig files never put block comments inside string values.
            const stripped = raw
                .replace(/\/\*[\s\S]*?\*\//g, '')           // block comments
                .replace(/(?<![":])\/\/[^\n]*/g, '')         // line comments not preceded by : or "
            let config: any
            try   { config = JSON.parse(stripped) }
            catch { config = JSON.parse(raw) }          // stripping may have broken JSON; retry raw

            const options  = config.compilerOptions ?? {}
            const rawPaths: Record<string, string[]> = options.paths ?? {}
            if (Object.keys(rawPaths).length === 0) continue

            const baseUrl = options.baseUrl ?? '.'
            const resolved: Record<string, string[]> = {}
            for (const [alias, targets] of Object.entries(rawPaths)) {
                resolved[alias] = (targets as string[]).map((t: string) => path.posix.join(baseUrl, t))
            }
            return resolved
        } catch { /* config absent or unreadable — try next */ }
    }
    return {}
}
