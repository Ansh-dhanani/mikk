import * as fs from 'node:fs'
import * as path from 'node:path'
import type { ParsedFile } from '../parser/types.js'

// ---------------------------------------------------------------------------
// Incremental Analysis Cache — avoids re-parsing unchanged files
// ---------------------------------------------------------------------------

interface CacheEntry {
  hash: string
  parsedAt: string
  // Store lightweight metadata instead of full ParsedFile to prevent metadata bloat
  size: number
  lastAccessed: number
}

interface CacheMetadata {
  version: number
  entries: Map<string, CacheEntry>
  lastPruned: number
}

const CACHE_VERSION = 1
const MAX_CACHE_SIZE = 5000 // Max entries before LRU eviction
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

export class IncrementalCache {
  private cacheDir: string
  private metadata: CacheMetadata
  private hits = 0
  private misses = 0
  // Mutex to prevent race conditions during concurrent access
  private mutex = Promise.resolve()

   constructor(projectRoot: string) {
     this.cacheDir = path.join(projectRoot, '.mikk', 'cache')
     this.metadata = {
       version: CACHE_VERSION,
       entries: new Map(),
       lastPruned: Date.now(),
     }
     this.loadMetadata()
   }

   /**
    * Simple mutex-like protection using a flag for basic race condition prevention
    * Note: For production, a proper mutex library would be better
    */
   private isLocked = false
   private async withMutex<T>(fn: () => Promise<T>): Promise<T> {
     while (this.isLocked) {
       await new Promise(resolve => setTimeout(resolve, 1))
     }
     this.isLocked = true
     try {
       return await fn()
     } finally {
       this.isLocked = false
     }
   }

  private getCacheFilePath(hash: string): string {
    return path.join(this.cacheDir, `${hash}.json`)
  }

  private loadMetadata(): void {
    const metaPath = path.join(this.cacheDir, 'metadata.json')
    try {
      if (fs.existsSync(metaPath)) {
        const raw = fs.readFileSync(metaPath, 'utf-8')
        const data = JSON.parse(raw)
        this.metadata.version = data.version ?? CACHE_VERSION
        this.metadata.lastPruned = data.lastPruned ?? Date.now()
        // Rebuild entries map
        this.metadata.entries = new Map(Object.entries(data.entries ?? {}))
      }
    } catch {
      // Corrupted metadata — start fresh
      this.metadata.entries = new Map()
    }
  }

  private saveMetadata(): void {
    try {
      fs.mkdirSync(this.cacheDir, { recursive: true })
      const metaPath = path.join(this.cacheDir, 'metadata.json')
      const serializable = {
        version: this.metadata.version,
        lastPruned: this.metadata.lastPruned,
        entries: Object.fromEntries(this.metadata.entries),
      }
      fs.writeFileSync(metaPath, JSON.stringify(serializable), 'utf-8')
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

      // Check TTL
      const parsedAt = new Date(entry.parsedAt).getTime()
      if (Date.now() - parsedAt > CACHE_TTL_MS) {
        this.metadata.entries.delete(filePath)
        this.misses++
        return null
      }

      // Load from disk and reconstruct ParsedFile
      const cacheFile = this.getCacheFilePath(contentHash)
      try {
        if (fs.existsSync(cacheFile)) {
          const raw = fs.readFileSync(cacheFile, 'utf-8')
          const parsed = JSON.parse(raw) as ParsedFile
          this.hits++
          // Update last accessed time
          entry.lastAccessed = Date.now()
          return parsed
        }
      } catch (err) {
        // Corrupted cache entry
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
      // Evict if cache is full
      if (this.metadata.entries.size >= MAX_CACHE_SIZE) {
        this.evictLRU()
      }

      const entry: CacheEntry = {
        hash: contentHash,
        parsedAt: new Date().toISOString(),
        // Store file size for lightweight tracking instead of full ParsedFile
        size: JSON.stringify(parsed).length,
        lastAccessed: Date.now()
      }

      this.metadata.entries.set(filePath, entry)

      // Write to disk
      try {
        fs.mkdirSync(this.cacheDir, { recursive: true })
        const cacheFile = this.getCacheFilePath(contentHash)
        fs.writeFileSync(cacheFile, JSON.stringify(parsed), 'utf-8')
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
          if (fs.existsSync(cacheFile)) {
            fs.unlinkSync(cacheFile)
          }
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
          if (fs.existsSync(cacheFile)) {
            fs.unlinkSync(cacheFile)
          }
        } catch { /* ignore */ }
      }
      this.metadata.entries.clear()
      this.saveMetadata()
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
      this.saveMetadata()
    })
  }

  /**
   * Evict least recently used entries when cache is full.
   */
  private evictLRU(): void {
    // Sort by parsedAt (oldest first) and remove oldest 20%
    const sorted = [...this.metadata.entries.entries()].sort(
      (a, b) => new Date(a[1].parsedAt).getTime() - new Date(b[1].parsedAt).getTime()
    )
    const toRemove = Math.ceil(sorted.length * 0.2)
    for (let i = 0; i < toRemove; i++) {
      const [filePath, entry] = sorted[i]
      const cacheFile = this.getCacheFilePath(entry.hash)
      try {
        if (fs.existsSync(cacheFile)) {
          fs.unlinkSync(cacheFile)
        }
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
      for (const [filePath, entry] of this.metadata.entries) {
        const parsedAt = new Date(entry.parsedAt).getTime()
        if (now - parsedAt > CACHE_TTL_MS) {
          this.invalidate(filePath)
        }
      }
      this.metadata.lastPruned = now
      this.saveMetadata()
    })
  }
}
