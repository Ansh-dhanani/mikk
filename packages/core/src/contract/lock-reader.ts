import * as fs from 'node:fs/promises'
import { MikkLockSchema, type MikkLock } from './schema.js'
import { LockNotFoundError } from '../utils/errors.js'

/**
 * LockReader — reads and validates mikk.lock.json from disk.
 */
export class LockReader {
    /** Read and validate mikk.lock.json */
    async read(lockPath: string): Promise<MikkLock> {
        let content: string
        try {
            content = await fs.readFile(lockPath, 'utf-8')
        } catch {
            throw new LockNotFoundError()
        }

        const json = JSON.parse(content)
        const result = MikkLockSchema.safeParse(json)

        if (!result.success) {
            const errors = result.error.issues.map(i => `  ${i.path.join('.')}: ${i.message}`).join('\n')
            throw new Error(`Invalid mikk.lock.json:\n${errors}`)
        }

        return result.data
    }

    /** Write lock file to disk */
    async write(lock: MikkLock, lockPath: string): Promise<void> {
        const json = JSON.stringify(lock, null, 2)
        await fs.writeFile(lockPath, json, 'utf-8')
    }
}
