import type { DependencyGraph } from './types.js'

/**
 * Mikk 2.0: Confidence Engine
 * Computes the reliability of impact paths using a decay-based formula.
 * Base edge confidences (direct call = 1.0, fuzzy match = 0.6) are
 * multiplied along the path to determine full path confidence.
 */
export class ConfidenceEngine {
    constructor(private graph: DependencyGraph) {}

    /**
     * Compute confidence decay along a specific path of node IDs.
     * @param pathIds Array of node IDs forming a path (e.g. ['A', 'B', 'C'])
     * @returns Cumulative confidence score from 0.0 to 1.0
     */
    public calculatePathConfidence(pathIds: string[]): number {
        if (pathIds.length < 2) return 1.0;

        let totalConfidence = 1.0;

        for (let i = 0; i < pathIds.length - 1; i++) {
            const current = pathIds[i];
            const next = pathIds[i + 1];

            const outEdges = this.graph.outEdges.get(current) || [];
            // Find the highest confidence edge connecting current -> next
            let maxEdgeConfidence = 0.0;
            
            for (const edge of outEdges) {
                if (edge.to === next) {
                    if (edge.confidence > maxEdgeConfidence) {
                        maxEdgeConfidence = edge.confidence;
                    }
                }
            }

            if (maxEdgeConfidence === 0.0) {
                return 0.0; // Path is broken or no valid edge
            }

            totalConfidence *= maxEdgeConfidence;
        }

        return totalConfidence;
    }

    /**
     * Calculates the overall aggregated confidence for a target node
     * by averaging the confidence of all paths leading to it.
     */
    public calculateNodeAggregatedConfidence(paths: string[][]): number {
        if (paths.length === 0) return 1.0;
        
        const pathConfidences = paths.map(path => this.calculatePathConfidence(path));
        const sum = pathConfidences.reduce((a, b) => a + b, 0);
        
        return Number((sum / paths.length).toFixed(3));
    }
}
