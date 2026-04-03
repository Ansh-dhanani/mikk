import * as nodePath from 'node:path'
import { BaseParser } from './base-parser.js'
import { OxcParser } from './oxc-parser.js'
import { GoParser } from './go/go-parser.js'
import { UnsupportedLanguageError } from '../utils/errors.js'
import type { ParsedFile } from './types.js'
import { hashContent } from '../hash/file-hasher.js'
import {
    parserKindForExtension,
    languageForExtension,
    getParserExtensions,
    isTreeSitterExtension,
    type ParserKind,
} from '../utils/language-registry.js'

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

export type ParseDiagnosticStage = 'read' | 'parse' | 'resolve-imports'
export type ParseDiagnosticReason =
    | 'read-error'
    | 'parse-error'
    | 'resolve-error'
    | 'unsupported-extension'
    | 'parser-unavailable'

export interface ParseDiagnostic {
    filePath: string
    extension: string
    parser: ParserKind
    stage: ParseDiagnosticStage
    reason: ParseDiagnosticReason
    message: string
}

export interface ParseFilesSummary {
    requestedFiles: number
    parsedFiles: number
    fallbackFiles: number
    unreadableFiles: number
    unsupportedFiles: number
    diagnostics: number
}

export interface ParseFilesResult {
    files: ParsedFile[]
    diagnostics: ParseDiagnostic[]
    summary: ParseFilesSummary
}

const isLikelyParserUnavailable = (parser: ParserKind, message: string): boolean => {
    if (parser !== 'tree-sitter') return false
    const normalized = message.toLowerCase()
    return normalized.includes('web-tree-sitter') ||
        normalized.includes('tree-sitter') ||
        normalized.includes('cannot find module')
}


const buildFallbackParsedFile = (filePath: string, content: string, ext: string): ParsedFile => ({
    path: filePath,
    language: languageForExtension(ext) as ParsedFile['language'],
    functions: [],
    classes: [],
    generics: [],
    imports: [],
    exports: [],
    routes: [],
    variables: [],
    calls: [],
    hash: hashContent(content),
    parsedAt: Date.now(),
})

const normalizeErrorMessage = (err: unknown): string => {
    if (!err) return 'Unknown error'
    if (err instanceof Error) return err.message
    return String(err)
}

/** Get the appropriate parser for a file based on its extension */
export function getParser(filePath: string): BaseParser {
    const ext = nodePath.extname(filePath).toLowerCase()
    const parserKind = parserKindForExtension(ext)

    switch (parserKind) {
        case 'oxc':
            return new OxcParser()
        case 'go':
            return new GoParser()
        case 'tree-sitter':
            return createTreeSitterParser()
        default:
            throw new UnsupportedLanguageError(ext || '<no extension>')
    }
}

let _treeSitterParserInstance: BaseParser | null = null

const createTreeSitterParser = (): BaseParser => {
    if (!_treeSitterParserInstance) {
        // Return a lazy-loading wrapper that handles missing tree-sitter gracefully.
        _treeSitterParserInstance = new LazyTreeSitterParser()
    }
    return _treeSitterParserInstance
}

class LazyTreeSitterParser extends BaseParser {
    private parser: any = null

    async init(): Promise<void> {
        if (this.parser) return
        try {
            const { TreeSitterParser } = await import('./tree-sitter/parser.js')
            this.parser = new TreeSitterParser()
        } catch {
            // web-tree-sitter not available
        }
    }

    async parse(filePath: string, content: string): Promise<ParsedFile> {
        await this.init()
        if (!this.parser) {
            return this.buildEmptyFile(filePath, content)
        }
        return this.parser.parse(filePath, content)
    }

    async resolveImports(files: ParsedFile[], projectRoot: string): Promise<ParsedFile[]> {
        await this.init()
        if (!this.parser) return files
        return this.parser.resolveImports(files, projectRoot)
    }

    getSupportedExtensions(): string[] {
        return [...getParserExtensions('tree-sitter')]
    }

