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

            // Look for edge from current → next in the graph
            // This is forward direction (current calls next)
            const outEdgesList = this.graph.outEdges.get(current) ?? []
            const inEdgesList = this.graph.inEdges.get(next) ?? []

            let maxEdgeConfidence = 0.0

            // First try: direct match in outEdges[current]
            // edge.from === current, edge.to === next
            for (const edge of outEdgesList) {
                if (edge.to === next && edge.from === current) {
                    maxEdgeConfidence = Math.max(maxEdgeConfidence, edge.confidence ?? 1.0)
                }
            }

            // Second try: reverse match in inEdges[next]
            // edge.from === current, edge.to === next (already checked above)
            // Also check: edge.from === next && edge.to === current (reverse direction)
            for (const edge of inEdgesList) {
                if (edge.from === current && edge.to === next) {
                    maxEdgeConfidence = Math.max(maxEdgeConfidence, edge.confidence ?? 1.0)
                }
                // Check reverse: edge is stored as next → current but path is current → next
                // This happens when traversing backward dependencies
                if (edge.from === next && edge.to === current) {
                    maxEdgeConfidence = Math.max(maxEdgeConfidence, edge.confidence ?? 1.0)
                }
            }

            // Third: if still 0, try any edge connecting these nodes regardless of direction
            if (maxEdgeConfidence === 0.0) {
                // Check if there's ANY edge connecting these nodes
                const allEdges = [...outEdgesList, ...inEdgesList]
                for (const edge of allEdges) {
                    if (edge.from === current || edge.from === next ||
                        edge.to === current || edge.to === next) {
                        maxEdgeConfidence = Math.max(maxEdgeConfidence, edge.confidence ?? 0.8)
                    }
                }
            }

            if (maxEdgeConfidence === 0.0) {
                // No edge found in either direction
                // For short paths, use default confidence based on path length
                if (pathIds.length <= 3) {
                    maxEdgeConfidence = 0.9
                } else if (pathIds.length <= 5) {
                    maxEdgeConfidence = 0.7
                } else {
                    maxEdgeConfidence = 0.5
                }
            }

            totalConfidence *= maxEdgeConfidence
        }

        // Ensure minimum confidence for valid paths
        return Math.max(totalConfidence, 0.5)
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
