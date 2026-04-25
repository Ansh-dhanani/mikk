import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import {
    GraphBuilder, LockReader, ContractReader,
    parseFiles, readFileContent, discoverFiles, logger,
    type MikkLock, type MikkContract
} from '@getmikk/core'
import { FileWatcher } from './file-watcher.js'
import { IncrementalAnalyzer } from './incremental-analyzer.js'
import type { WatcherConfig, WatcherEvent, FileChangeEvent } from './types.js'

/** Sync state persisted to .mikk/sync-state.json */
interface SyncState {
    status: 'clean' | 'syncing' | 'drifted' | 'conflict'
    lastUpdated: number
    filesInFlight?: number
    rootHash?: string
    error?: string
}

/**
 * WatcherDaemon — long-running background process.
 * Starts the FileWatcher, handles the IncrementalAnalyzer,
 * writes updates to the lock file, and manages sync state.
 *
 * Features:
 * - Debounces file changes (100ms window)
 * - Batch threshold: if > 15 files in a batch, runs full analysis
 * - PID file for single-instance enforcement
 * - Atomic sync state writes
 */
export class WatcherDaemon {
    private watcher: FileWatcher
    private analyzer: IncrementalAnalyzer | null = null
    private lock: MikkLock | null = null
    private contract: MikkContract | null = null
    private handlers: ((event: WatcherEvent) => void)[] = []
    // Map<path, event> deduplicates by path automatically and gives O(1) insert/evict.
    // Using a Map preserves insertion order (oldest first) which we use for eviction.
    private pendingEvents: Map<string, FileChangeEvent> = new Map()
    private debounceTimer: ReturnType<typeof setTimeout> | null = null
    private processing = false

    constructor(private config: WatcherConfig) {
        this.watcher = new FileWatcher(config)
    }

    async start(): Promise<void> {
        try {
            await this.writePidFile()

            const contractReader = new ContractReader()
            const lockReader = new LockReader()
            const contractPath = path.join(this.config.projectRoot, 'mikk.json')
            const lockPath = path.join(this.config.projectRoot, 'mikk.lock.json')

            this.contract = await contractReader.read(contractPath)
            this.lock = await lockReader.read(lockPath)

            const filePaths = await discoverFiles(this.config.projectRoot)
            const parsedFiles = await parseFiles(filePaths, this.config.projectRoot, (fp) =>
                readFileContent(fp)
            )
            const graph = new GraphBuilder().build(parsedFiles)

            this.analyzer = new IncrementalAnalyzer(graph, this.lock, this.contract, this.config.projectRoot)

            for (const file of parsedFiles) {
                this.analyzer.addParsedFile(file)
            }

            const initialHashes = new Map<string, string>()
            for (const file of parsedFiles) {
                if (file.hash) {
                    initialHashes.set(file.path.replace(/\\/g, '/'), file.hash)
                }
            }
            this.watcher.seedHashes(initialHashes)

            this.watcher.on(async (event: WatcherEvent) => {
                if (event.type === 'file:changed') {
                    this.enqueueChange(event.data)
                }
                for (const handler of this.handlers) {
                    try {
                        await handler(event)
                    } catch (err) {
                        console.error('[WatcherDaemon] Handler error:', err)
                    }
                }
            })

            this.watcher.start()
            await this.writeSyncState({ status: 'clean', lastUpdated: Date.now() })
            logger.info('Mikk watcher started', { watching: this.config.include })
        } catch (err) {
            logger.error('Failed to start watcher', { error: err instanceof Error ? err.message : String(err) })
            throw err
        }
    }

    async stop(): Promise<void> {
        await this.watcher.stop()
        if (this.debounceTimer) clearTimeout(this.debounceTimer)
        await this.removePidFile()
        logger.info('Mikk watcher stopped')
    }

    on(handler: (event: WatcherEvent) => void): void {
        this.handlers.push(handler)
    }

    // ─── Debounce & Batch Processing ──────────────────────────────

