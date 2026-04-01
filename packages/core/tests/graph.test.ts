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
        expect(graph.nodes.has('fn:src/auth.ts:verifytoken')).toBe(true)
        expect(graph.nodes.get('fn:src/auth.ts:verifytoken')!.type).toBe('function')
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
        expect(importEdges[0].from).toBe('src/auth.ts')
        expect(importEdges[0].to).toBe('src/utils/jwt.ts')
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
        expect(callEdges[0].from).toBe('fn:src/auth.ts:verifytoken')
        expect(callEdges[0].to).toBe('fn:src/utils/jwt.ts:jwtdecode')
    })

    it('creates containment edges', () => {
        const files = [
            mockParsedFile('src/auth.ts', [mockFunction('verifyToken', [], 'src/auth.ts')]),
        ]
        const graph = builder.build(files)
        const containEdges = graph.edges.filter(e => e.type === 'contains')
        expect(containEdges.length).toBeGreaterThanOrEqual(1)
        expect(containEdges[0].from).toBe('src/auth.ts')
        expect(containEdges[0].to).toBe('fn:src/auth.ts:verifytoken')
    })

    it('builds adjacency maps', () => {
        const files = [
            mockParsedFile('src/auth.ts', [mockFunction('verifyToken', [], 'src/auth.ts')]),
        ]
        const graph = builder.build(files)
        expect(graph.outEdges.has('src/auth.ts')).toBe(true)
        expect(graph.inEdges.has('fn:src/auth.ts:verifytoken')).toBe(true)
    })
})

describe('ImpactAnalyzer', () => {
    it('finds direct dependents', () => {
        const graph = buildTestGraph([
            ['A', 'B'],
            ['B', 'nothing'],
        ])
        const analyzer = new ImpactAnalyzer(graph)
        const result = analyzer.analyze(['fn:src/b.ts:b'])
        expect(result.impacted).toContain('fn:src/a.ts:a')
    })

    it('finds transitive dependents', () => {
        const graph = buildTestGraph([
            ['A', 'B'],
            ['B', 'C'],
            ['C', 'nothing'],
        ])
        const analyzer = new ImpactAnalyzer(graph)
        const result = analyzer.analyze(['fn:src/c.ts:c'])
        expect(result.impacted).toContain('fn:src/b.ts:b')
        expect(result.impacted).toContain('fn:src/a.ts:a')
    })

    it('reports correct depth', () => {
        const graph = buildTestGraph([
            ['A', 'B'],
            ['B', 'C'],
            ['C', 'D'],
            ['D', 'nothing'],
        ])
        const analyzer = new ImpactAnalyzer(graph)
        const result = analyzer.analyze(['fn:src/d.ts:d'])
        expect(result.depth).toBeGreaterThanOrEqual(3)
    })

    it('assigns high confidence for small impacts', () => {
        const graph = buildTestGraph([
            ['A', 'B'],
            ['B', 'nothing'],
        ])
        const analyzer = new ImpactAnalyzer(graph)
        const result = analyzer.analyze(['fn:src/b.ts:b'])
        // With the fix: small paths (2 hops) should have high confidence
        expect(result.confidence).toBeGreaterThanOrEqual(0.7)
    })

    it('does not include changed nodes in impacted', () => {
        const graph = buildTestGraph([
            ['A', 'B'],
            ['B', 'nothing'],
        ])
        const analyzer = new ImpactAnalyzer(graph)
        const result = analyzer.analyze(['fn:src/b.ts:b'])
        expect(result.impacted).not.toContain('fn:src/b.ts:b')
        expect(result.changed).toContain('fn:src/b.ts:b')
    })
})

describe('ClusterDetector', () => {
    it('groups files by directory', () => {
        const files = [
            mockParsedFile('src/auth/verify.ts',
                [mockFunction('verifyToken', ['authMiddleware'], 'src/auth/verify.ts')],
                [mockImport('./middleware', ['authMiddleware'], 'src/auth/middleware.ts')]
            ),
            mockParsedFile('src/auth/middleware.ts',
                [mockFunction('authMiddleware', ['verifyToken'], 'src/auth/middleware.ts')],
                [mockImport('./verify', ['verifyToken'], 'src/auth/verify.ts')]
            ),
            mockParsedFile('src/payments/charge.ts', [mockFunction('charge', [], 'src/payments/charge.ts')]),
        ]
        const graph = new GraphBuilder().build(files)
        // Use minClusterSize=1 so even single-file groups appear
        const detector = new ClusterDetector(graph, 1)
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
        const detector = new ClusterDetector(graph, 1)
        const score = detector.computeClusterConfidence(['src/auth/verify.ts'])
        expect(score).toBeGreaterThanOrEqual(0)
        expect(score).toBeLessThanOrEqual(1)
    })
})
