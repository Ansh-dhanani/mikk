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
            return new GoParser()
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
    const tsParser = new TypeScriptParser()
    const jsParser = new JavaScriptParser()
    const goParser = new GoParser()
    const tsFiles: ParsedFile[] = []
    const jsFiles: ParsedFile[] = []
    const goFiles: ParsedFile[] = []

    for (const fp of filePaths) {
        const ext = path.extname(fp)
        if (ext === '.ts' || ext === '.tsx') {
            try {
                const content = await readFile(path.join(projectRoot, fp))
                tsFiles.push(tsParser.parse(fp, content))
            } catch {
                // Skip unreadable files (permissions, binary, etc.) — don't abort the whole parse
            }
        } else if (ext === '.js' || ext === '.mjs' || ext === '.cjs' || ext === '.jsx') {
            try {
                const content = await readFile(path.join(projectRoot, fp))
                jsFiles.push(jsParser.parse(fp, content))
            } catch {
                // Skip unreadable files
            }
        } else if (ext === '.go') {
            try {
                const content = await readFile(path.join(projectRoot, fp))
                goFiles.push(goParser.parse(fp, content))
            } catch {
                // Skip unreadable files
            }
        }
    }

    // Resolve imports per language after all files of that language are parsed
    const resolvedTs = tsParser.resolveImports(tsFiles, projectRoot)
    const resolvedJs = jsParser.resolveImports(jsFiles, projectRoot)
    const resolvedGo = goParser.resolveImports(goFiles, projectRoot)

    return [...resolvedTs, ...resolvedJs, ...resolvedGo]
}
