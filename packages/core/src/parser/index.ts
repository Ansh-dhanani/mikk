import * as path from 'node:path'
import { BaseParser } from './base-parser.js'
import { TypeScriptParser } from './typescript/ts-parser.js'
import { GoParser } from './go/go-parser.js'
import { JavaScriptParser } from './javascript/js-parser.js'
import { UnsupportedLanguageError } from '../utils/errors.js'
import type { ParsedFile } from './types.js'

export type { ParsedFile, ParsedFunction, ParsedImport, ParsedExport, ParsedClass, ParsedParam } from './types.js'
export { BaseParser } from './base-parser.js'
export { TypeScriptParser } from './typescript/ts-parser.js'
export { TypeScriptExtractor } from './typescript/ts-extractor.js'
export { TypeScriptResolver } from './typescript/ts-resolver.js'
export { GoParser } from './go/go-parser.js'
export { GoExtractor } from './go/go-extractor.js'
export { GoResolver } from './go/go-resolver.js'
export { JavaScriptParser } from './javascript/js-parser.js'
export { JavaScriptExtractor } from './javascript/js-extractor.js'
export { JavaScriptResolver } from './javascript/js-resolver.js'
export { BoundaryChecker } from './boundary-checker.js'
export { TreeSitterParser } from './tree-sitter/parser.js'
import { TreeSitterParser } from './tree-sitter/parser.js'

/** Get the appropriate parser for a file based on its extension */
export function getParser(filePath: string): BaseParser {
    const ext = path.extname(filePath)
    switch (ext) {
        case '.ts':
        case '.tsx':
            return new TypeScriptParser()
        case '.js':
        case '.mjs':
        case '.cjs':
        case '.jsx':
            return new JavaScriptParser()
        case '.go':
            return new GoParser() // Mikk's custom Regex Go parser
        case '.py':
        case '.java':
        case '.c':
        case '.h':
        case '.cpp':
        case '.cc':
        case '.hpp':
        case '.cs':
        case '.rs':
        case '.php':
        case '.rb':
            return new TreeSitterParser()
        default:
            throw new UnsupportedLanguageError(ext)
    }
}

/** Parse multiple files and resolve imports across them */
export async function parseFiles(
    filePaths: string[],
    projectRoot: string,
    readFile: (fp: string) => Promise<string>
): Promise<ParsedFile[]> {
    const parsersMap = new Map<BaseParser, ParsedFile[]>()
    // Re-use parser instances so they can share cache/bindings
    const tsParser = new TypeScriptParser()
    const jsParser = new JavaScriptParser()
    const goParser = new GoParser()
    const treeSitterParser = new TreeSitterParser()

    const getCachedParser = (ext: string): BaseParser | null => {
        switch (ext) {
            case '.ts': case '.tsx': return tsParser
            case '.js': case '.mjs': case '.cjs': case '.jsx': return jsParser
            case '.go': return goParser
            case '.py': case '.java': case '.c': case '.h': case '.cpp': case '.cc': case '.hpp': case '.cs': case '.rs': case '.php': case '.rb': return treeSitterParser
            default: return null
        }
    }

    for (const fp of filePaths) {
        const ext = path.extname(fp).toLowerCase()
        const parser = getCachedParser(ext)
        if (!parser) continue

        try {
            const content = await readFile(path.join(projectRoot, fp))
            const parsed = await parser.parse(fp, content)
            
            if (!parsersMap.has(parser)) parsersMap.set(parser, [])
            parsersMap.get(parser)!.push(parsed)
        } catch {
            // Skip unreadable files (permissions, binary, etc.) — don't abort the whole parse
        }
    }

    const allResolvedFiles: ParsedFile[] = []
    for (const [parser, files] of parsersMap.entries()) {
        allResolvedFiles.push(...parser.resolveImports(files, projectRoot))
    }

    return allResolvedFiles
}
