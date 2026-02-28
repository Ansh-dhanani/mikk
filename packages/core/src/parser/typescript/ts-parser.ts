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
        return {
            path: filePath,
            language: 'typescript',
            functions: extractor.extractFunctions(),
            classes: extractor.extractClasses(),
            imports: extractor.extractImports(),
            exports: extractor.extractExports(),
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
