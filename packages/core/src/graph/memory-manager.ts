/**
 * Memory Manager for Large Graph Operations
 * 
 * Provides memory monitoring, cleanup, and optimization for graph operations
 * that can consume significant amounts of memory in large codebases.
 */

// Memory thresholds in bytes
const MEMORY_THRESHOLDS = {
    WARNING: 100 * 1024 * 1024,    // 100MB
    CRITICAL: 200 * 1024 * 1024,   // 200MB
    EMERGENCY: 400 * 1024 * 1024,  // 400MB
}

// Default cleanup configuration
const DEFAULT_CLEANUP_CONFIG = {
    maxAge: 30 * 60 * 1000,        // 30 minutes
    maxNodes: 10000,                // Maximum nodes to keep in memory
    gcInterval: 60 * 1000,          // GC check interval (1 minute)
}

export interface MemoryStats {
    heapUsed: number
    heapTotal: number
    external: number
    rss: number
    percentage: number
    status: 'normal' | 'warning' | 'critical' | 'emergency'
}

export interface MemoryManagerConfig {
    maxAge?: number
    maxNodes?: number
    gcInterval?: number
    enableAutoGC?: boolean
}

/**
 * Memory Manager for graph operations
 */
export class MemoryManager {
    private config: Required<MemoryManagerConfig>
    private lastGC = Date.now()
    private nodeCache = new Map<string, { data: any; timestamp: number }>()
    private gcTimer?: NodeJS.Timeout

    constructor(config: MemoryManagerConfig = {}) {
        this.config = {
            maxAge: config.maxAge ?? DEFAULT_CLEANUP_CONFIG.maxAge,
            maxNodes: config.maxNodes ?? DEFAULT_CLEANUP_CONFIG.maxNodes,
            gcInterval: config.gcInterval ?? DEFAULT_CLEANUP_CONFIG.gcInterval,
            enableAutoGC: config.enableAutoGC ?? true,
        }

        if (this.config.enableAutoGC) {
            this.startAutoGC()
        }
    }

    /**
     * Get current memory statistics
     */
    getMemoryStats(): MemoryStats {
        const usage = process.memoryUsage()
        const percentage = (usage.heapUsed / usage.heapTotal) * 100

        let status: MemoryStats['status'] = 'normal'
        if (usage.heapUsed > MEMORY_THRESHOLDS.EMERGENCY) {
            status = 'emergency'
        } else if (usage.heapUsed > MEMORY_THRESHOLDS.CRITICAL) {
            status = 'critical'
        } else if (usage.heapUsed > MEMORY_THRESHOLDS.WARNING) {
            status = 'warning'
        }

        return {
            heapUsed: usage.heapUsed,
            heapTotal: usage.heapTotal,
            external: usage.external,
            rss: usage.rss,
            percentage,
            status,
        }
    }

    /**
     * Check if memory usage is critical
     */
    isMemoryCritical(): boolean {
        const stats = this.getMemoryStats()
        return stats.status === 'critical' || stats.status === 'emergency'
    }

    /**
     * Force garbage collection if available
     */
    forceGC(): void {
        if (global.gc) {
            global.gc()
            this.lastGC = Date.now()
        }
    }

    /**
     * Cache a node with automatic cleanup
     */
    cacheNode(id: string, data: any): void {
        // If we're at the node limit, remove oldest entries
        if (this.nodeCache.size >= this.config.maxNodes) {
            this.evictOldestNodes(Math.floor(this.config.maxNodes * 0.1)) // Remove 10%
        }

        this.nodeCache.set(id, {
            data,
            timestamp: Date.now(),
        })
    }

    /**
     * Get cached node data
     */
    getCachedNode(id: string): any | null {
        const cached = this.nodeCache.get(id)
        if (!cached) return null

        // Check if expired
        if (Date.now() - cached.timestamp > this.config.maxAge) {
            this.nodeCache.delete(id)
            return null
        }

        return cached.data
    }

    /**
     * Clear node cache
     */
    clearCache(): void {
        this.nodeCache.clear()
    }

    /**
     * Perform comprehensive memory cleanup
     */
    cleanup(): void {
        // Clear expired cache entries
        const now = Date.now()
        for (const [id, cached] of this.nodeCache.entries()) {
            if (now - cached.timestamp > this.config.maxAge) {
                this.nodeCache.delete(id)
            }
        }

        // Force garbage collection
        this.forceGC()
    }

    /**
     * Evict oldest nodes from cache
     */
    private evictOldestNodes(count: number): void {
        const entries = Array.from(this.nodeCache.entries())
            .sort((a, b) => a[1].timestamp - b[1].timestamp)

        for (let i = 0; i < Math.min(count, entries.length); i++) {
            this.nodeCache.delete(entries[i][0])
        }
    }

