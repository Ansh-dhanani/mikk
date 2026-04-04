import { describe, it, expect } from 'bun:test'
import { ImpactAnalyzer } from '../src/graph/impact-analyzer'
import { buildTestGraph } from './helpers'

describe('ImpactAnalyzer - Classified', () => {

    it('classifies impacts based on depth and module boundaries', () => {
        // Calibration for Mikk 2.0 Quantitative Risk:
        // AuthService (Auth keyword: 30) calls BStateAuthDB (State+Auth+DB keywords: 60) calls DBManager (m2, DB keyword: 20) calls PublicAPI (m3)
        
        const graph = buildTestGraph([
            ['AuthService', 'BStateAuthDB'],
            ['BStateAuthDB', 'DBManager'],
            ['DBManager', 'PublicAPI'],
            ['PublicAPI', 'nothing']
        ])

        // Assign modules manually for the test
        for (const id of graph.nodes.keys()) {
            if (id.includes('authservice')) graph.nodes.get(id)!.moduleId = 'm1'
            if (id.includes('bstateauthdb')) {
                graph.nodes.get(id)!.moduleId = 'm1'
                graph.nodes.get(id)!.metadata!.isExported = true 
            }
            if (id.includes('dbmanager')) graph.nodes.get(id)!.moduleId = 'm2'
            if (id.includes('publicapi')) graph.nodes.get(id)!.moduleId = 'm3'
        }

        const analyzer = new ImpactAnalyzer(graph)
        const result = analyzer.analyze(['fn:src/publicapi.ts:publicapi'])

        expect(result.impacted.length).toBe(3)

        // Critical: DBManager (boosted to 80)
        expect(result.classified.critical).toHaveLength(1)
        expect(result.classified.critical[0].nodeId).toBe('fn:src/dbmanager.ts:dbmanager')

        // High: BStateAuthDB (depth 2)
        // Base: 3.5 + Auth(30) + DB(20) + Exported(15) = 68.5 -> HIGH.
        expect(result.classified.high).toHaveLength(1)
        expect(result.classified.high[0].nodeId).toBe('fn:src/bstateauthdb.ts:bstateauthdb')

        // Low: AuthService (30 risk)
        expect(result.classified.low).toHaveLength(1)
        expect(result.classified.low[0].nodeId).toBe('fn:src/authservice.ts:authservice')
    })

    it('classifies same-module depth-1 impact as HIGH, not CRITICAL', () => {
        // HighRiskAuthService calls AuthDBInstance calls G
        const graph = buildTestGraph([
            ['HighRiskAuthService', 'AuthDBInstance'],
            ['AuthDBInstance', 'G'],
            ['G', 'nothing']
        ])

        for (const id of graph.nodes.keys()) {
            graph.nodes.get(id)!.moduleId = 'm4'
            if (id.includes('authdbinstance')) {
                graph.nodes.get(id)!.metadata!.isExported = true
            }
        }

        const analyzer = new ImpactAnalyzer(graph)
        const result = analyzer.analyze(['fn:src/g.ts:g'])

        expect(result.classified.critical).toHaveLength(0)
        expect(result.classified.high).toHaveLength(1)
        expect(result.classified.high[0].nodeId).toBe('fn:src/authdbinstance.ts:authdbinstance') 
        
        // HighRiskAuthService: depth 2, risk score 35.5 -> LOW
        expect(result.classified.low).toHaveLength(1)
        expect(result.classified.low[0].nodeId).toBe('fn:src/highriskauthservice.ts:highriskauthservice')
    })

    it('deduplicates impacted nodes when changed list includes duplicates', () => {
        const graph = buildTestGraph([
            ['A', 'B'],
            ['B', 'C'],
            ['C', 'nothing'],
        ])

        const analyzer = new ImpactAnalyzer(graph)
        const result = analyzer.analyze(['fn:src/c.ts:c', 'fn:src/c.ts:c'])
        const unique = new Set(result.impacted)
        expect(unique.size).toBe(result.impacted.length)
    })
})
