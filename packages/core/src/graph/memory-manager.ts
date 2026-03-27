/**
 * MemoryManager — monitors and limits heap usage during graph operations.
 *
 * Design notes:
 *  - No console.log/warn in production paths. All diagnostics are exposed
 *    via getMemoryStats() so callers can decide how to surface them.
 *  - The auto-GC timer is ref-unref'd so it doesn't keep the Node process alive.
 *  - dispose() must be called when the manager is no longer needed.
 */

const MEMORY_THRESHOLDS = {
    WARNING:   100 * 1024 * 1024,   // 100 MB
    CRITICAL:  200 * 1024 * 1024,   // 200 MB
    EMERGENCY: 400 * 1024 * 1024,   // 400 MB
} as const

const DEFAULT_CONFIG = {
    maxAge:     30 * 60 * 1000,     // 30 minutes
    maxNodes:   10_000,
    gcInterval: 60 * 1000,          // 1 minute
} as const

export interface MemoryStats {
    heapUsed:   number
    heapTotal:  number
    external:   number
    rss:        number
    percentage: number
    status: 'normal' | 'warning' | 'critical' | 'emergency'
}

export interface MemoryManagerConfig {
    maxAge?:       number
    maxNodes?:     number
    gcInterval?:   number
    enableAutoGC?: boolean
}

export class MemoryManager {
    private readonly maxAge:     number
    private readonly maxNodes:   number
    private readonly gcInterval: number
    private nodeCache = new Map<string, { data: unknown; timestamp: number }>()
    private gcTimer?: ReturnType<typeof setInterval>

    constructor(config: MemoryManagerConfig = {}) {
        this.maxAge     = config.maxAge     ?? DEFAULT_CONFIG.maxAge
        this.maxNodes   = config.maxNodes   ?? DEFAULT_CONFIG.maxNodes
        this.gcInterval = config.gcInterval ?? DEFAULT_CONFIG.gcInterval

        if (config.enableAutoGC !== false) this.startAutoGC()
    }

    getMemoryStats(): MemoryStats {
        const u = process.memoryUsage()
        const percentage = (u.heapUsed / u.heapTotal) * 100

        let status: MemoryStats['status'] = 'normal'
        if      (u.heapUsed > MEMORY_THRESHOLDS.EMERGENCY) status = 'emergency'
        else if (u.heapUsed > MEMORY_THRESHOLDS.CRITICAL)  status = 'critical'
        else if (u.heapUsed > MEMORY_THRESHOLDS.WARNING)   status = 'warning'

        return { heapUsed: u.heapUsed, heapTotal: u.heapTotal, external: u.external, rss: u.rss, percentage, status }
    }

    isMemoryCritical(): boolean {
        const { status } = this.getMemoryStats()
        return status === 'critical' || status === 'emergency'
    }

    forceGC(): void {
        if (typeof global.gc === 'function') global.gc()
    }

    cacheNode(id: string, data: unknown): void {
        if (this.nodeCache.size >= this.maxNodes) {
            this.evictOldest(Math.ceil(this.maxNodes * 0.1))
        }
        this.nodeCache.set(id, { data, timestamp: Date.now() })
    }

    getCachedNode(id: string): unknown | null {
        const entry = this.nodeCache.get(id)
        if (!entry) return null
        if (Date.now() - entry.timestamp > this.maxAge) {
            this.nodeCache.delete(id)
            return null
        }
        return entry.data
    }

    clearCache(): void {
        this.nodeCache.clear()
    }

    cleanup(): void {
        const now = Date.now()
        for (const [id, e] of this.nodeCache) {
            if (now - e.timestamp > this.maxAge) this.nodeCache.delete(id)
        }
        this.forceGC()
    }

    stopAutoGC(): void {
        if (this.gcTimer) { clearInterval(this.gcTimer); this.gcTimer = undefined }
    }

    dispose(): void {
        this.stopAutoGC()
        this.clearCache()
        this.forceGC()
    }

    private evictOldest(count: number): void {
        const sorted = [...this.nodeCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)
        for (let i = 0; i < Math.min(count, sorted.length); i++) {
            this.nodeCache.delete(sorted[i][0])
        }
    }

    private startAutoGC(): void {
        this.gcTimer = setInterval(() => {
            if (this.isMemoryCritical()) this.cleanup()
        }, this.gcInterval)

        // Don't keep the Node process alive just for GC checks
        if (this.gcTimer.unref) this.gcTimer.unref()
    }
}

/**
 * MemoryAwareGraphBuilder — builds a graph from a lock with memory monitoring.
 * Builds purely from the in-memory lock; does NOT re-parse source files.
 */
export class MemoryAwareGraphBuilder {
    private memoryManager: MemoryManager

    constructor(config?: MemoryManagerConfig) {
        this.memoryManager = new MemoryManager(config)
    }

    buildGraph(lock: {
        functions?: Record<string, { name: string; file: string; moduleId: string; isExported?: boolean; isAsync?: boolean; calls?: string[] }>
    }) {
        if (this.memoryManager.isMemoryCritical()) this.memoryManager.cleanup()

        try {
            return this.buildInternal(lock)
        } finally {
            this.memoryManager.cleanup()
        }
    }

    getMemoryStats(): MemoryStats { return this.memoryManager.getMemoryStats() }
    dispose(): void               { this.memoryManager.dispose() }

    private buildInternal(lock: {
        functions?: Record<string, { name: string; file: string; moduleId: string; isExported?: boolean; isAsync?: boolean; calls?: string[] }>
    }) {
        const nodes    = new Map<string, unknown>()
        const edges:   unknown[] = []
        const outEdges = new Map<string, unknown[]>()
        const inEdges  = new Map<string, unknown[]>()

        for (const [id, fn] of Object.entries(lock.functions ?? {})) {
            nodes.set(id, {
                id, name: fn.name, file: fn.file, type: 'function', moduleId: fn.moduleId,
                metadata: { isExported: fn.isExported, isAsync: fn.isAsync },
            })
            outEdges.set(id, [])
            inEdges.set(id, [])
        }

        for (const [id, fn] of Object.entries(lock.functions ?? {})) {
            for (const targetId of fn.calls ?? []) {
                if (!nodes.has(targetId)) continue
                const edge = { from: id, to: targetId, type: 'calls', confidence: 1.0 }
                edges.push(edge)
                outEdges.get(id)!.push(edge)
                inEdges.get(targetId)!.push(edge)
            }
        }

        return { nodes, edges, outEdges, inEdges }
    }
}
