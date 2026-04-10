/* eslint-disable @typescript-eslint/no-explicit-any */
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import { writeFileAtomic } from './atomic-write.js'

export type ArtifactTransactionStatus = 'begin' | 'staged' | 'commit-ready'

export interface ArtifactWriteInput {
    targetPath: string
    content: string
    encoding?: BufferEncoding
}

interface ArtifactWriteJournal {
    targetPath: string
    stagedPath: string
    encoding: BufferEncoding
}

interface ArtifactTransactionJournal {
    id: string
    name: string
    createdAt: string
    status: ArtifactTransactionStatus
    writes: ArtifactWriteJournal[]
    committedAt?: string
}

export interface ArtifactTransactionOptions {
    simulateCrashAt?: 'after-begin' | 'after-stage' | 'after-commit-marker'
}

export interface RecoverySummary {
    recovered: number
    rolledBack: number
    removedJournals: number
}

function getTransactionDirectory(projectRoot: string): string {
    return path.join(projectRoot, '.mikk', 'transactions')
}

async function writeJournal(journalPath: string, journal: ArtifactTransactionJournal): Promise<void> {
    await writeFileAtomic(journalPath, JSON.stringify(journal, null, 2), { encoding: 'utf-8' })
}

function makeStagedPath(targetPath: string, id: string): string {
    const dir = path.dirname(targetPath)
    const base = path.basename(targetPath)
    return path.join(dir, `.${base}.txn-${id}.staged`)
}

export async function runArtifactWriteTransaction(
    projectRoot: string,
    name: string,
    writes: ArtifactWriteInput[],
    options: ArtifactTransactionOptions = {},
): Promise<void> {
    if (writes.length === 0) return

    const txDir = getTransactionDirectory(projectRoot)
    await fs.mkdir(txDir, { recursive: true })

    const id = `${Date.now()}-${randomUUID().slice(0, 8)}`
    const journalPath = path.join(txDir, `${id}.journal.json`)
    const journal: ArtifactTransactionJournal = {
        id,
        name,
        createdAt: new Date().toISOString(),
        status: 'begin',
        writes: writes.map((w) => ({
            targetPath: w.targetPath,
            stagedPath: makeStagedPath(w.targetPath, id),
            encoding: w.encoding ?? 'utf-8',
        })),
    }

    await writeJournal(journalPath, journal)
    if (options.simulateCrashAt === 'after-begin') {
        throw new Error('Simulated crash after begin')
    }

    for (let i = 0; i < writes.length; i++) {
        const input = writes[i]
        const record = journal.writes[i]
        await fs.mkdir(path.dirname(record.stagedPath), { recursive: true })
        await writeFileAtomic(record.stagedPath, input.content, { encoding: record.encoding })
    }

    journal.status = 'staged'
    await writeJournal(journalPath, journal)
    if (options.simulateCrashAt === 'after-stage') {
        throw new Error('Simulated crash after stage')
    }

    journal.status = 'commit-ready'
    journal.committedAt = new Date().toISOString()
    await writeJournal(journalPath, journal)
    if (options.simulateCrashAt === 'after-commit-marker') {
        throw new Error('Simulated crash after commit marker')
    }

    for (const write of journal.writes) {
        await fs.rename(write.stagedPath, write.targetPath)
    }

    await fs.unlink(journalPath)
}

export async function recoverArtifactWriteTransactions(projectRoot: string): Promise<RecoverySummary> {
    const txDir = getTransactionDirectory(projectRoot)
    const summary: RecoverySummary = {
        recovered: 0,
        rolledBack: 0,
        removedJournals: 0,
    }

    let entries: string[] = []
    try {
        entries = await fs.readdir(txDir)
    } catch {
        return summary
    }

    const journals = entries.filter((name) => name.endsWith('.journal.json'))

    for (const file of journals) {
        const journalPath = path.join(txDir, file)
        let journal: ArtifactTransactionJournal | null = null
        try {
            const raw = await fs.readFile(journalPath, 'utf-8')
            journal = JSON.parse(raw) as ArtifactTransactionJournal
        } catch {
            try {
                await fs.unlink(journalPath)
                summary.removedJournals += 1
            } catch {
                // Ignore broken journal cleanup failures.
            }
            continue
        }

        try {
            if (journal.status === 'commit-ready') {
                for (const write of journal.writes) {
                    try {
                        await fs.rename(write.stagedPath, write.targetPath)
                    } catch (err: any) {
                        if (err?.code !== 'ENOENT') {
                            throw err
                        }
                    }
                }
                summary.recovered += 1
            } else {
                for (const write of journal.writes) {
                    try {
                        await fs.unlink(write.stagedPath)
                    } catch {
                        // Ignore missing staged files.
                    }
                }
                summary.rolledBack += 1
            }
        } finally {
            try {
                await fs.unlink(journalPath)
                summary.removedJournals += 1
            } catch {
                // Ignore missing journal file.
            }
        }
    }

    return summary
}
