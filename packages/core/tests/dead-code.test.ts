import { describe, it, expect } from 'bun:test'
import { DeadCodeDetector } from '../src/graph/dead-code-detector'
import { buildTestGraph, mockFunction } from './helpers'
import { GraphBuilder } from '../src/graph/graph-builder'
import type { MikkLock } from '../src/contract/schema'

/** Helper to generate a dummy lock file from graph nodes for the detector */
function generateDummyLock(graphNodes: Map<string, any>): MikkLock {
    const lock: MikkLock = {
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        generatorVersion: '1.0.0',
        projectRoot: '/test',
        syncState: {
            status: 'clean',
            lastSyncAt: new Date().toISOString(),
            lockHash: 'x',
            contractHash: 'x',
        },
        graph: {
            nodes: 0,
            edges: 0,
            rootHash: 'x',
        },
        functions: {},
        classes: {},
        files: {},
        modules: {},
        routes: [],
    }

    for (const [id, node] of graphNodes.entries()) {
        if (node.type === 'function') {
            const name = node.label
            const file = node.file
            // We need to populate `calledBy` for transitive liveness checks

            lock.functions[id] = {
                id,
                name,
                file,
                moduleId: node.moduleId ?? 'unknown',
                startLine: 1, endLine: 10, hash: 'x',
                calls: [],
                calledBy: [],
                isExported: node.metadata?.isExported ?? false,
                isAsync: false,
                params: [],
            }
        }
    }
    return lock
}

describe('DeadCodeDetector', () => {

    it('detects uncalled functions', () => {
        // A calls B. C is isolated.
        const graph = buildTestGraph([
            ['A', 'B'],
            ['B', 'nothing'],
            ['C', 'nothing']
        ])

        const lock = generateDummyLock(graph.nodes)

        // Add calledBy relationships since GraphBuilder test helper doesn't do reverse 
        // lookups for the lock structure (it only does it for the graph)
        Object.values(lock.functions).forEach(fn => {
            const inEdges = graph.inEdges.get(fn.id) ?? []
            fn.calledBy = inEdges.filter(e => e.type === 'calls').map(e => e.source)
        })

        const detector = new DeadCodeDetector(graph, lock)
        const result = detector.detect()

        expect(result.deadFunctions.map(f => f.name)).toContain('C')
        expect(result.deadFunctions.map(f => f.name)).toContain('A') // A has no callers, so it is dead code
        expect(result.deadFunctions.map(f => f.name)).not.toContain('B') // B has a caller
    })

    it('exempts exported functions', () => {
        const graph = buildTestGraph([
            ['D', 'nothing']
        ])
        graph.nodes.get('fn:src/D.ts:D')!.metadata!.isExported = true

        const lock = generateDummyLock(graph.nodes)

        const detector = new DeadCodeDetector(graph, lock)
        const result = detector.detect()

        expect(result.deadFunctions).toHaveLength(0) // D is exported
    })

    it('exempts entry point name patterns', () => {
        const graph = buildTestGraph([
            ['main', 'nothing'],
            ['loginHandler', 'nothing'],
            ['useAuth', 'nothing'] // React hook
        ])

        const lock = generateDummyLock(graph.nodes)

        const detector = new DeadCodeDetector(graph, lock)
        const result = detector.detect()

        expect(result.deadFunctions).toHaveLength(0) // All match exempt patterns
    })

    it('exempts functions called by exported functions in the same file', () => {
        const graph = buildTestGraph([
            ['ExportedFn', 'InternalHelper'],
            ['InternalHelper', 'nothing']
        ])

        // Both in same file by default from buildTestGraph
        graph.nodes.get('fn:src/ExportedFn.ts:ExportedFn')!.metadata!.isExported = true

        // In the lock, we must place them in the SAME file manually because buildTestGraph 
        // puts them in separate files based on name
        const lock = generateDummyLock(graph.nodes)
        lock.functions['fn:src/ExportedFn.ts:ExportedFn'].file = 'src/shared.ts'
        lock.functions['fn:src/InternalHelper.ts:InternalHelper'].file = 'src/shared.ts'

        // Set up the calledBy relation
        lock.functions['fn:src/InternalHelper.ts:InternalHelper'].calledBy = ['fn:src/ExportedFn.ts:ExportedFn']

        const detector = new DeadCodeDetector(graph, lock)
        const result = detector.detect()

        expect(result.deadFunctions).toHaveLength(0) // InternalHelper is called by exported fn in same file
    })
})
