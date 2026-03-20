import { describe, it, expect } from 'bun:test'
import { IncrementalAnalyzer } from '../src/incremental-analyzer.js'
import type { MikkLock, ParsedFile } from '@getmikk/core'

describe('IncrementalAnalyzer', () => {
    it('detects changes correctly without throwing', async () => {
        const mockLock: MikkLock = {
            version: '1',
            lastUpdated: new Date().toISOString(),
            files: {
                'src/index.ts': {
                    hash: 'abc',
                    lastModified: new Date().toISOString(),
                    path: 'src/index.ts',
                    moduleId: 'root',
                    imports: [],
                    exports: []
                }
            },
            functions: {},
            classes: {},
            modules: {}
        }

        const analyzer = new IncrementalAnalyzer(
            { nodes: new Map(), edges: [] },
            mockLock,
            {
                project: { name: 'test', language: 'typescript', framework: null },
                declared: { modules: [], constraints: [], decisions: [] },
                overwrite: { mode: 'never', requireConfirmation: false }
            },
            '/project'
        )
        
        // This simulates a file change event
        const result = await analyzer.analyze({ path: 'src/index.ts', type: 'modified' })
        expect(result.graph).toBeDefined()
        expect(result.lock).toBeDefined()
        expect(result.impactResult).toBeDefined()
    })

    describe('Edge Cases and Batch Processing', () => {
        const mockLock: MikkLock = {
            version: '1',
            lastUpdated: new Date().toISOString(),
            files: {}, functions: {}, classes: {}, modules: {}
        }
        
        const contract = {
            project: { name: 'test', language: 'typescript', framework: null },
            declared: { modules: [], constraints: [], decisions: [] },
            overwrite: { mode: 'never', requireConfirmation: false }
        }

        it('handles file deletions by removing nodes from graph and lock', async () => {
            const analyzer = new IncrementalAnalyzer({ nodes: new Map(), edges: [] }, mockLock, contract, '/project')
            // First add it
            analyzer.addParsedFile({ path: 'src/to-delete.ts', language: 'ts', hash: 'foo', parsedAt: Date.now(), functions: [], classes: [], imports: [], exports: [], routes: [] })
            expect(analyzer.fileCount).toBe(1)
            
            // Now send a deleted event
            await analyzer.analyze({ path: 'src/to-delete.ts', type: 'deleted' })
            expect(analyzer.fileCount).toBe(0)
        })

        it('survives analyze events on completely non-existent OS files gracefully', async () => {
            const analyzer = new IncrementalAnalyzer({ nodes: new Map(), edges: [] }, mockLock, contract, '/project')
            // Will fail to fs.readFile inside parseWithRaceCheck
            const result = await analyzer.analyze({ path: 'does/not/exist.ts', type: 'modified' })
            expect(result.mode).toBeUndefined() // Returns incremental by default
            expect(result.impactResult).toBeDefined()
            // Should not have crashed the analyzer
            expect(analyzer.fileCount).toBe(0) 
        })

        it('triggers a full re-analysis if file batch exceeds FULL_ANALYSIS_THRESHOLD (15)', async () => {
            const analyzer = new IncrementalAnalyzer({ nodes: new Map(), edges: [] }, mockLock, contract, '/project')
            const events = Array.from({ length: 16 }).map((_, i) => ({
                path: `src/file_${i}.ts`,
                type: 'modified' as const
            }))
            
            const result = await analyzer.analyzeBatch(events)
            // It should have hit runFullAnalysis, which returns mode: 'full'
            expect(result.mode).toBe('full')
            // It will also have gracefully continued despite the 16 files failing to load off disk
            expect(result.impactResult.confidence).toBe('low')
        })
    })
})
