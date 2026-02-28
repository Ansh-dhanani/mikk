import { describe, it, expect } from 'bun:test'
import { GraphBuilder } from '../src/graph/graph-builder'
import { ImpactAnalyzer } from '../src/graph/impact-analyzer'
import { ClusterDetector } from '../src/graph/cluster-detector'
import { mockParsedFile, mockFunction, mockImport, buildTestGraph } from './helpers'

describe('GraphBuilder', () => {
    const builder = new GraphBuilder()

    it('creates nodes for files', () => {
        const files = [mockParsedFile('src/auth.ts')]
        const graph = builder.build(files)
        expect(graph.nodes.has('src/auth.ts')).toBe(true)
        expect(graph.nodes.get('src/auth.ts')!.type).toBe('file')
    })

    it('creates nodes for functions', () => {
        const files = [
            mockParsedFile('src/auth.ts', [mockFunction('verifyToken', [], 'src/auth.ts')]),
        ]
        const graph = builder.build(files)
        expect(graph.nodes.has('fn:src/auth.ts:verifyToken')).toBe(true)
        expect(graph.nodes.get('fn:src/auth.ts:verifyToken')!.type).toBe('function')
    })

    it('creates edges for imports', () => {
        const files = [
            mockParsedFile(
                'src/auth.ts',
                [mockFunction('verifyToken', [], 'src/auth.ts')],
                [mockImport('../utils/jwt', ['jwtDecode'], 'src/utils/jwt.ts')]
            ),
            mockParsedFile('src/utils/jwt.ts', [mockFunction('jwtDecode', [], 'src/utils/jwt.ts')]),
        ]
        const graph = builder.build(files)
        const importEdges = graph.edges.filter(e => e.type === 'imports')
        expect(importEdges.length).toBeGreaterThanOrEqual(1)
        expect(importEdges[0].source).toBe('src/auth.ts')
        expect(importEdges[0].target).toBe('src/utils/jwt.ts')
    })

    it('creates edges for function calls via imports', () => {
        const files = [
            mockParsedFile(
                'src/auth.ts',
                [mockFunction('verifyToken', ['jwtDecode'], 'src/auth.ts')],
                [mockImport('../utils/jwt', ['jwtDecode'], 'src/utils/jwt.ts')]
            ),
            mockParsedFile('src/utils/jwt.ts', [mockFunction('jwtDecode', [], 'src/utils/jwt.ts')]),
        ]
        const graph = builder.build(files)
        const callEdges = graph.edges.filter(e => e.type === 'calls')
        expect(callEdges.length).toBeGreaterThanOrEqual(1)
        expect(callEdges[0].source).toBe('fn:src/auth.ts:verifyToken')
        expect(callEdges[0].target).toBe('fn:src/utils/jwt.ts:jwtDecode')
    })

    it('creates containment edges', () => {
        const files = [
            mockParsedFile('src/auth.ts', [mockFunction('verifyToken', [], 'src/auth.ts')]),
        ]
        const graph = builder.build(files)
        const containEdges = graph.edges.filter(e => e.type === 'contains')
        expect(containEdges.length).toBeGreaterThanOrEqual(1)
        expect(containEdges[0].source).toBe('src/auth.ts')
        expect(containEdges[0].target).toBe('fn:src/auth.ts:verifyToken')
    })

    it('builds adjacency maps', () => {
        const files = [
            mockParsedFile('src/auth.ts', [mockFunction('verifyToken', [], 'src/auth.ts')]),
        ]
        const graph = builder.build(files)
        expect(graph.outEdges.has('src/auth.ts')).toBe(true)
        expect(graph.inEdges.has('fn:src/auth.ts:verifyToken')).toBe(true)
    })
})

describe('ImpactAnalyzer', () => {
    it('finds direct dependents', () => {
        const graph = buildTestGraph([
            ['A', 'B'],
            ['B', 'nothing'],
        ])
        const analyzer = new ImpactAnalyzer(graph)
        const result = analyzer.analyze(['fn:src/B.ts:B'])
        expect(result.impacted).toContain('fn:src/A.ts:A')
    })

    it('finds transitive dependents', () => {
        const graph = buildTestGraph([
            ['A', 'B'],
            ['B', 'C'],
            ['C', 'nothing'],
        ])
        const analyzer = new ImpactAnalyzer(graph)
        const result = analyzer.analyze(['fn:src/C.ts:C'])
        expect(result.impacted).toContain('fn:src/B.ts:B')
        expect(result.impacted).toContain('fn:src/A.ts:A')
    })

    it('reports correct depth', () => {
        const graph = buildTestGraph([
            ['A', 'B'],
            ['B', 'C'],
            ['C', 'D'],
            ['D', 'nothing'],
        ])
        const analyzer = new ImpactAnalyzer(graph)
        const result = analyzer.analyze(['fn:src/D.ts:D'])
        expect(result.depth).toBeGreaterThanOrEqual(3)
    })

    it('assigns high confidence for small impacts', () => {
        const graph = buildTestGraph([
            ['A', 'B'],
            ['B', 'nothing'],
        ])
        const analyzer = new ImpactAnalyzer(graph)
        const result = analyzer.analyze(['fn:src/B.ts:B'])
        expect(result.confidence).toBe('high')
    })

    it('does not include changed nodes in impacted', () => {
        const graph = buildTestGraph([
            ['A', 'B'],
            ['B', 'nothing'],
        ])
        const analyzer = new ImpactAnalyzer(graph)
        const result = analyzer.analyze(['fn:src/B.ts:B'])
        expect(result.impacted).not.toContain('fn:src/B.ts:B')
        expect(result.changed).toContain('fn:src/B.ts:B')
    })
})

describe('ClusterDetector', () => {
    it('groups files by directory', () => {
        const files = [
            mockParsedFile('src/auth/verify.ts', [mockFunction('verifyToken', [], 'src/auth/verify.ts')]),
            mockParsedFile('src/auth/middleware.ts', [mockFunction('authMiddleware', [], 'src/auth/middleware.ts')]),
            mockParsedFile('src/payments/charge.ts', [mockFunction('charge', [], 'src/payments/charge.ts')]),
        ]
        const graph = new GraphBuilder().build(files)
        const detector = new ClusterDetector(graph)
        const clusters = detector.detect()
        expect(clusters.length).toBeGreaterThanOrEqual(2)
        const authCluster = clusters.find(c => c.id === 'auth')
        expect(authCluster).toBeDefined()
        expect(authCluster!.files).toHaveLength(2)
    })

    it('computes confidence scores', () => {
        const files = [
            mockParsedFile('src/auth/verify.ts', [mockFunction('verifyToken', [], 'src/auth/verify.ts')]),
        ]
        const graph = new GraphBuilder().build(files)
        const detector = new ClusterDetector(graph)
        const score = detector.computeClusterConfidence(['src/auth/verify.ts'])
        expect(score).toBeGreaterThanOrEqual(0)
        expect(score).toBeLessThanOrEqual(1)
    })
})
