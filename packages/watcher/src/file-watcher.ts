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
        const excludesRegexes = this.config.exclude.map(
            pattern => new RegExp(pattern.replace(/\*/g, '.*').replace(/\//g, '[\\\\/]'))
        )
        const includeExts = ['.ts', '.tsx']

        this.watcher = watch(this.config.projectRoot, {
            ignored: (testPath: string, stats?: import('fs').Stats) => {
                // Ignore matching exclude patterns
                if (excludesRegexes.some(r => r.test(testPath))) return true
                // Keep directories so we can recurse
                if (!stats || stats.isDirectory()) return false
                // Ignore non-matching file extensions
                return !includeExts.some(ext => testPath.endsWith(ext))
            },
            cwd: this.config.projectRoot,
            ignoreInitial: true,
            persistent: true,
            awaitWriteFinish: {
                stabilityThreshold: 300,
                pollInterval: 50,
            },
        })

        this.watcher.on('all', (event, relativePath) => {
            if (event === 'change') {
                this.handleChange(relativePath, 'changed')
            } else if (event === 'add') {
                this.handleChange(relativePath, 'added')
            } else if (event === 'unlink') {
                this.handleChange(relativePath, 'deleted')
            }
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

    /** Seed the initial hash for a file (called at startup for all known files) */
    setHash(filePath: string, hash: string): void {
        this.hashStore.set(filePath, hash)
    }

    /** Bulk-seed hashes for all known files so first-change dedup works correctly */
    seedHashes(entries: ReadonlyMap<string, string>): void {
        for (const [p, h] of entries) {
            this.hashStore.set(p.replace(/\\/g, '/'), h)
        }
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

        // Skip only when both hashes are known and identical (true no-op change)
        if (oldHash !== null && newHash !== null && oldHash === newHash) return

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
