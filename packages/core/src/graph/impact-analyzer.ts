import type { DependencyGraph, ImpactResult } from './types.js'

/**
 * ImpactAnalyzer — Given changed nodes, walks the graph backwards (BFS)
 * to find everything that depends on them.
 * Powers "what breaks if I change X?"
 */
export class ImpactAnalyzer {
    constructor(private graph: DependencyGraph) { }

    /** Given a list of changed node IDs, find everything impacted */
    analyze(changedNodeIds: string[]): ImpactResult {
        const visited = new Set<string>()
        const queue: { id: string; depth: number }[] = changedNodeIds.map(id => ({ id, depth: 0 }))
        let maxDepth = 0

        while (queue.length > 0) {
            const { id: current, depth } = queue.shift()!
            if (visited.has(current)) continue
            visited.add(current)
            maxDepth = Math.max(maxDepth, depth)

            // Find everything that depends on current (incoming edges)
            const dependents = this.graph.inEdges.get(current) || []
            for (const edge of dependents) {
                if (!visited.has(edge.source) && edge.type !== 'contains') {
                    queue.push({ id: edge.source, depth: depth + 1 })
                }
            }
        }

        const impacted = [...visited].filter(id => !changedNodeIds.includes(id))

        return {
            changed: changedNodeIds,
            impacted,
            depth: maxDepth,
            confidence: this.computeConfidence(impacted.length, maxDepth),
        }
    }

    /**
     * How confident are we in this impact analysis?
     * High = few nodes affected, shallow depth
     * Low = many nodes affected, deep chains
     */
    private computeConfidence(
        impactedCount: number,
        depth: number
    ): 'high' | 'medium' | 'low' {
        if (impactedCount < 5 && depth < 3) return 'high'
        if (impactedCount < 20 && depth < 6) return 'medium'
        return 'low'
    }
}