    private enqueueChange(event: FileChangeEvent): void {
        const MAX_PENDING_EVENTS = 1000
        // Insert/update (deduplicates by path automatically).
        // If at capacity, evict the oldest entry in O(1) via Map iteration order.
        if (!this.pendingEvents.has(event.path) && this.pendingEvents.size >= MAX_PENDING_EVENTS) {
            const oldestKey = this.pendingEvents.keys().next().value
            if (oldestKey !== undefined) this.pendingEvents.delete(oldestKey)
        }
        this.pendingEvents.set(event.path, event)

        // Cancel any pending flush and schedule new one
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer)
            this.debounceTimer = null
        }
        const delay = this.config.debounceMs || 100
        this.debounceTimer = setTimeout(() => {
            this.debounceTimer = null
            this.flushPendingEvents()
        }, delay)
    }

    private async flushPendingEvents(): Promise<void> {
        // Prevent concurrent flushes with atomic flag
        if (this.processing || this.pendingEvents.size === 0) return
        this.processing = true

        // Drain the map — events are already deduplicated by path.
        const dedupedEvents = [...this.pendingEvents.values()]
        this.pendingEvents.clear()

        await this.writeSyncState({
            status: 'syncing',
            lastUpdated: Date.now(),
            filesInFlight: dedupedEvents.length,
        })

        try {
            await this.processBatch(dedupedEvents)
            await this.writeSyncState({
                status: 'clean',
                lastUpdated: Date.now(),
            })
        } catch (err: unknown) {
            await this.writeSyncState({
                status: 'drifted',
                lastUpdated: Date.now(),
                error: err instanceof Error ? err.message : String(err),
            })
        } finally {
            this.processing = false

            // If more events arrived during processing, flush again
            if (this.pendingEvents.size > 0) {
                this.flushPendingEvents()
            }
        }
    }

    private async processBatch(events: FileChangeEvent[]): Promise<void> {
        if (!this.analyzer || !this.lock) return

        try {
            const expectedGenerationId = this.lock.syncState.generationId
            const expectedWriteVersion = this.lock.syncState.writeVersion
            const result = await this.analyzer.analyzeBatch(events)
            const nextLock = result.lock

            // Write updated lock
            const lockPath = path.join(this.config.projectRoot, 'mikk.lock.json')
            const lockReader = new LockReader()
            await lockReader.write(nextLock, lockPath, {
                expectedGenerationId,
                expectedWriteVersion,
            })
            this.lock = nextLock

            // Log batch info
            if (result.mode === 'full') {
                logger.info('Full re-analysis completed', {
                    filesChanged: events.length,
                    reason: 'Large batch detected (> 15 files)',
                })
            }

            // Emit graph:updated event
            for (const handler of this.handlers) {
                handler({
                    type: 'graph:updated',
                    data: {
                        changedNodes: result.impactResult.changed,
                        impactedNodes: result.impactResult.impacted,
                    },
                })
            }

            logger.info('Lock file updated', {
                filesChanged: events.length,
                mode: result.mode,
                impactedNodes: result.impactResult.impacted.length,
            })
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err)
            logger.error('Failed to analyze file changes', {
                files: events.map(e => e.path),
                error: errorMessage,
            })
            for (const handler of this.handlers) {
                handler({
                    type: 'sync:drifted',
                    data: {
                        reason: errorMessage,
                        affectedModules: events.flatMap(e => e.affectedModuleIds),
                    },
                })
            }
            throw err
        }
    }

    // ─── Sync State ───────────────────────────────────────────────

    /** Write sync state atomically (write to temp, then rename) */
    private async writeSyncState(state: SyncState): Promise<void> {
        const mikkDir = path.join(this.config.projectRoot, '.mikk')
        await fs.mkdir(mikkDir, { recursive: true })
        const statePath = path.join(mikkDir, 'sync-state.json')
        const tmpPath = statePath + '.tmp'
        await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf-8')
        await fs.rename(tmpPath, statePath)
    }

    // ─── PID File ─────────────────────────────────────────────────

    private async writePidFile(): Promise<void> {
        const mikkDir = path.join(this.config.projectRoot, '.mikk')
        await fs.mkdir(mikkDir, { recursive: true })
        const pidPath = path.join(mikkDir, 'watcher.pid')
        await fs.writeFile(pidPath, String(process.pid), 'utf-8')
    }

    private async removePidFile(): Promise<void> {
        const pidPath = path.join(this.config.projectRoot, '.mikk', 'watcher.pid')
        try { await fs.unlink(pidPath) } catch { /* ignore if missing */ }
    }
}
