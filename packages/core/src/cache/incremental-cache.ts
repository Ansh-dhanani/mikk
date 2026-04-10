import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { ParsedFile } from '../parser/types.js'

interface CacheEntry {
  hash: string
  parsedAt: string
  size: number
  lastAccessed: number
}

interface CacheMetadata {
  version: number
  entries: Map<string, CacheEntry>
  lastPruned: number
}

const CACHE_VERSION = 1
const MAX_CACHE_SIZE = 5000
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

export class IncrementalCache {
  private cacheDir: string
  private metadata: CacheMetadata
  private hits = 0
  private misses = 0
  private queue: Array<() => void> = []
  private running = false
  private initialized = false
  private pendingInit: Promise<void> | null = null

  constructor(projectRoot: string) {
    this.cacheDir = path.join(projectRoot, '.mikk', 'cache')
    this.metadata = {
      version: CACHE_VERSION,
      entries: new Map(),
      lastPruned: Date.now(),
    }
    this.pendingInit = this.loadMetadata()
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return
    if (this.pendingInit) {
      await this.pendingInit
    }
  }

  private async withMutex<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          await this.ensureInitialized()
          const result = await fn()
          resolve(result)
        } catch (err) {
          reject(err)
        }
      })
      if (!this.running) {
        this.processQueue()
      }
    })
  }

  private async processQueue(): Promise<void> {
    this.running = true
    while (this.queue.length > 0) {
      const fn = this.queue.shift()!
      await fn()
    }
    this.running = false
  }

  private getCacheFilePath(hash: string): string {
    return path.join(this.cacheDir, `${hash}.json`)
  }

  private async loadMetadata(): Promise<void> {
    const metaPath = path.join(this.cacheDir, 'metadata.json')
    try {
      const raw = await fs.readFile(metaPath, 'utf-8')
      const data = JSON.parse(raw)
      this.metadata.version = data.version ?? CACHE_VERSION
      this.metadata.lastPruned = data.lastPruned ?? Date.now()
      this.metadata.entries = new Map(Object.entries(data.entries ?? {}))
      this.initialized = true
    } catch {
      this.metadata.entries = new Map()
      this.initialized = true
    }
  }

  private async saveMetadata(): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true })
      const metaPath = path.join(this.cacheDir, 'metadata.json')
      const serializable = {
        version: this.metadata.version,
        lastPruned: this.metadata.lastPruned,
        entries: Object.fromEntries(this.metadata.entries),
      }
      await fs.writeFile(metaPath, JSON.stringify(serializable), 'utf-8')
    } catch {
      // Silently fail — cache is non-critical
    }
  }

  /**
   * Get cached parse result if content hash matches.
   * Returns null if cache miss or stale.
   */
  async get(filePath: string, contentHash: string): Promise<ParsedFile | null> {
    return this.withMutex(async () => {
      const entry = this.metadata.entries.get(filePath)
      if (!entry) {
        this.misses++
        return null
      }

      if (entry.hash !== contentHash) {
        this.misses++
        return null
      }

      const parsedAt = new Date(entry.parsedAt).getTime()
      if (Date.now() - parsedAt > CACHE_TTL_MS) {
        this.metadata.entries.delete(filePath)
        this.misses++
        return null
      }

      const cacheFile = this.getCacheFilePath(contentHash)
      try {
        const raw = await fs.readFile(cacheFile, 'utf-8')
        const parsed = JSON.parse(raw) as ParsedFile
        this.hits++
        entry.lastAccessed = Date.now()
        return parsed
      } catch (err) {
        console.warn(`Corrupted cache entry for ${filePath}:`, err)
        this.metadata.entries.delete(filePath)
      }

      this.misses++
      return null
    })
  }

  /**
   * Store parse result in cache.
   */
  async set(filePath: string, contentHash: string, parsed: ParsedFile): Promise<void> {
    return this.withMutex(async () => {
      if (this.metadata.entries.size >= MAX_CACHE_SIZE) {
        await this.evictLRU()
      }

      const entry: CacheEntry = {
        hash: contentHash,
        parsedAt: new Date().toISOString(),
        size: JSON.stringify(parsed).length,
        lastAccessed: Date.now()
      }

      this.metadata.entries.set(filePath, entry)

      try {
        await fs.mkdir(this.cacheDir, { recursive: true })
        const cacheFile = this.getCacheFilePath(contentHash)
        await fs.writeFile(cacheFile, JSON.stringify(parsed), 'utf-8')
      } catch {
        // Silently fail — cache is non-critical
      }
    })
  }

  /**
   * Invalidate cache for a specific file.
   */
  async invalidate(filePath: string): Promise<void> {
    return this.withMutex(async () => {
      const entry = this.metadata.entries.get(filePath)
      if (entry) {
        const cacheFile = this.getCacheFilePath(entry.hash)
        try {
          await fs.unlink(cacheFile)
        } catch { /* ignore */ }
        this.metadata.entries.delete(filePath)
      }
    })
  }

  /**
   * Clear entire cache.
   */
  async clear(): Promise<void> {
    return this.withMutex(async () => {
      for (const [, entry] of this.metadata.entries) {
        const cacheFile = this.getCacheFilePath(entry.hash)
        try {
          await fs.unlink(cacheFile)
        } catch { /* ignore */ }
      }
      this.metadata.entries.clear()
      await this.saveMetadata()
    })
  }

  /**
   * Get cache statistics.
   */
  getStats(): { hits: number; misses: number; hitRate: number; size: number } {
    const total = this.hits + this.misses
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      size: this.metadata.entries.size,
    }
  }

  /**
   * Persist cache metadata to disk.
   * Call this after batch operations.
   */
  async flush(): Promise<void> {
    return this.withMutex(async () => {
      await this.saveMetadata()
    })
  }

  /**
   * Evict least recently used entries when cache is full.
   */
  private async evictLRU(): Promise<void> {
    const sorted = [...this.metadata.entries.entries()].sort(
      (a, b) => new Date(a[1].parsedAt).getTime() - new Date(b[1].parsedAt).getTime()
    )
    const toRemove = Math.ceil(sorted.length * 0.2)
    for (let i = 0; i < toRemove; i++) {
      const [filePath, entry] = sorted[i]
      const cacheFile = this.getCacheFilePath(entry.hash)
      try {
        await fs.unlink(cacheFile)
      } catch { /* ignore */ }
      this.metadata.entries.delete(filePath)
    }
  }

  /**
   * Prune expired entries from cache.
   */
  async prune(): Promise<void> {
    return this.withMutex(async () => {
      const now = Date.now()
      const toDelete: string[] = []
      for (const [filePath, entry] of this.metadata.entries) {
        const parsedAt = new Date(entry.parsedAt).getTime()
        if (now - parsedAt > CACHE_TTL_MS) {
          toDelete.push(filePath)
        }
      }
      for (const filePath of toDelete) {
        const entry = this.metadata.entries.get(filePath)
        if (entry) {
          const cacheFile = this.getCacheFilePath(entry.hash)
          try {
            await fs.unlink(cacheFile)
          } catch { /* ignore */ }
          this.metadata.entries.delete(filePath)
        }
      }
      this.metadata.lastPruned = now
      await this.saveMetadata()
    })
  }
}
