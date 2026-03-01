import * as path from 'node:path'
import { watch } from 'chokidar'
import { hashFile } from '@getmikk/core'
import type { WatcherConfig, WatcherEvent, FileChangeEvent } from './types.js'

/**
 * FileWatcher — wraps Chokidar to watch filesystem for changes.
 * Computes hash of changed files and emits typed events.
 */
export class FileWatcher {
    private watcher: ReturnType<typeof watch> | null = null
    private handlers: ((event: WatcherEvent) => void)[] = []
    private hashStore = new Map<string, string>()

    constructor(private config: WatcherConfig) { }

    /** Start watching — non-blocking */
    start(): void {
        this.watcher = watch(this.config.include, {
            ignored: this.config.exclude,
            cwd: this.config.projectRoot,
            ignoreInitial: true,
            persistent: true,
            awaitWriteFinish: {
                stabilityThreshold: 50,
                pollInterval: 10,
            },
        })

        this.watcher.on('change', (relativePath: string) => {
            this.handleChange(relativePath, 'changed')
        })
        this.watcher.on('add', (relativePath: string) => {
            this.handleChange(relativePath, 'added')
        })
        this.watcher.on('unlink', (relativePath: string) => {
            this.handleChange(relativePath, 'deleted')
        })
    }

    /** Stop watching */
    async stop(): Promise<void> {
        await this.watcher?.close()
        this.watcher = null
    }

    /** Register an event handler */
    on(handler: (event: WatcherEvent) => void): void {
        this.handlers.push(handler)
    }

    /** Set initial hash for a file */
    setHash(filePath: string, hash: string): void {
        this.hashStore.set(filePath, hash)
    }

    private async handleChange(relativePath: string, type: FileChangeEvent['type']): Promise<void> {
        const fullPath = path.join(this.config.projectRoot, relativePath)
        const normalizedPath = relativePath.replace(/\\/g, '/')
        const oldHash = this.hashStore.get(normalizedPath) || null

        let newHash: string | null = null
        if (type !== 'deleted') {
            try {
                newHash = await hashFile(fullPath)
            } catch {
                return // File might have been deleted before we could read it
            }
        }

        if (oldHash === newHash) return // Content unchanged

        if (newHash) this.hashStore.set(normalizedPath, newHash)
        if (type === 'deleted') this.hashStore.delete(normalizedPath)

        const event: FileChangeEvent = {
            type,
            path: normalizedPath,
            oldHash,
            newHash,
            timestamp: Date.now(),
            affectedModuleIds: [], // filled by IncrementalAnalyzer
        }

        this.emit({ type: 'file:changed', data: event })
    }

    private emit(event: WatcherEvent): void {
        for (const handler of this.handlers) {
            handler(event)
        }
    }
}
