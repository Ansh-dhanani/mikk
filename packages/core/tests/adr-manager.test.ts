import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test'
import { AdrManager } from '../src/contract/adr-manager'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

describe('AdrManager', () => {
    const TEMP_DIR = path.join(process.cwd(), '.test-temp')
    const CONTRACT_PATH = path.join(TEMP_DIR, 'mikk.json')

    beforeAll(async () => {
        await fs.mkdir(TEMP_DIR, { recursive: true })
    })

    afterAll(async () => {
        await fs.rm(TEMP_DIR, { recursive: true, force: true })
    })

    beforeEach(async () => {
        // Create a fresh mikk.json for each test
        const initialContract = {
            version: '1.0.0',
            project: { name: 'test', description: 'test', language: 'ts', entryPoints: [] },
            declared: {
                modules: [],
                decisions: [
                    { id: 'ADR-1', title: 'First ADR', reason: 'Because', date: '2024-01-01' }
                ]
            },
            overwrite: { mode: 'never' as const }
        }
        await fs.writeFile(CONTRACT_PATH, JSON.stringify(initialContract))
    })

    it('lists decisions', async () => {
        const manager = new AdrManager(CONTRACT_PATH)
        const decisions = await manager.list()
        expect(decisions).toHaveLength(1)
        expect(decisions[0].id).toBe('ADR-1')
    })

    it('gets a decision by id', async () => {
        const manager = new AdrManager(CONTRACT_PATH)
        const decision = await manager.get('ADR-1')
        expect(decision?.title).toBe('First ADR')

        const missing = await manager.get('NOT-FOUND')
        expect(missing).toBeNull()
    })

    it('adds a new decision', async () => {
        const manager = new AdrManager(CONTRACT_PATH)
        await manager.add({
            id: 'ADR-2',
            title: 'Second ADR',
            reason: 'Why not',
            date: '2024-01-02'
        })

        const decisions = await manager.list()
        expect(decisions).toHaveLength(2)
        expect(decisions[1].id).toBe('ADR-2')
    })

    it('fails to add if id already exists', async () => {
        const manager = new AdrManager(CONTRACT_PATH)
        await expect(manager.add({
            id: 'ADR-1',
            title: 'Duplicate',
            reason: 'Will fail',
            date: '2024-01-03'
        })).rejects.toThrow(/already exists/)
    })

    it('updates an existing decision', async () => {
        const manager = new AdrManager(CONTRACT_PATH)
        await manager.update('ADR-1', { title: 'Updated Title' })

        const decision = await manager.get('ADR-1')
        expect(decision?.title).toBe('Updated Title')
        expect(decision?.reason).toBe('Because') // Preserved
        expect(decision?.id).toBe('ADR-1')
    })

    it('fails to update missing decision', async () => {
        const manager = new AdrManager(CONTRACT_PATH)
        await expect(manager.update('ADR-99', { title: 'Nope' })).rejects.toThrow(/not found/)
    })

    it('removes a decision', async () => {
        const manager = new AdrManager(CONTRACT_PATH)
        const success = await manager.remove('ADR-1')
        expect(success).toBe(true)

        const decisions = await manager.list()
        expect(decisions).toHaveLength(0)
    })
})
