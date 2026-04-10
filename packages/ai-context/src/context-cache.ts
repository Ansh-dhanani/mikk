import type { AIContext, ContextQuery } from './types.js'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'

export interface CacheEntry {
    query: ContextQuery
    context: AIContext
    createdAt: number
    accessCount: number
    lastAccessed: number
    hash: string
}

export interface CacheStats {
    size: number
    hits: number
    misses: number
    evictions: number
    hitRate: number
}

export class ContextCache {
    private cache: Map<string, CacheEntry> = new Map()
    private hits = 0
    private misses = 0
    private evictions = 0
    private maxSize: number
    private ttlMs: number
    private cacheDir: string | null = null

    constructor(options: {
        maxSize?: number
        ttlMs?: number
        cacheDir?: string
    } = {}) {
        this.maxSize = options.maxSize ?? 500
        this.ttlMs = options.ttlMs ?? 1000 * 60 * 60
        this.cacheDir = options.cacheDir ?? null

        if (this.cacheDir) {
            this.loadFromDisk()
        }
    }

    private hashQuery(query: ContextQuery): string {
        const normalized = JSON.stringify(query, Object.keys(query).sort())
        return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 32)
    }

    get(query: ContextQuery): AIContext | null {
        const key = this.hashQuery(query)
        const entry = this.cache.get(key)

        if (!entry) {
            this.misses++
            return null
        }

        const now = Date.now()
        if (now - entry.createdAt > this.ttlMs) {
            this.cache.delete(key)
            this.evictions++
            this.misses++
            return null
        }

        entry.accessCount++
        entry.lastAccessed = now
        this.hits++
        return entry.context
    }

    set(query: ContextQuery, context: AIContext): void {
        const key = this.hashQuery(query)

        if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
            this.evictLRU()
        }

        this.cache.set(key, {
            query,
            context,
            createdAt: Date.now(),
            accessCount: 1,
            lastAccessed: Date.now(),
            hash: key,
        })

        if (this.cacheDir) {
            this.saveToDisk()
        }
    }

    has(query: ContextQuery): boolean {
        const key = this.hashQuery(query)
        const entry = this.cache.get(key)

        if (!entry) return false

        const now = Date.now()
        if (now - entry.createdAt > this.ttlMs) {
            this.cache.delete(key)
            return false
        }

        return true
    }

    invalidate(pattern?: RegExp): number {
        let count = 0

        if (!pattern) {
            count = this.cache.size
            this.cache.clear()
        } else {
            for (const [key, entry] of this.cache.entries()) {
                if (pattern.test(JSON.stringify(entry.query))) {
                    this.cache.delete(key)
                    count++
                }
            }
        }

        if (this.cacheDir) {
            this.saveToDisk()
        }

        return count
    }

    getStats(): CacheStats {
        const total = this.hits + this.misses
        return {
            size: this.cache.size,
            hits: this.hits,
            misses: this.misses,
            evictions: this.evictions,
            hitRate: total > 0 ? this.hits / total : 0,
        }
    }

    private evictLRU(): void {
        let oldestKey: string | null = null
        let oldestTime = Infinity

        for (const [key, entry] of this.cache.entries()) {
            if (entry.lastAccessed < oldestTime) {
                oldestTime = entry.lastAccessed
                oldestKey = key
            }
        }

        if (oldestKey) {
            this.cache.delete(oldestKey)
            this.evictions++
        }
    }

    private getCachePath(): string {
        if (!this.cacheDir) return ''
        return path.join(this.cacheDir, 'context-cache.json')
    }

    private loadFromDisk(): void {
        if (!this.cacheDir) return

        try {
            const cachePath = this.getCachePath()
            if (!fs.existsSync(cachePath)) return

            const data = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as Record<string, CacheEntry>
            const now = Date.now()

            for (const [key, entry] of Object.entries(data)) {
                if (now - entry.createdAt < this.ttlMs) {
                    this.cache.set(key, entry)
                }
            }
        } catch {
            // Ignore disk read errors
        }
    }

    private saveToDisk(): void {
        if (!this.cacheDir) return

        try {
            const cachePath = this.getCachePath()
            const data: Record<string, CacheEntry> = {}

            for (const [key, entry] of this.cache.entries()) {
                data[key] = entry
            }

            const dir = path.dirname(cachePath)
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true })
            }

            fs.writeFileSync(cachePath, JSON.stringify(data))
        } catch {
            // Ignore disk write errors
        }
    }

    clear(): void {
        this.cache.clear()
        this.hits = 0
        this.misses = 0
        this.evictions = 0
    }

    warmup(queries: ContextQuery[], builder: (q: ContextQuery) => AIContext): void {
        for (const query of queries) {
            if (!this.has(query)) {
                const context = builder(query)
                this.set(query, context)
            }
        }
    }
}

export const defaultContextCache = new ContextCache({
    maxSize: 500,
    ttlMs: 1000 * 60 * 60,
})
