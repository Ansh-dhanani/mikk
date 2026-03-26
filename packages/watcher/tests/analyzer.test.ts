import { describe, it, expect } from 'bun:test'
import { IncrementalAnalyzer } from '../src/incremental-analyzer.js'
import type { MikkLock, DependencyGraph, MikkContract } from '@getmikk/core'
import type { FileChangeEvent } from '../src/types.js'

describe('IncrementalAnalyzer', () => {
    const mockGraph = (): DependencyGraph => ({
        nodes: new Map(),
        edges: [],
        outEdges: new Map(),
        inEdges: new Map()
    })

    const mockLock: MikkLock = {
        version: '2.0.0',
        generatedAt: new Date().toISOString(),
        generatorVersion: '1.0.0',
        projectRoot: '/project',
        syncState: {
            status: 'clean',
            lastSyncAt: new Date().toISOString(),
            lockHash: 'abc',
            contractHash: 'xyz'
        },
        files: {
            'src/index.ts': {
                path: 'src/index.ts',
                hash: 'abc',
                moduleId: 'root',
                lastModified: new Date().toISOString(),
                imports: []
            }
        },
        functions: {},
        classes: {},
        modules: {},
        graph: {
            nodes: 1,
            edges: 0,
            rootHash: 'abc'
        }
    }

    const contract: MikkContract = {
        version: '2.0.0',
        project: { 
            name: 'test', 
            description: 'test project',
            language: 'typescript', 
            framework: 'none',
            entryPoints: [] 
        },
        declared: {
            modules: [],
            constraints: [],
            decisions: []
        },
        overwrite: { 
            mode: 'never', 
            requireConfirmation: false 
        },
        policies: {
            maxRiskScore: 70,
            maxImpactNodes: 10,
            protectedModules: [],
            enforceStrictBoundaries: true,
            requireReasoningForCritical: true
        }
    }

    it('detects changes correctly without throwing', async () => {
        const analyzer = new IncrementalAnalyzer(
            mockGraph(),
            mockLock,
            contract,
            '/project'
        )
        
        const event: FileChangeEvent = { 
            path: 'src/index.ts', 
            type: 'changed',
            oldHash: 'old',
            newHash: 'abc',
            timestamp: Date.now(),
            affectedModuleIds: []
        }
        const result = await analyzer.analyze(event)
        expect(result.graph).toBeDefined()
        expect(result.lock).toBeDefined()
        expect(result.impactResult).toBeDefined()
    })

    describe('Edge Cases and Batch Processing', () => {
        it('handles file deletions by removing nodes from graph and lock', async () => {
            const analyzer = new IncrementalAnalyzer(mockGraph(), mockLock, contract, '/project')
            // First add it
            analyzer.addParsedFile({ 
                path: 'src/to-delete.ts', 
                language: 'typescript', 
                hash: 'foo', 
                parsedAt: Date.now(), 
                functions: [], 
                classes: [], 
                imports: [], 
                exports: [], 
                routes: [],
                variables: [],
                generics: [],
                calls: []
            })
            expect(analyzer.fileCount).toBe(1)
            
            // Now send a deleted event
            const event: FileChangeEvent = { 
                path: 'src/to-delete.ts', 
                type: 'deleted',
                oldHash: 'foo',
                newHash: '',
                timestamp: Date.now(),
                affectedModuleIds: []
            }
            await analyzer.analyze(event)
            expect(analyzer.fileCount).toBe(0)
        })

        it('survives analyze events on completely non-existent OS files gracefully', async () => {
            const analyzer = new IncrementalAnalyzer(mockGraph(), mockLock, contract, '/project')
            const event: FileChangeEvent = { 
                path: 'does/not/exist.ts', 
                type: 'changed',
                oldHash: '',
                newHash: 'new',
                timestamp: Date.now(),
                affectedModuleIds: []
            }
            const result = await analyzer.analyzeBatch([event])
            expect(result.mode).toBe('incremental')
            expect(result.impactResult).toBeDefined()
            expect(analyzer.fileCount).toBe(0) 
        })

        it('triggers a full re-analysis if file batch exceeds FULL_ANALYSIS_THRESHOLD (15)', async () => {
            const analyzer = new IncrementalAnalyzer(mockGraph(), mockLock, contract, '/project')
            const events: FileChangeEvent[] = Array.from({ length: 16 }).map((_, i) => ({
                path: `src/file_${i}.ts`,
                type: 'changed',
                oldHash: '',
                newHash: `hash_${i}`,
                timestamp: Date.now(),
                affectedModuleIds: []
            }))
            
            const result = await analyzer.analyzeBatch(events)
            expect(result.mode).toBe('full')
            expect(result.impactResult.confidence).toBe(1.0)
        })
    })
})
