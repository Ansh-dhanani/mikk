import * as nodePath from 'node:path'
import { BaseParser } from './base-parser.js'
import { OxcParser } from './oxc-parser.js'
import { GoParser } from './go/go-parser.js'
import { UnsupportedLanguageError } from '../utils/errors.js'
import type { ParsedFile } from './types.js'

export type {
    ParsedFile,
    ParsedFunction,
    ParsedImport,
    ParsedExport,
    ParsedClass,
    ParsedParam,
    ParsedVariable,
    CallExpression,
    ParsedGeneric,
    ParsedRoute
} from './types.js'
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

/** Get the appropriate parser for a file based on its extension */
export function getParser(filePath: string): BaseParser {
    const ext = nodePath.extname(filePath).toLowerCase()
    switch (ext) {
        case '.ts':
        case '.tsx':
        case '.js':
        case '.mjs':
        case '.cjs':
        case '.jsx':
            return new OxcParser()
        case '.go':
            return new GoParser()
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
            throw new UnsupportedLanguageError(ext)
        default:
            throw new UnsupportedLanguageError(ext)
    }
}

/**
 * Parse multiple files, resolve their imports, and return ParsedFile[].
 *
 * Path contract (critical for graph correctness):
 *   - filePaths come from discoverFiles() as project-root-relative strings
 *   - We resolve them to ABSOLUTE posix paths before passing to parse()
 *   - ParsedFile.path is therefore always absolute + forward-slash
 *   - OxcResolver also returns absolute paths → import edges always consistent
 */
export async function parseFiles(
    filePaths: string[],
    projectRoot: string,
    readFile: (fp: string) => Promise<string>
): Promise<ParsedFile[]> {
    // Shared parser instances — avoid re-initialisation overhead per file
    const oxcParser = new OxcParser()
    const goParser = new GoParser()

    // Lazily loaded to avoid mandatory dep on tree-sitter
    let treeSitterParser: BaseParser | null = null
    const getTreeSitter = async (): Promise<BaseParser> => {
        if (!treeSitterParser) {
            const { TreeSitterParser } = await import('./tree-sitter/parser.js')
            treeSitterParser = new TreeSitterParser()
        }
        return treeSitterParser!
    }

    const tsExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
    const goExtensions = new Set(['.go'])
    const treeSitterExtensions = new Set(['.py', '.java', '.c', '.h', '.cpp', '.cc', '.hpp', '.cs', '.rs', '.php', '.rb'])

    // Normalised project root for absolute path construction
    const normalizedRoot = nodePath.resolve(projectRoot).replace(/\\/g, '/')

    // Group by parser to enable batch resolveImports
    const oxcFiles: ParsedFile[] = []
    const goFiles: ParsedFile[] = []
    const treeFiles: ParsedFile[] = []

    // Parse sequentially to avoid races in parser implementations that keep
    // mutable per-instance state (e.g. language switching/counters).
    for (const fp of filePaths) {
        const ext = nodePath.extname(fp).toLowerCase()

        // Build absolute posix path — this is the single source of truth for all IDs
        const absoluteFp = nodePath.resolve(normalizedRoot, fp).replace(/\\/g, '/')

        let content: string
        try {
            content = await readFile(absoluteFp)
        } catch {
            // File unreadable — skip silently (deleted, permission error, binary)
            continue
        }

        try {
            if (tsExtensions.has(ext)) {
                const parsed = await oxcParser.parse(absoluteFp, content)
                oxcFiles.push(parsed)
            } else if (goExtensions.has(ext)) {
                const parsed = await goParser.parse(absoluteFp, content)
                goFiles.push(parsed)
            } else if (treeSitterExtensions.has(ext)) {
                const ts = await getTreeSitter()
                const parsed = await ts.parse(absoluteFp, content)
                treeFiles.push(parsed)
            }
        } catch {
            // Parser error — skip this file, don't abort the whole run
        }
    }

    // Resolve imports batch-wise per parser (each has its own resolver)
    let resolvedTreeFiles: ParsedFile[] = treeFiles
    if (treeFiles.length > 0) {
        const treeParser = treeSitterParser ?? await getTreeSitter()
        resolvedTreeFiles = treeParser.resolveImports(treeFiles, normalizedRoot)
    }

    const resolved: ParsedFile[] = [
        ...oxcParser.resolveImports(oxcFiles, normalizedRoot),
        ...goParser.resolveImports(goFiles, normalizedRoot),
        ...resolvedTreeFiles,
    ]

    return resolved
}
