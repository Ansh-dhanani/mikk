import { describe, it, expect } from 'bun:test'
import { ImpactAnalyzer } from '../src/graph/impact-analyzer'
import { buildTestGraph } from './helpers'
import { GraphBuilder } from '../src/graph/graph-builder'

describe('ImpactAnalyzer - Classified', () => {

    it('classifies impacts based on depth and module boundaries', () => {
        // Build graph with module boundaries:
        // A (module: m1) calls B (module: m1) calls C (module: m2) calls D (module: m3)
        // We are changing D. What is the impact?
        // D is changed
        // C is depth 1, crosses boundary -> CRITICAL
        // B is depth 2 -> MEDIUM
        // A is depth 3 -> LOW

        const graph = buildTestGraph([
            ['A', 'B'],
            ['B', 'C'],
            ['C', 'D'],
            ['D', 'nothing']
        ])

        // Assign modules manually for the test
        graph.nodes.get('src/A.ts')!.moduleId = 'm1'
        graph.nodes.get('fn:src/A.ts:A')!.moduleId = 'm1'

        graph.nodes.get('src/B.ts')!.moduleId = 'm1'
        graph.nodes.get('fn:src/B.ts:B')!.moduleId = 'm1'

        graph.nodes.get('src/C.ts')!.moduleId = 'm2'
        graph.nodes.get('fn:src/C.ts:C')!.moduleId = 'm2'

        graph.nodes.get('src/D.ts')!.moduleId = 'm3'
        graph.nodes.get('fn:src/D.ts:D')!.moduleId = 'm3'

        const analyzer = new ImpactAnalyzer(graph)
        const result = analyzer.analyze(['fn:src/D.ts:D'])

        expect(result.impacted.length).toBe(3)

        expect(result.classified.critical).toHaveLength(1)
        expect(result.classified.critical[0].nodeId).toBe('fn:src/C.ts:C')

        expect(result.classified.high).toHaveLength(0) // No depth 1 in same module

        expect(result.classified.medium).toHaveLength(1)
        expect(result.classified.medium[0].nodeId).toBe('fn:src/B.ts:B')

        expect(result.classified.low).toHaveLength(1)
        expect(result.classified.low[0].nodeId).toBe('fn:src/A.ts:A')
    })

    it('classifies same-module depth-1 impact as HIGH, not CRITICAL', () => {
        // E (module: m4) calls F (module: m4) calls G (module: m4)
        // change G
        // F is depth 1, same module -> HIGH
        // E is depth 2 -> MEDIUM
        const graph = buildTestGraph([
            ['E', 'F'],
            ['F', 'G'],
            ['G', 'nothing']
        ])

        for (const id of graph.nodes.keys()) {
            graph.nodes.get(id)!.moduleId = 'm4'
        }

        const analyzer = new ImpactAnalyzer(graph)
        const result = analyzer.analyze(['fn:src/G.ts:G'])

        expect(result.classified.critical).toHaveLength(0)
        expect(result.classified.high).toHaveLength(1)
        expect(result.classified.high[0].nodeId).toBe('fn:src/F.ts:F') // depth 1
        expect(result.classified.medium).toHaveLength(1)
        expect(result.classified.medium[0].nodeId).toBe('fn:src/E.ts:E') // depth 2
    })
})
