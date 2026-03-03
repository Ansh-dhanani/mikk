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
        const resolver = new TypeScriptResolver(projectRoot)
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
