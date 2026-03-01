import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import {
    GraphBuilder, LockCompiler, LockReader, ContractReader,
    parseFiles, readFileContent, discoverFiles, logger,
    type DependencyGraph, type MikkLock, type MikkContract
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
    private pendingEvents: FileChangeEvent[] = []
    private debounceTimer: ReturnType<typeof setTimeout> | null = null
    private processing = false

    constructor(private config: WatcherConfig) {
        this.watcher = new FileWatcher(config)
    }

    async start(): Promise<void> {
        // Write PID file for single-instance enforcement
        await this.writePidFile()

        // Load existing contract and lock
        const contractReader = new ContractReader()
        const lockReader = new LockReader()
        const contractPath = path.join(this.config.projectRoot, 'mikk.json')
        const lockPath = path.join(this.config.projectRoot, 'mikk.lock.json')

        this.contract = await contractReader.read(contractPath)
        this.lock = await lockReader.read(lockPath)

        // Parse all files to populate the analyzer
        const filePaths = await discoverFiles(this.config.projectRoot)
        const parsedFiles = await parseFiles(filePaths, this.config.projectRoot, (fp) =>
            readFileContent(fp)
        )
        const graph = new GraphBuilder().build(parsedFiles)

        this.analyzer = new IncrementalAnalyzer(graph, this.lock, this.contract, this.config.projectRoot)

        // Add all parsed files to the analyzer
        for (const file of parsedFiles) {
            this.analyzer.addParsedFile(file)
        }

        // Subscribe to file changes with debouncing
        this.watcher.on(async (event: WatcherEvent) => {
            if (event.type === 'file:changed') {
                this.enqueueChange(event.data)
            }
            // Forward events to external handlers
            for (const handler of this.handlers) {
                handler(event)
            }
        })

        this.watcher.start()
        await this.writeSyncState({ status: 'clean', lastUpdated: Date.now() })
        logger.info('Mikk watcher started', { watching: this.config.include })
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
        this.pendingEvents.push(event)

        // Reset the debounce timer
        if (this.debounceTimer) clearTimeout(this.debounceTimer)
        this.debounceTimer = setTimeout(() => {
            this.flushPendingEvents()
        }, this.config.debounceMs || 100)
    }

    private async flushPendingEvents(): Promise<void> {
        if (this.processing || this.pendingEvents.length === 0) return
        this.processing = true

        const events = [...this.pendingEvents]
        this.pendingEvents = []

        // Deduplicate by path (keep latest event per file)
        const byPath = new Map<string, FileChangeEvent>()
        for (const event of events) {
            byPath.set(event.path, event)
        }
        const dedupedEvents = [...byPath.values()]

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
        } catch (err: any) {
            await this.writeSyncState({
                status: 'drifted',
                lastUpdated: Date.now(),
                error: err.message,
            })
        } finally {
            this.processing = false

            // If more events arrived during processing, flush again
            if (this.pendingEvents.length > 0) {
                this.flushPendingEvents()
            }
        }
    }

    private async processBatch(events: FileChangeEvent[]): Promise<void> {
        if (!this.analyzer || !this.lock) return

        try {
            const result = await this.analyzer.analyzeBatch(events)
            this.lock = result.lock

            // Write updated lock
            const lockPath = path.join(this.config.projectRoot, 'mikk.lock.json')
            await fs.writeFile(lockPath, JSON.stringify(this.lock, null, 2), 'utf-8')

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
        } catch (err: any) {
            logger.error('Failed to analyze file changes', {
                files: events.map(e => e.path),
                error: err.message,
            })
            for (const handler of this.handlers) {
                handler({
                    type: 'sync:drifted',
                    data: {
                        reason: err.message,
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
