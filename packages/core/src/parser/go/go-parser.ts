import { BaseParser } from '../base-parser.js'
import { GoExtractor } from './go-extractor.js'
import { GoResolver } from './go-resolver.js'
import { hashContent } from '../../hash/file-hasher.js'
import type { ParsedFile } from '../types.js'

/**
 * GoParser — implements BaseParser for .go files.
 * Uses GoExtractor (regex-based) to pull structured data from Go source
 * without requiring the Go toolchain.
 */
export class GoParser extends BaseParser {
    parse(filePath: string, content: string): ParsedFile {
        const extractor = new GoExtractor(filePath, content)

        return {
            path: filePath,
            language: 'go',
            functions: extractor.extractFunctions(),
            classes: extractor.extractClasses(),
            generics: [], // Go type aliases handled as classes/exports
            imports: extractor.extractImports(),
            exports: extractor.extractExports(),
            routes: extractor.extractRoutes(),
            hash: hashContent(content),
            parsedAt: Date.now(),
        }
    }

    resolveImports(files: ParsedFile[], projectRoot: string): ParsedFile[] {
        const resolver = new GoResolver(projectRoot)
        return files.map(file => ({
            ...file,
            imports: resolver.resolveAll(file.imports),
        }))
    }

    getSupportedExtensions(): string[] {
        return ['.go']
    }
}
