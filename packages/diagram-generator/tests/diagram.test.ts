import { describe, it, expect } from 'bun:test'
import { MainDiagramGenerator } from '../src/generators/main-diagram.js'
import type { MikkContract, MikkLock } from '@getmikk/core'

describe('MainDiagramGenerator', () => {
    it('generates a file-level view for 0 modules', () => {
        const contract: MikkContract = {
            project: { name: 'test', language: 'typescript', framework: null },
            declared: {
                modules: [],
                constraints: [],
                decisions: []
            },
            overwrite: { mode: 'never', requireConfirmation: false }
        }
        const lock: MikkLock = {
            version: '1',
            lastUpdated: new Date().toISOString(),
            files: {},
            functions: {},
            classes: {},
            modules: {}
        }
        
        const gen = new MainDiagramGenerator(contract, lock)
        const diagram = gen.generate()
        expect(diagram).toContain('graph TD')
    })
    
    it('generates a multi-module view for 2+ modules', () => {
        const contract: MikkContract = {
            project: { name: 'test', language: 'typescript', framework: null },
            declared: {
                modules: [
                    { id: 'auth', name: 'Auth', functions: [] },
                    { id: 'db', name: 'Database', functions: [] }
                ],
                constraints: [],
                decisions: []
            },
            overwrite: { mode: 'never', requireConfirmation: false }
        }
        const lock: MikkLock = {
            version: '1',
            lastUpdated: new Date().toISOString(),
            files: {},
            functions: {},
            classes: {},
            modules: {}
        }
        
        const gen = new MainDiagramGenerator(contract, lock)
        const diagram = gen.generate()
        expect(diagram).toContain('auth["📦 Auth')
        expect(diagram).toContain('db["📦 Database')
    })

    it('always emits a non-empty diagram string', () => {
        const contract: MikkContract = {
            project: { name: 'x', language: 'typescript', framework: null },
            declared: { modules: [], constraints: [], decisions: [] },
            overwrite: { mode: 'never', requireConfirmation: false },
        }
        const lock: MikkLock = {
            version: '1',
            lastUpdated: new Date().toISOString(),
            files: {},
            functions: {},
            classes: {},
            modules: {},
        }
        const diagram = new MainDiagramGenerator(contract, lock).generate()
        expect(diagram.trim().length).toBeGreaterThan(0)
    })
})
