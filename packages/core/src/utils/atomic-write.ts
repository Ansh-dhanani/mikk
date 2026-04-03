import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'

export interface AtomicWriteOptions {
    encoding?: BufferEncoding
    mode?: number
    lockTimeoutMs?: number
    staleLockMs?: number
    retryDelayMs?: number
}

const DEFAULT_LOCK_TIMEOUT_MS = 10_000
const DEFAULT_STALE_LOCK_MS = 60_000
const DEFAULT_RETRY_DELAY_MS = 50

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function acquireFileLock(lockPath: string, options: AtomicWriteOptions): Promise<() => Promise<void>> {
    const lockTimeoutMs = options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS
    const staleLockMs = options.staleLockMs ?? DEFAULT_STALE_LOCK_MS
    const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
    const startedAt = Date.now()

    while (true) {
        try {
            const fd = await fs.open(lockPath, 'wx')
            try {
                const payload = JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() })
                await fd.writeFile(payload, { encoding: 'utf-8' })
                await fd.sync()
            } finally {
                await fd.close()
            }

            return async () => {
                try {
                    await fs.unlink(lockPath)
                } catch {
                    // Ignore missing locks on release.
                }
            }
        } catch (err: any) {
            if (err?.code !== 'EEXIST') {
                throw err
            }

            try {
                const stat = await fs.stat(lockPath)
                const ageMs = Date.now() - stat.mtimeMs
                if (ageMs > staleLockMs) {
                    await fs.unlink(lockPath)
                    continue
                }
            } catch {
                // Lock disappeared between stat/unlink checks — retry acquisition.
            }

            if (Date.now() - startedAt > lockTimeoutMs) {
                throw new Error(`Timed out acquiring write lock for ${path.basename(lockPath)}`)
            }

            await sleep(retryDelayMs)
        }
    }
}

/**
 * Write a file atomically with a lock-file critical section.
 *
 * Guarantees:
 * - Atomicity: write to temp file then rename
 * - Isolation: one writer at a time via lock file
 * - Durability: fsync temp file and parent directory (best effort)
 */
export async function writeFileAtomic(
    targetPath: string,
    content: string,
    options: AtomicWriteOptions = {}
): Promise<void> {
    const directory = path.dirname(targetPath)
    const baseName = path.basename(targetPath)
    const lockPath = `${targetPath}.lock`
    const tempPath = path.join(
        directory,
        `.${baseName}.${process.pid}.${Date.now()}.${randomUUID().slice(0, 8)}.tmp`
    )

    await fs.mkdir(directory, { recursive: true })
    const releaseLock = await acquireFileLock(lockPath, options)

    try {
        const fd = await fs.open(tempPath, 'w', options.mode)
        try {
            await fd.writeFile(content, { encoding: options.encoding ?? 'utf-8' })
            await fd.sync()
        } finally {
            await fd.close()
        }

        await fs.rename(tempPath, targetPath)

        // Best-effort directory fsync for rename durability.
        try {
            const dirFd = await fs.open(directory, 'r')
            try {
                await dirFd.sync()
            } finally {
                await dirFd.close()
            }
        } catch {
            // Directory fsync can fail on some platforms/filesystems.
        }
    } finally {
        try {
            await fs.unlink(tempPath)
        } catch {
            // Temp file may already be moved/removed.
        }
        await releaseLock()
    }
}

export async function writeJsonAtomic(
    targetPath: string,
    value: unknown,
    options: AtomicWriteOptions = {}
): Promise<void> {
    const payload = JSON.stringify(value)
    await writeFileAtomic(targetPath, payload, options)
}