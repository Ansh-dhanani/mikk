import * as path from 'node:path'
import { BaseParser } from './base-parser.js'
import { TypeScriptParser } from './typescript/ts-parser.js'
import { UnsupportedLanguageError } from '../utils/errors.js'
import type { ParsedFile } from './types.js'

export type { ParsedFile, ParsedFunction, ParsedImport, ParsedExport, ParsedClass, ParsedParam } from './types.js'
export { BaseParser } from './base-parser.js'
export { TypeScriptParser } from './typescript/ts-parser.js'
export { TypeScriptExtractor } from './typescript/ts-extractor.js'
export { TypeScriptResolver } from './typescript/ts-resolver.js'

/** Get the appropriate parser for a file based on its extension */
export function getParser(filePath: string): BaseParser {
    const ext = path.extname(filePath)
    switch (ext) {
        case '.ts':
        case '.tsx':
            return new TypeScriptParser()
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
    const files: ParsedFile[] = []

    for (const fp of filePaths) {
        const ext = path.extname(fp)
        if (ext === '.ts' || ext === '.tsx') {
            const content = await readFile(path.join(projectRoot, fp))
            const parsed = tsParser.parse(fp, content)
            files.push(parsed)
        }
    }

    // Resolve all imports after all files are parsed
    return tsParser.resolveImports(files, projectRoot)
}
