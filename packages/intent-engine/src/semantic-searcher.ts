import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import type { MikkLock } from '@getmikk/core'

interface EmbeddingCache {
    lockFingerprint: string
    model: string
    embeddings: Record<string, number[]> // fnId → unit-normed vector
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
 * SemanticSearcher — finds functions semantically similar to a natural-language
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
    private pipeline: any = null
    private cache: EmbeddingCache | null = null

    constructor(private readonly projectRoot: string) {
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
     * Safe to call on every MCP request — cache hit is O(1) disk read.
     */
    async index(lock: MikkLock): Promise<void> {
        const fingerprint = lockFingerprint(lock)

        // ── Cache hit ──────────────────────────────────────────────────────
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
        } catch { /* miss or corrupt — rebuild */ }

        // ── Empty lock fast-path — nothing to embed ────────────────────────
        const fns = Object.values(lock.functions)
        if (fns.length === 0) {
            this.cache = { lockFingerprint: fingerprint, model: SemanticSearcher.MODEL, embeddings: {} }
            return
        }

        // Text representation: name + purpose + param names (no bodies, keeps it fast)
        const texts = fns.map(fn => {
            const parts: string[] = [fn.name]
            if (fn.purpose) parts.push(fn.purpose)
            if (fn.params?.length) parts.push(fn.params.map((p: any) => p.name).join(' '))
            if (fn.returnType && fn.returnType !== 'void' && fn.returnType !== 'any') {
                parts.push('returns ' + fn.returnType)
            }
            return parts.join(' ')
        })

        await this.ensurePipeline()
        const embeddings: Record<string, number[]> = {}
        const BATCH = 64
        for (let i = 0; i < fns.length; i += BATCH) {
            const batch = texts.slice(i, i + BATCH)
            const output = await this.pipeline(batch, { pooling: 'mean', normalize: true })
            for (let j = 0; j < batch.length; j++) {
                embeddings[fns[i + j].id] = Array.from(output[j].data as Float32Array)
            }
        }

        this.cache = { lockFingerprint: fingerprint, model: SemanticSearcher.MODEL, embeddings }
        await fs.mkdir(path.dirname(this.cachePath), { recursive: true })
        await fs.writeFile(this.cachePath, JSON.stringify(this.cache))
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

    private async ensurePipeline() {
        if (this.pipeline) return
        const { pipeline } = await import('@xenova/transformers')
        this.pipeline = await pipeline('feature-extraction', SemanticSearcher.MODEL)
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Lightweight fingerprint: function count + first 20 sorted IDs */
function lockFingerprint(lock: MikkLock): string {
    const ids = Object.keys(lock.functions).sort().slice(0, 20).join('|')
    return `${Object.keys(lock.functions).length}:${ids}`
}

function cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
    // Vectors are already unit-normed by the model (normalize: true), so |a|=|b|=1
    return Math.max(-1, Math.min(1, dot))
}
