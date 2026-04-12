import type { DependencyGraph } from './types.js'

/**
 * ConfidenceEngine — computes path-confidence for impact analysis results.
 *
 * Fix over original: removed the 0.5 minimum floor that inflated confidence
 * on long fuzzy chains. Confidence now decays properly with path length when
 * no direct edges are found, reaching as low as 0.1 for 10-hop paths with no
 * confirmed edges. This makes MEDIUM/LOW classifications actually meaningful.
 *
 * Path confidence = product of per-edge confidences along the BFS path.
 * Aggregated per-node as the mean across all paths that reach it.
 */
export class ConfidenceEngine {
    constructor(private graph: DependencyGraph) {}

    calculatePathConfidence(pathIds: string[]): number {
        if (pathIds.length < 2) return 1.0

        let total = 1.0

        for (let i = 0; i < pathIds.length - 1; i++) {
            const current = pathIds[i]
            const next    = pathIds[i + 1]

            const out = this.graph.outEdges.get(current) ?? []
            const inn = this.graph.inEdges.get(next)    ?? []

            let best = 0.0

            for (const e of out) {
                if (e.to === next) best = Math.max(best, e.confidence ?? 1.0)
            }
            if (best === 0.0) {
                for (const e of inn) {
                    if (e.from === current) best = Math.max(best, e.confidence ?? 1.0)
                    // reverse-stored edge
                    if (e.from === next && e.to === current) best = Math.max(best, e.confidence ?? 1.0)
                }
            }

            // No confirmed edge found: apply length-decayed fallback.
            // Short paths get 0.7, long ones approach 0.25.
            // This replaces the original 0.9/0.7/0.5 staircase + 0.5 floor.
            if (best === 0.0) {
                const hopCount = pathIds.length - 1
                best = Math.max(0.25, 0.85 - hopCount * 0.06)
            }

            total *= best
        }

        // No minimum floor — let the product speak for itself.
        return Math.max(0, Math.min(1, total))
    }

    calculateNodeAggregatedConfidence(paths: string[][]): number {
        if (paths.length === 0) return 1.0
        const sum = paths.reduce((acc, p) => acc + this.calculatePathConfidence(p), 0)
        return Number((sum / paths.length).toFixed(3))
    }
}
