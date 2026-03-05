import * as fs from 'node:fs/promises'
import type { MikkContract, MikkDecision } from './schema.js'
import { MikkContractSchema } from './schema.js'

/**
 * AdrManager — CRUD operations on Architectural Decision Records
 * stored in the `declared.decisions` array of mikk.json.
 *
 * Each ADR has: id, title, reason, date.
 * Exposed as an MCP tool so AI assistants can read and update ADRs.
 */
export class AdrManager {
    constructor(private contractPath: string) { }

    // ─── Read ──────────────────────────────────────────────────────

    async list(): Promise<MikkDecision[]> {
        const contract = await this.readContract()
        return contract.declared.decisions ?? []
    }

    async get(id: string): Promise<MikkDecision | null> {
        const decisions = await this.list()
        return decisions.find(d => d.id === id) ?? null
    }

    // ─── Write ─────────────────────────────────────────────────────

    async add(decision: MikkDecision): Promise<void> {
        const contract = await this.readContract()
        if (!contract.declared.decisions) {
            contract.declared.decisions = []
        }
        // Check for duplicate ID
        if (contract.declared.decisions.some(d => d.id === decision.id)) {
            throw new Error(`ADR with id "${decision.id}" already exists. Use update() instead.`)
        }
        contract.declared.decisions.push(decision)
        await this.writeContract(contract)
    }

    async update(id: string, fields: Partial<Omit<MikkDecision, 'id'>>): Promise<void> {
        const contract = await this.readContract()
        const decisions = contract.declared.decisions ?? []
        const idx = decisions.findIndex(d => d.id === id)
        if (idx === -1) {
            throw new Error(`ADR "${id}" not found. Use add() to create a new decision.`)
        }
        decisions[idx] = { ...decisions[idx], ...fields, id } // preserve id
        contract.declared.decisions = decisions
        await this.writeContract(contract)
    }

    async remove(id: string): Promise<boolean> {
        const contract = await this.readContract()
        const decisions = contract.declared.decisions ?? []
        const idx = decisions.findIndex(d => d.id === id)
        if (idx === -1) return false
        decisions.splice(idx, 1)
        contract.declared.decisions = decisions
        await this.writeContract(contract)
        return true
    }

    // ─── Helpers ───────────────────────────────────────────────────

    private async readContract(): Promise<MikkContract> {
        const raw = await fs.readFile(this.contractPath, 'utf-8')
        return MikkContractSchema.parse(JSON.parse(raw))
    }

    private async writeContract(contract: MikkContract): Promise<void> {
        await fs.writeFile(this.contractPath, JSON.stringify(contract, null, 2), 'utf-8')
    }
}
