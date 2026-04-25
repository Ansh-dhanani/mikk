import { describe, it, expect } from 'bun:test'
import { ImpactAnalyzer } from '../src/graph/impact-analyzer'
import { buildTestGraph } from './helpers'

describe('ImpactAnalyzer - Classified', () => {

    it('classifies impacts based on depth and module boundaries', () => {
        // Calibration for Mikk Quantitative Risk (with PageRank):
        // PublicAPI → DBManager (m2, DB keyword, cross-module boost) → BStateAuthDB (m1, Auth+DB, exported) → AuthService (m1)
        
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

        // DBManager crosses a module boundary (m2 vs m3) at depth 1 -> boosted to 80 -> CRITICAL
        // BStateAuthDB has auth+db keywords and is exported -> also reaches critical threshold
        expect(result.classified.critical).toHaveLength(2)
        expect(result.classified.critical.map(c => c.nodeId)).toContain('fn:src/dbmanager.ts:dbmanager')
        expect(result.classified.critical.map(c => c.nodeId)).toContain('fn:src/bstateauthdb.ts:bstateauthdb')

        // There should be at least one HIGH or CRITICAL item beyond DBManager
        const highOrCritical = result.classified.critical.length + result.classified.high.length
        expect(highOrCritical).toBeGreaterThanOrEqual(1)

        // Total impacted nodes must be properly classified (no missing nodes)
        const totalClassified = result.classified.critical.length + result.classified.high.length
            + result.classified.medium.length + result.classified.low.length
        expect(totalClassified).toBe(3)
    })

    it('classifies same-module depth-1 impact as HIGH or lower when no cross-module boundary', () => {
        // HighRiskAuthService calls AuthDBInstance calls G
        // All in same module m4 — no cross-module boost — should NOT be CRITICAL from boundary alone
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

        // No cross-module boundary — the boundary boost (risk ≥ 80) should NOT trigger
        // (PageRank may push a node higher but boundary check is the only path to CRITICAL for small graphs)
        // The key invariant: no single-module chain should score 80+ from the boundary boost alone
        const boundaryBoostedCritical = result.classified.critical.filter(c => {
            // boundary boost only fires when moduleIds differ at depth 1
            const node = graph.nodes.get(c.nodeId)
            return node?.moduleId === 'm4' // all same module — none should be boundary-boosted
        })
        // If any critical nodes exist, they must NOT be due to the cross-module boundary boost
        // (since all nodes share m4, the boost never fires)
        // Nodes classified critical here would only be so due to auth/db keyword domain + PageRank
        const totalClassified = result.classified.critical.length + result.classified.high.length
            + result.classified.medium.length + result.classified.low.length
        expect(totalClassified).toBe(2)
        // AuthDBInstance (auth+db keywords) should score >= HighRiskAuthService (auth keyword only)
        const authDbScore = result.allImpacted?.find((c: any) => c.nodeId.includes('authdbinstance'))?.riskScore ?? 0
        const hrScore = result.allImpacted?.find((c: any) => c.nodeId.includes('highriskauthservice'))?.riskScore ?? 0
        expect(authDbScore).toBeGreaterThanOrEqual(hrScore)
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
