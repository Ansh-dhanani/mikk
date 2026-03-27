import type { DependencyGraph } from './types.js'

/**
 * ConfidenceEngine — computes path-confidence for impact analysis results.
 *
 * ImpactAnalyzer builds paths by walking BACKWARDS through `inEdges`
 * (dependent → dependency direction).  After the BFS the paths are
 * stored in forward-traversal order (changed-node → impacted-node).
 *
 * To find the edge between two consecutive path nodes we must therefore
 * look in `inEdges[next]` for an edge whose `.from === current`, which is
 * the same as looking in `outEdges[current]` for an edge whose `.to === next`.
 * We prefer `outEdges` because it gives O(out-degree) scans instead of
 * O(in-degree), but we fall back to `inEdges` so the engine is correct
 * regardless of traversal direction stored in the path.
 */
export class ConfidenceEngine {
    constructor(private graph: DependencyGraph) {}

    /**
     * Compute confidence along a specific ordered path of node IDs.
     *
     * @param pathIds Array of node IDs forming a path (e.g. ['A', 'B', 'C'])
     *                in forward (caller → callee) order.
     * @returns Cumulative confidence from 0.0 to 1.0; 1.0 for trivial paths.
     */
    calculatePathConfidence(pathIds: string[]): number {
        if (pathIds.length < 2) return 1.0

        let totalConfidence = 1.0

        for (let i = 0; i < pathIds.length - 1; i++) {
            const current = pathIds[i]
            const next    = pathIds[i + 1]

            // Prefer outEdges[current] for O(out-degree) look-up
            const edges = this.graph.outEdges.get(current)
                ?? this.graph.inEdges.get(next)   // fallback: scan inEdges of the next node
                ?? []

            let maxEdgeConfidence = 0.0
            for (const edge of edges) {
                // outEdges: edge.from === current, edge.to === next
                // inEdges:  edge.to   === next,    edge.from === current
                if (edge.to === next && edge.from === current) {
                    if ((edge.confidence ?? 1.0) > maxEdgeConfidence) {
                        maxEdgeConfidence = edge.confidence ?? 1.0
                    }
                }
            }

            if (maxEdgeConfidence === 0.0) {
                // Try inEdges[next] if outEdges produced no match
                const inbound = this.graph.inEdges.get(next) ?? []
                for (const edge of inbound) {
                    if (edge.from === current) {
                        if ((edge.confidence ?? 1.0) > maxEdgeConfidence) {
                            maxEdgeConfidence = edge.confidence ?? 1.0
                        }
                    }
                }
            }

            if (maxEdgeConfidence === 0.0) {
                // No edge found in either direction — path is broken or unresolvable
                return 0.0
            }

            totalConfidence *= maxEdgeConfidence
        }

        return totalConfidence
    }

    /**
     * Average confidence across all paths leading to a target node.
     */
    calculateNodeAggregatedConfidence(paths: string[][]): number {
        if (paths.length === 0) return 1.0

        const pathConfidences = paths.map(p => this.calculatePathConfidence(p))
        const sum = pathConfidences.reduce((a, b) => a + b, 0)
        return Number((sum / paths.length).toFixed(3))
    }
}
