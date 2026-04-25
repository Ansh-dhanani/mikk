import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import type { MikkLock, MikkLockFunction } from '@getmikk/core'

const MAX_BODY_TOKENS = 150

interface EmbeddingCache {
    lockFingerprint: string
    model: string
    embeddings: Record<string, number[]> // fnId -> unit-normed vector
}

export interface SemanticMatch {
    id: string
    name: string
    file: string
    moduleId: string
    purpose: string
    lines: string
    score: number // cosine similarity [0, 1]
}

/**
 * SemanticSearcher -- finds functions semantically similar to a natural-language
 * query using local embeddings via @xenova/transformers.
 *
 * Model: Xenova/all-MiniLM-L6-v2 (~22 MB, downloads once to ~/.cache/huggingface).
 * Embeddings are incrementally cached in {projectRoot}/.mikk/embeddings.json and
 * recomputed only when the lock changes (fingerprinted by function count + IDs).
 *
 * Usage:
 *   const searcher = new SemanticSearcher(projectRoot)
 *   await searcher.index(lock)
 *   const results = await searcher.search('validate JWT token', lock)
 */
export class SemanticSearcher {
    static readonly MODEL = 'Xenova/all-MiniLM-L6-v2'

    private readonly cachePath: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private pipeline: any = null
    private cache: EmbeddingCache | null = null

    constructor(private readonly projectRoot: string, private readonly onProgress?: (percent: number) => void) {
        this.cachePath = path.join(projectRoot, '.mikk', 'embeddings.json')
    }

    /**
     * Returns true when @xenova/transformers is installed and importable.
     * The MCP tool calls this to decide whether to surface the semantic search tool.
     */
    static async isAvailable(): Promise<boolean> {
        try {
            await import('@xenova/transformers')
            return true
        } catch {
            return false
        }
    }

    /**
     * Build (or load from cache) embeddings for every function in the lock.
     * Safe to call on every MCP request -- cache hit is O(1) disk read.
     */
    async index(lock: MikkLock): Promise<void> {
        const fingerprint = lockFingerprint(lock)

        // -- Cache hit --------------------------------------------------------
        try {
            const raw = await fs.readFile(this.cachePath, 'utf-8')
            const cached: EmbeddingCache = JSON.parse(raw)
            // Validate shape before trusting it
            if (
                typeof cached.lockFingerprint === 'string' &&
                typeof cached.model === 'string' &&
                typeof cached.embeddings === 'object' && cached.embeddings !== null &&
                cached.lockFingerprint === fingerprint &&
                cached.model === SemanticSearcher.MODEL
            ) {
                this.cache = cached
                return
            }
        } catch (err) {
            console.warn(`[mikk] Semantic search cache miss/rebuild: ${err instanceof Error ? err.message : String(err)}`)
        }

        // -- Empty lock fast-path -- nothing to embed ------------------------
        const fns = Object.values(lock.functions)
        if (fns.length === 0) {
            this.cache = { lockFingerprint: fingerprint, model: SemanticSearcher.MODEL, embeddings: {} }
            return
        }

        // Text representation: name + purpose + params + types + return type + body snippet
        // We process in batches to avoid overwhelming file handles and memory
        const embeddings: Record<string, number[]> = {}
        const BATCH = 64
        const total = fns.length

        await this.ensurePipeline()

        for (let i = 0; i < fns.length; i += BATCH) {
            const batchFns = fns.slice(i, i + BATCH)
            // Limit file reads concurrency within the batch
            const batchTexts = await Promise.all(batchFns.map(fn => buildRichText(fn, this.projectRoot)))
            const output = await this.pipeline(batchTexts, { pooling: 'mean', normalize: true })

            for (let j = 0; j < batchFns.length; j++) {
                embeddings[batchFns[j].id] = Array.from(output[j].data as Float32Array)
            }

            if (this.onProgress) {
                this.onProgress(Math.round(((i + batchFns.length) / total) * 100))
            }
        }

        this.cache = { lockFingerprint: fingerprint, model: SemanticSearcher.MODEL, embeddings }
        try {
            await fs.mkdir(path.dirname(this.cachePath), { recursive: true })
            await fs.writeFile(this.cachePath, JSON.stringify(this.cache))
        } catch (err) {
            console.warn(`[mikk] Failed to write semantic search cache: ${err instanceof Error ? err.message : String(err)}`)
        }
    }