    /**
     * Start automatic garbage collection
     */
    private startAutoGC(): void {
        this.gcTimer = setInterval(() => {
            const stats = this.getMemoryStats()
            
            // If memory usage is high, perform cleanup
            if (stats.status !== 'normal') {
                this.cleanup()
            }

            // Periodic cleanup regardless of memory pressure
            if (Date.now() - this.lastGC > this.config.gcInterval) {
                this.cleanup()
            }
        }, this.config.gcInterval)
    }

    /**
     * Stop automatic garbage collection
     */
    stopAutoGC(): void {
        if (this.gcTimer) {
            clearInterval(this.gcTimer)
            this.gcTimer = undefined
        }
    }

    /**
     * Dispose of memory manager
     */
    dispose(): void {
        this.stopAutoGC()
        this.clearCache()
        this.forceGC()
    }
}

/**
 * Memory-aware graph builder wrapper
 */
export class MemoryAwareGraphBuilder {
    private memoryManager: MemoryManager

    constructor(config?: MemoryManagerConfig) {
        this.memoryManager = new MemoryManager(config)
    }

    /**
     * Build graph with memory monitoring
     */
    buildGraph(lock: any): any {
        const stats = this.memoryManager.getMemoryStats()
        
        // Check memory before starting
        if (this.memoryManager.isMemoryCritical()) {
            console.warn('Memory usage is critical, performing cleanup before graph build')
            this.memoryManager.cleanup()
        }

        try {
            // Build graph implementation here
            return this.buildGraphInternal(lock)
        } finally {
            // Cleanup after build
            this.memoryManager.cleanup()
        }
    }

    /**
     * Internal graph building implementation
     */
    private buildGraphInternal(lock: any): any {
        const nodes = new Map<string, any>()
        const edges: any[] = []
        const outEdges = new Map<string, any[]>()
        const inEdges = new Map<string, any[]>()

        // Process functions with memory monitoring
        for (const [id, fn] of Object.entries(lock.functions || {})) {
            // Check memory periodically
            if (nodes.size % 1000 === 0) {
                if (this.memoryManager.isMemoryCritical()) {
                    console.warn('Memory pressure detected during graph build, forcing cleanup')
                    this.memoryManager.cleanup()
                }
            }

            const node = {
                id,
                name: (fn as any).name,
                file: (fn as any).file,
                type: 'function',
                moduleId: (fn as any).moduleId,
                metadata: {
                    isExported: (fn as any).isExported,
                    isAsync: (fn as any).isAsync,
                },
            }

            nodes.set(id, node)
            outEdges.set(id, [])
            inEdges.set(id, [])
        }

        // Process edges
        for (const [id, fn] of Object.entries(lock.functions || {})) {
            const calls = (fn as any).calls || []
            for (const targetId of calls) {
                if (nodes.has(targetId)) {
                    const edge = {
                        from: id,
                        to: targetId,
                        type: 'calls',
                    }
                    edges.push(edge)
                    outEdges.get(id)?.push(edge)
                    inEdges.get(targetId)?.push(edge)
                }
            }
        }

        return {
            nodes,
            edges,
            outEdges,
            inEdges,
        }
    }

    /**
     * Get memory statistics
     */
    getMemoryStats(): MemoryStats {
        return this.memoryManager.getMemoryStats()
    }

    /**
     * Dispose of the graph builder
     */
    dispose(): void {
        this.memoryManager.dispose()
    }
}

/**
 * Utility function to monitor memory usage during operations
 */
export function withMemoryMonitoring<T>(
    operation: () => T,
    memoryManager?: MemoryManager
): T {
    const manager = memoryManager || new MemoryManager({ enableAutoGC: false })
    
    const initialStats = manager.getMemoryStats()
    console.log(`Memory before operation: ${(initialStats.heapUsed / 1024 / 1024).toFixed(1)}MB`)

    try {
        const result = operation()
        
        const finalStats = manager.getMemoryStats()
        const delta = finalStats.heapUsed - initialStats.heapUsed
        console.log(`Memory after operation: ${(finalStats.heapUsed / 1024 / 1024).toFixed(1)}MB (${delta >= 0 ? '+' : ''}${(delta / 1024 / 1024).toFixed(1)}MB)`)
        
        if (finalStats.status !== 'normal') {
            console.warn(`Memory status: ${finalStats.status}`)
        }

        return result
    } finally {
        if (!memoryManager) {
            manager.dispose()
        }
    }
}
