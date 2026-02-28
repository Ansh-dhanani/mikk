import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import {
    GraphBuilder, LockCompiler, LockReader, ContractReader,
    parseFiles, readFileContent, discoverFiles, logger,
    type DependencyGraph, type MikkLock, type MikkContract
} from '@mikk/core'
import { FileWatcher } from './file-watcher.js'
import { IncrementalAnalyzer } from './incremental-analyzer.js'
import type { WatcherConfig, WatcherEvent, FileChangeEvent } from './types.js'

/**
 * WatcherDaemon — long-running background process.
 * Starts the FileWatcher, handles the IncrementalAnalyzer,
 * writes updates to the lock file, and manages sync state.
 */
export class WatcherDaemon {
    private watcher: FileWatcher
    private analyzer: IncrementalAnalyzer | null = null
    private lock: MikkLock | null = null
    private contract: MikkContract | null = null
    private handlers: ((event: WatcherEvent) => void)[] = []

    constructor(private config: WatcherConfig) {
        this.watcher = new FileWatcher(config)
    }

    async start(): Promise<void> {
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

        // Subscribe to file changes
        this.watcher.on(async (event: WatcherEvent) => {
            if (event.type === 'file:changed') {
                await this.handleFileChange(event.data)
            }
            // Forward events to external handlers
            for (const handler of this.handlers) {
                handler(event)
            }
        })

        this.watcher.start()
        logger.info('Mikk watcher started', { watching: this.config.include })
    }

    async stop(): Promise<void> {
        await this.watcher.stop()
        logger.info('Mikk watcher stopped')
    }

    on(handler: (event: WatcherEvent) => void): void {
        this.handlers.push(handler)
    }

    private async handleFileChange(event: FileChangeEvent): Promise<void> {
        if (!this.analyzer || !this.lock) return

        try {
            const result = await this.analyzer.analyze(event)
            this.lock = result.lock

            // Write updated lock
            const lockPath = path.join(this.config.projectRoot, 'mikk.lock.json')
            await fs.writeFile(lockPath, JSON.stringify(this.lock, null, 2), 'utf-8')

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
                changedFile: event.path,
                impactedNodes: result.impactResult.impacted.length,
            })
        } catch (err: any) {
            logger.error('Failed to analyze file change', { file: event.path, error: err.message })
            for (const handler of this.handlers) {
                handler({
                    type: 'sync:drifted',
                    data: { reason: err.message, affectedModules: event.affectedModuleIds },
                })
            }
        }
    }
}