    /**
     * Find the `topK` functions most semantically similar to `query`.
     * Call index() first.
     */
    async search(query: string, lock: MikkLock, topK = 10): Promise<SemanticMatch[]> {
        if (!this.cache) throw new Error('Call index() before search()')
        await this.ensurePipeline()

        const queryOut = await this.pipeline([query], { pooling: 'mean', normalize: true })
        const queryVec: number[] = Array.from(queryOut[0].data as Float32Array)

        const scored = Object.entries(this.cache.embeddings).map(([id, vec]) => ({
            id,
            score: cosineSimilarity(queryVec, vec),
        }))
        scored.sort((a, b) => b.score - a.score)

        return scored.slice(0, topK).map(({ id, score }) => {
            const fn = lock.functions[id]
            // Skip IDs that are in the embedding cache but no longer in the lock
            // (can happen if cache was read from disk and lock changed in same session)
            if (!fn) return null
            return {
                id,
                name: fn.name,
                file: fn.file ?? '',
                moduleId: fn.moduleId ?? '',
                purpose: fn.purpose ?? '',
                lines: `${fn.startLine}-${fn.endLine}`,
                score: Math.round(score * 1000) / 1000,
            }
        }).filter((r): r is SemanticMatch => r !== null)
    }

    private async ensurePipeline(progressMsg?: string) {
        if (this.pipeline) return
        if (progressMsg && this.onProgress) {
            this.onProgress(0)
        }
        const { pipeline } = await import('@xenova/transformers')
        this.pipeline = await pipeline('feature-extraction', SemanticSearcher.MODEL)
        if (this.onProgress) {
            this.onProgress(5)
        }
    }
}

async function buildRichText(fn: MikkLockFunction, projectRoot: string): Promise<string> {
    const parts: string[] = [fn.name]

    if (fn.purpose) {
        parts.push(fn.purpose)
    }

    if (fn.params?.length) {
        const paramStr = fn.params.map((p) => p.name).join(' ')
        const typeStr = fn.params.map((p) => p.type || '').filter(Boolean).join(' ')
        parts.push(paramStr, typeStr)
    }

    if (fn.returnType && fn.returnType !== 'void' && fn.returnType !== 'any') {
        parts.push('returns', fn.returnType)
    }

    const body = await getFunctionBodySnippet(fn, projectRoot)
    if (body) {
        parts.push(body)
    }

    return parts.join(' ')
}

async function getFunctionBodySnippet(fn: MikkLockFunction, projectRoot: string): Promise<string> {
    try {
        const fullPath = path.join(projectRoot, fn.file)
        const content = await fs.readFile(fullPath, 'utf-8')
        const lines = content.split('\n')
        const start = Math.max(0, fn.startLine - 1)
        const end = Math.min(lines.length, fn.endLine)
        const bodyLines = lines.slice(start, end)
        const bodyText = bodyLines.join(' ')

        const cleaned = cleanCodeForEmbedding(bodyText)

        const tokens = cleaned.split(/\s+/).filter(Boolean)
        if (tokens.length <= MAX_BODY_TOKENS) {
            return cleaned
        }

        const truncated = tokens.slice(0, MAX_BODY_TOKENS).join(' ')
        return truncated + ' ...'
    } catch {
        return ''
    }
}

function cleanCodeForEmbedding(code: string): string {
    return code
        .replace(/\/\*\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' ')
        .replace(/#.*$/gm, ' ')
        .replace(/['"`][^'"`]*['"`]/g, ' ')
        .replace(/\{[^}]*\}/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

async function _readFileCached(filePath: string, cache: Map<string, string>): Promise<string> {
    if (cache.has(filePath)) {
        return cache.get(filePath)!
    }
    try {
        const content = await fs.readFile(filePath, 'utf-8')
        cache.set(filePath, content)
        return content
    } catch {
        return ''
    }
}

/** Improved fingerprint: function count + all sorted IDs + all function hashes + metadata */
function lockFingerprint(lock: MikkLock): string {
    const fns = Object.values(lock.functions)
        .map((fn, index) => {
            const fallbackId = `${fn.file ?? ''}:${fn.name ?? 'anonymous'}:${fn.startLine ?? 0}:${index}`
            return {
                id: typeof fn.id === 'string' && fn.id.length > 0 ? fn.id : fallbackId,
                hash: typeof fn.hash === 'string' ? fn.hash : '',
            }
        })
        .sort((a, b) => a.id.localeCompare(b.id))
    const fingerprintText = fns.map(fn => `${fn.id}:${fn.hash}`).join('|')
    const fnCount = fns.length
    const fileCount = Object.keys(lock.files ?? {}).length
    const moduleCount = Object.keys(lock.modules ?? {}).length
    const hash = hashContent(`${fnCount}:${fileCount}:${moduleCount}:${fingerprintText}`)
    return hash.slice(0, 32)
}

function hashContent(content: string): string {
    let hash = 0
    for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i)
        hash = ((hash << 5) - hash) + char
        hash = hash & hash
    }
    return Math.abs(hash).toString(16)
}

function cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
    // Vectors are already unit-normed by the model (normalize: true), so |a|=|b|=1
    return Math.max(-1, Math.min(1, dot))
}