    private buildEmptyFile(filePath: string, content: string): ParsedFile {
        const ext = nodePath.extname(filePath).toLowerCase()
        const lang = languageForExtension(ext)
        return {
            path: filePath,
            language: lang as ParsedFile['language'],
            functions: [],
            classes: [],
            generics: [],
            imports: [],
            exports: [],
            routes: [],
            variables: [],
            calls: [],
            hash: hashContent(content),
            parsedAt: Date.now(),
        }
    }
}

export interface ParseFilesOptions {
    strictParserPreflight?: boolean
    treeSitterRuntimeAvailable?: boolean
}

async function isTreeSitterRuntimeAvailable(): Promise<boolean> {
    try {
        const { TreeSitterParser } = await import('./tree-sitter/parser.js')
        const parser = new TreeSitterParser()
        if (typeof (parser as any).isRuntimeAvailable !== 'function') {
            return true
        }
        return await (parser as any).isRuntimeAvailable()
    } catch {
        return false
    }
}

export async function parseFilesWithDiagnostics(
    filePaths: string[],
    projectRoot: string,
    readFile: (fp: string) => Promise<string>,
    options: ParseFilesOptions = {},
): Promise<ParseFilesResult> {
    // Shared parser instances — avoid re-initialisation overhead per file.
    const oxcParser = new OxcParser()
    const goParser = new GoParser()

    // Lazily loaded to avoid mandatory dependency on tree-sitter for TS/JS-only projects.
    let treeSitterParser: BaseParser | null = null
    const getTreeSitter = async (): Promise<BaseParser> => {
        if (!treeSitterParser) {
            const { TreeSitterParser } = await import('./tree-sitter/parser.js')
            treeSitterParser = new TreeSitterParser()
        }
        return treeSitterParser
    }

    const diagnostics: ParseDiagnostic[] = []
    const addDiagnostic = (diagnostic: ParseDiagnostic) => diagnostics.push(diagnostic)

    const treeSitterNeeded = filePaths.some(fp => {
        const ext = nodePath.extname(fp).toLowerCase()
        return isTreeSitterExtension(ext)
    })

    if (treeSitterNeeded) {
        const treeSitterAvailable =
            typeof options.treeSitterRuntimeAvailable === 'boolean'
                ? options.treeSitterRuntimeAvailable
                : await isTreeSitterRuntimeAvailable()
        if (!treeSitterAvailable) {
            addDiagnostic({
                filePath: '*',
                extension: '*',
                parser: 'tree-sitter',
                stage: 'parse',
                reason: 'parser-unavailable',
                message: 'Tree-sitter runtime unavailable. Install web-tree-sitter and language grammars.',
            })
            if (options.strictParserPreflight) {
                return {
                    files: [],
                    diagnostics,
                    summary: {
                        requestedFiles: filePaths.length,
                        parsedFiles: 0,
                        fallbackFiles: 0,
                        unreadableFiles: 0,
                        unsupportedFiles: 0,
                        diagnostics: diagnostics.length,
                    },
                }
            }
        }
    }

    // Normalized project root for absolute path construction.
    const normalizedRoot = nodePath.resolve(projectRoot).replace(/\\/g, '/')

    // Group by parser to enable batch resolveImports.
    const oxcFiles: ParsedFile[] = []
    const goFiles: ParsedFile[] = []
    const treeFiles: ParsedFile[] = []
    const fallbackFiles: ParsedFile[] = []

    let parsedFilesCount = 0
    let fallbackFilesCount = 0
    let unreadableFiles = 0
    let unsupportedFiles = 0

    // Parse sequentially to avoid races in parser implementations that keep
    // mutable per-instance state (e.g. language switching/counters).
    for (const fp of filePaths) {
        const ext = nodePath.extname(fp).toLowerCase()
        const parserKind = parserKindForExtension(ext)

        // Build absolute posix path — this is the single source of truth for all IDs.
        const absoluteFp = nodePath.resolve(normalizedRoot, fp).replace(/\\/g, '/')

        let content: string
        try {
            content = await readFile(absoluteFp)
        } catch (err: unknown) {
            unreadableFiles += 1
            addDiagnostic({
                filePath: absoluteFp,
                extension: ext,
                parser: parserKind,
                stage: 'read',
                reason: 'read-error',
                message: normalizeErrorMessage(err),
            })
            continue
        }

        if (parserKind === 'unknown') {
            unsupportedFiles += 1
            fallbackFilesCount += 1
            fallbackFiles.push(buildFallbackParsedFile(absoluteFp, content, ext))
            addDiagnostic({
                filePath: absoluteFp,
                extension: ext,
                parser: parserKind,
                stage: 'parse',
                reason: 'unsupported-extension',
                message: `Unsupported extension: ${ext || '<none>'}`,
            })
            continue
        }

        try {
            if (parserKind === 'oxc') {
                const parsed = await oxcParser.parse(absoluteFp, content)
                oxcFiles.push(parsed)
                parsedFilesCount += 1
            } else if (parserKind === 'go') {
                const parsed = await goParser.parse(absoluteFp, content)
                goFiles.push(parsed)
                parsedFilesCount += 1
            } else {
                const ts = await getTreeSitter()
                const parsed = await ts.parse(absoluteFp, content)
                treeFiles.push(parsed)
                parsedFilesCount += 1
            }
        } catch (err: unknown) {
            fallbackFilesCount += 1
            const message = normalizeErrorMessage(err)
            const reason: ParseDiagnosticReason = isLikelyParserUnavailable(parserKind, message)
                ? 'parser-unavailable'
                : 'parse-error'

            fallbackFiles.push(buildFallbackParsedFile(absoluteFp, content, ext))
            addDiagnostic({
                filePath: absoluteFp,
                extension: ext,
                parser: parserKind,
                stage: 'parse',
                reason,
                message,
            })
        }
    }

    // Resolve imports batch-wise per parser (each has its own resolver).
    let resolvedOxcFiles = oxcFiles
    if (oxcFiles.length > 0) {
        try {
            resolvedOxcFiles = await oxcParser.resolveImports(oxcFiles, normalizedRoot)
        } catch (err: unknown) {
            addDiagnostic({
                filePath: '*',
                extension: '*',
                parser: 'oxc',
                stage: 'resolve-imports',
                reason: 'resolve-error',
                message: normalizeErrorMessage(err),
            })
        }
    }

    let resolvedGoFiles = goFiles
    if (goFiles.length > 0) {
        try {
            resolvedGoFiles = await goParser.resolveImports(goFiles, normalizedRoot)
        } catch (err: unknown) {
            addDiagnostic({
                filePath: '*',
                extension: '*',
                parser: 'go',
                stage: 'resolve-imports',
                reason: 'resolve-error',
                message: normalizeErrorMessage(err),
            })
        }
    }

    let resolvedTreeFiles = treeFiles
    if (treeFiles.length > 0) {
        try {
            const treeParser = treeSitterParser ?? await getTreeSitter()
            resolvedTreeFiles = await treeParser.resolveImports(treeFiles, normalizedRoot)
        } catch (err: unknown) {
            addDiagnostic({
                filePath: '*',
                extension: '*',
                parser: 'tree-sitter',
                stage: 'resolve-imports',
                reason: 'resolve-error',
                message: normalizeErrorMessage(err),
            })
        }
    }

    const resolved: ParsedFile[] = [
        ...resolvedOxcFiles,
        ...resolvedGoFiles,
        ...resolvedTreeFiles,
        ...fallbackFiles,
    ]

    return {
        files: resolved,
        diagnostics,
        summary: {
            requestedFiles: filePaths.length,
            parsedFiles: parsedFilesCount,
            fallbackFiles: fallbackFilesCount,
            unreadableFiles,
            unsupportedFiles,
            diagnostics: diagnostics.length,
        },
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
    const result = await parseFilesWithDiagnostics(filePaths, projectRoot, readFile)
    return result.files
}
