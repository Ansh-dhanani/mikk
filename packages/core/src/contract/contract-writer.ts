import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { MikkContract } from './schema.js'
import { hashContent } from '../hash/file-hasher.js'

const VERSION = '@getmikk/cli@1.2.1'

export interface UpdateResult {
    updated: boolean
    reason?: string
    requiresConfirmation?: boolean
    proposedChanges?: object
}

/**
 * ContractWriter — writes mikk.json to disk.
 * Implements the permission model (never / ask / explicit).
 */
export class ContractWriter {
    /** Write a new mikk.json — safe for first write */
    async writeNew(contract: MikkContract, outputPath: string): Promise<void> {
        await fs.mkdir(path.dirname(outputPath), { recursive: true })
        const json = JSON.stringify(contract, null, 2)
        await fs.writeFile(outputPath, json, 'utf-8')
    }

    /** Update an existing mikk.json respecting overwrite mode */
    async update(
        existing: MikkContract,
        updates: Partial<MikkContract>,
        outputPath: string
    ): Promise<UpdateResult> {
        const mode = existing.overwrite?.mode ?? 'never'

        if (mode === 'never') {
            return { updated: false, reason: 'overwrite mode is never' }
        }

        if (mode === 'ask') {
            return {
                updated: false,
                requiresConfirmation: true,
                proposedChanges: this.diffContracts(existing, updates),
            }
        }

        if (mode === 'explicit') {
            const updated = this.mergeContracts(existing, updates)
            updated.overwrite = {
                ...updated.overwrite,
                lastOverwrittenBy: VERSION,
                lastOverwrittenAt: new Date().toISOString(),
            }
            await this.writeNew(updated, outputPath)
            await this.writeAuditLog(existing, updated, outputPath)
            return { updated: true }
        }

        return { updated: false, reason: 'unknown mode' }
    }

    /** Merge two contracts — updates overwrite existing fields */
    private mergeContracts(existing: MikkContract, updates: Partial<MikkContract>): MikkContract {
        return {
            ...existing,
            ...updates,
            declared: {
                ...existing.declared,
                ...(updates.declared || {}),
                modules: updates.declared?.modules || existing.declared.modules,
                constraints: updates.declared?.constraints || existing.declared.constraints,
                decisions: updates.declared?.decisions || existing.declared.decisions,
            },
            project: {
                ...existing.project,
                ...(updates.project || {}),
            },
        }
    }

    /** Compute diff between two contracts */
    private diffContracts(existing: MikkContract, updates: Partial<MikkContract>): object {
        return {
            before: existing.declared,
            after: updates.declared || existing.declared,
        }
    }

    /** Write audit log to .mikk/overwrite-history.json */
    private async writeAuditLog(
        before: MikkContract,
        after: MikkContract,
        contractPath: string
    ): Promise<void> {
        const historyPath = path.join(path.dirname(contractPath), '.mikk', 'overwrite-history.json')
        let history: object[] = []

        try {
            const existing = await fs.readFile(historyPath, 'utf-8')
            history = JSON.parse(existing)
        } catch {
            // No history file yet
        }

        history.push({
            timestamp: new Date().toISOString(),
            before: before.declared,
            after: after.declared,
        })

        await fs.mkdir(path.dirname(historyPath), { recursive: true })
        await fs.writeFile(historyPath, JSON.stringify(history, null, 2), 'utf-8')
    }
}
