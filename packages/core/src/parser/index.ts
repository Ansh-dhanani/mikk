 
import * as nodePath from 'node:path'
import { LanguageRegistry } from './language-registry.js'
export { LanguageRegistry } from './language-registry.js'
import './oxc-parser.js'
import './tree-sitter/parser.js'
import './go/go-extractor.js'
import { BaseExtractor } from './base-extractor.js'
import { hashContent } from '../hash/file-hasher.js'
import { IncrementalCache } from '../cache/incremental-cache.js'
import { languageForExtension, toParsedFileLanguage } from '../utils/language-registry.js'
import { ErrorRecoveryEngine } from './error-recovery.js'
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

export { BaseExtractor } from './base-extractor.js'
export { BoundaryChecker } from './boundary-checker.js'

export type ParseDiagnosticStage = 'read' | 'parse' | 'resolve-imports'
export type ParseDiagnosticReason =
    | 'read-error'
    | 'parse-error'
    | 'parse-error-recovered'
    | 'resolve-error'
    | 'unsupported-extension'
    | 'parser-unavailable'

export interface ParseDiagnostic {
    filePath: string
    extension: string
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

const buildFallbackParsedFile = (filePath: string, content: string, ext: string): ParsedFile => ({
    path: filePath,
    language: toParsedFileLanguage(languageForExtension(ext)),
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

export interface ParseFilesOptions {
    strictParserPreflight?: boolean
    concurrency?: number
}

const DEFAULT_CONCURRENCY = 32

async function parallelBatch<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    concurrency: number
): Promise<R[]> {
    const results: R[] = new Array(items.length)
    const errors: (Error | null)[] = new Array(items.length)
    
    for (let i = 0; i < items.length; i += concurrency) {
        const batch = items.slice(i, i + concurrency)
        const batchResults = await Promise.allSettled(batch.map((item, _j) => processor(item)))
        
        for (let j = 0; j < batchResults.length; j++) {
            const result = batchResults[j]
            if (result.status === 'fulfilled') {
                results[i + j] = result.value
            } else {
                errors[i + j] = result.reason
            }
        }
    }
    
    return results
}

/**
 * Main entry point for scanning and parsing multiple files.
 * Uses LanguageRegistry to dispatch to the correct extractor.
 * PARALLELIZED: Files are parsed concurrently for better performance.
 */
export async function parseFilesWithDiagnostics(
    filePaths: string[],
    projectRoot: string,
    readFile: (fp: string) => Promise<string>,
    options: ParseFilesOptions = {},
): Promise<ParseFilesResult> {
    const diagnostics: ParseDiagnostic[] = []
    const normalizedRoot = nodePath.resolve(projectRoot).replace(/\\/g, '/')
    const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY
    
    const cache = new IncrementalCache(projectRoot)
    const registry = LanguageRegistry.getInstance()
    
    const filesByExtractor = new Map<BaseExtractor, ParsedFile[]>()
    const fallbackFiles: ParsedFile[] = []
    const _pendingDiagnostics: Array<{ filePath: string; ext: string; stage: ParseDiagnosticStage; reason: ParseDiagnosticReason; message: string }> = []
    
    let parsedFilesCount = 0
    let fallbackFilesCount = 0
    let unreadableFiles = 0
    let unsupportedFiles = 0

    const fileResults = await parallelBatch(filePaths, async (fp) => {
        const absoluteFp = nodePath.resolve(normalizedRoot, fp).replace(/\\/g, '/')
        const ext = nodePath.extname(absoluteFp).toLowerCase()
        const langDef = registry.getForFile(absoluteFp)
        
        try {
            const content = await readFile(absoluteFp)
            return { absoluteFp, ext, langDef, content }
        } catch (err: unknown) {
            return { 
                absoluteFp, ext, langDef, content: null, 
                error: normalizeErrorMessage(err) 
            }
        }
    }, concurrency)

    for (const result of fileResults) {
        if (result.error) {
            unreadableFiles += 1
            diagnostics.push({
                filePath: result.absoluteFp,
                extension: result.ext,
                stage: 'read',
                reason: 'read-error',
                message: result.error,
            })
            continue
        }

        if (result.content === null) continue

        const { absoluteFp, ext, langDef, content } = result

        if (!langDef) {
            unsupportedFiles += 1
            fallbackFilesCount += 1
            fallbackFiles.push(buildFallbackParsedFile(absoluteFp, content!, ext))
            diagnostics.push({
                filePath: absoluteFp,
                extension: ext,
                stage: 'parse',
                reason: 'unsupported-extension',
                message: `Unsupported extension: ${ext || '<none>'}`,
            })
            continue
        }

        try {
            const contentHash = hashContent(content!)
            const cached = await cache.get(absoluteFp, contentHash)
            
            if (cached) {
                const group = filesByExtractor.get(langDef.extractor) || []
                group.push(cached)
                filesByExtractor.set(langDef.extractor, group)
                parsedFilesCount += 1
                continue
            }

            const parsed = await langDef.extractor.extract(absoluteFp, content!)
            await cache.set(absoluteFp, contentHash, parsed)
            
            const group = filesByExtractor.get(langDef.extractor) || []
            group.push(parsed)
            filesByExtractor.set(langDef.extractor, group)
            parsedFilesCount += 1
        } catch (err: unknown) {
            if (process.env.MIKK_DEBUG) {
                console.error(`[parser] Error extracting ${absoluteFp}:`, err instanceof Error ? err.message : String(err))
            }
            fallbackFilesCount += 1
            
            const errorMessage = normalizeErrorMessage(err)
            const language = langDef?.name ?? languageForExtension(ext) ?? 'unknown'
            
            const recoveryEngine = new ErrorRecoveryEngine()
            const recoveryResult = await recoveryEngine.recover(absoluteFp, content!, language)
            
            if (recoveryResult.success && recoveryResult.confidence > 0.2) {
                fallbackFiles.push(recoveryResult.parsed)
                diagnostics.push({
                    filePath: absoluteFp,
                    extension: ext,
                    stage: 'parse',
                    reason: 'parse-error-recovered',
                    message: `${errorMessage} | Recovered ${recoveryResult.strategy} (confidence: ${(recoveryResult.confidence * 100).toFixed(0)}%) | ${recoveryResult.parsed.functions.length} fns, ${recoveryResult.parsed.classes.length} classes`,
                })
            } else {
                fallbackFiles.push(buildFallbackParsedFile(absoluteFp, content!, ext))
                diagnostics.push({
                    filePath: absoluteFp,
                    extension: ext,
                    stage: 'parse',
                    reason: 'parse-error',
                    message: errorMessage,
                })
            }
        }
    }

    for (const [extractor, files] of filesByExtractor.entries()) {
        try {
            const resolved = await extractor.resolveImports(files, normalizedRoot)
            
            for (let i = 0; i < files.length; i++) {
                const originalFile = files[i]
                const resolvedFile = resolved[i]
                if (resolvedFile && resolvedFile !== originalFile) {
                    files[i] = resolvedFile
                }
            }
            fallbackFiles.push(...files)
        } catch (err: unknown) {
            diagnostics.push({
                filePath: '*',
                extension: '*',
                stage: 'resolve-imports',
                reason: 'resolve-error',
                message: normalizeErrorMessage(err),
            })
            fallbackFiles.push(...files)
        }
    }

    cache.flush()

    return {
        files: fallbackFiles,
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

export async function parseFiles(
    filePaths: string[],
    projectRoot: string,
    readFile: (fp: string) => Promise<string>
): Promise<ParsedFile[]> {
    const result = await parseFilesWithDiagnostics(filePaths, projectRoot, readFile)
    return result.files
}
