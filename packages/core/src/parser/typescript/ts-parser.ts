import { BaseParser } from '../base-parser.js'
import type { ParsedFile } from '../types.js'
import { TypeScriptExtractor } from './ts-extractor.js'
import { TypeScriptResolver } from './ts-resolver.js'
import { hashContent } from '../../hash/file-hasher.js'

export class TypeScriptParser extends BaseParser {
    public async parse(filePath: string, content: string): Promise<ParsedFile> {
        const extractor = new TypeScriptExtractor(filePath, content)
        
        return {
            path: filePath,
            language: 'typescript',
            functions: extractor.extractFunctions(),
            classes: extractor.extractClasses(),
            variables: extractor.extractVariables(),
            generics: extractor.extractGenerics(),
            imports: extractor.extractImports(),
            exports: extractor.extractExports(),
            routes: extractor.extractRoutes(),
            calls: extractor.extractModuleCalls(),
            hash: hashContent(content),
            parsedAt: Date.now()
        }
    }

    public async resolveImports(files: ParsedFile[], projectRoot: string): Promise<ParsedFile[]> {
        const resolver = new TypeScriptResolver(projectRoot)
        return resolver.resolveBatch(files)
    }

    public getSupportedExtensions(): string[] {
        return ['.ts', '.tsx']
    }
}

