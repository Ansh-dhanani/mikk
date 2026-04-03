import { describe, it, expect } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import {
    runArtifactWriteTransaction,
    recoverArtifactWriteTransactions,
} from '../src/utils/artifact-transaction'

describe('artifact write transactions', () => {
    it('commits grouped writes atomically', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mikk-tx-'))
        const aPath = path.join(root, 'mikk.lock.json')
        const bPath = path.join(root, 'claude.md')

        await runArtifactWriteTransaction(root, 'commit-test', [
            { targetPath: aPath, content: '{"ok":true}' },
            { targetPath: bPath, content: '# context' },
        ])

        expect(await fs.readFile(aPath, 'utf-8')).toContain('ok')
        expect(await fs.readFile(bPath, 'utf-8')).toContain('context')

        await fs.rm(root, { recursive: true, force: true })
    })

    it('rolls back staged writes after pre-commit crash', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mikk-tx-'))
        const lockPath = path.join(root, 'mikk.lock.json')

        await expect(
            runArtifactWriteTransaction(
                root,
                'rollback-test',
                [{ targetPath: lockPath, content: '{"v":1}' }],
                { simulateCrashAt: 'after-stage' },
            ),
        ).rejects.toThrow('Simulated crash after stage')

        const summary = await recoverArtifactWriteTransactions(root)
        expect(summary.rolledBack).toBeGreaterThanOrEqual(1)

        let exists = true
        try {
            await fs.access(lockPath)
        } catch {
            exists = false
        }
        expect(exists).toBe(false)

        await fs.rm(root, { recursive: true, force: true })
    })

    it('recovers commit-ready journals after post-commit-marker crash', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mikk-tx-'))
        const lockPath = path.join(root, 'mikk.lock.json')

        await expect(
            runArtifactWriteTransaction(
                root,
                'recovery-test',
                [{ targetPath: lockPath, content: '{"v":2}' }],
                { simulateCrashAt: 'after-commit-marker' },
            ),
        ).rejects.toThrow('Simulated crash after commit marker')

        const summary = await recoverArtifactWriteTransactions(root)
        expect(summary.recovered).toBeGreaterThanOrEqual(1)
        expect(await fs.readFile(lockPath, 'utf-8')).toContain('"v":2')

        await fs.rm(root, { recursive: true, force: true })
    })
})
