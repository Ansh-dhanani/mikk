import type { DependencyGraph, GraphEdge, ImpactResult, ClassifiedImpact, RiskLevel } from './types.js'

/**
 * ImpactAnalyzer — Given changed nodes, walks the graph backwards (BFS)
 * to find everything that depends on them.
 * Powers "what breaks if I change X?"
 *
 * Risk classification:
 *   CRITICAL = direct caller (depth 1) that crosses a module boundary
 *   HIGH     = direct caller (depth 1) within the same module
 *   MEDIUM   = depth 2
 *   LOW      = depth 3+
 *
 * Confidence is derived from the quality of resolved edges in the traversal
 * path, not from the size of the result set. A small impact set built from
 * low-confidence (unresolved/fuzzy) edges is still LOW confidence.
 */
export class ImpactAnalyzer {
    constructor(private graph: DependencyGraph) { }

    /** Given a list of changed node IDs, find everything impacted */
    analyze(changedNodeIds: string[]): ImpactResult {
        const visited = new Set<string>()
        const depthMap = new Map<string, number>()
        // Track the minimum confidence seen along the path to each node
        const pathConfidence = new Map<string, number>()

        const queue: { id: string; depth: number; confidence: number }[] =
            changedNodeIds.map(id => ({ id, depth: 0, confidence: 1.0 }))
        let maxDepth = 0

        const changedSet = new Set(changedNodeIds)

        // Collect module IDs of the changed nodes
        const changedModules = new Set<string | undefined>()
        for (const id of changedNodeIds) {
            const node = this.graph.nodes.get(id)
            if (node) changedModules.add(node.moduleId)
        }

        while (queue.length > 0) {
            const { id: current, depth, confidence: pathConf } = queue.shift()!
            if (visited.has(current)) continue
            visited.add(current)
            depthMap.set(current, depth)
            pathConfidence.set(current, pathConf)
            maxDepth = Math.max(maxDepth, depth)

            // Find everything that depends on current (incoming edges)
            const dependents = this.graph.inEdges.get(current) || []
            for (const edge of dependents) {
                if (!visited.has(edge.source) && edge.type !== 'contains') {
                    // Propagate the minimum confidence seen so far on this path.
                    // A chain is only as trustworthy as its weakest link.
                    const edgeConf = edge.confidence ?? 1.0
                    const newPathConf = Math.min(pathConf, edgeConf)
                    queue.push({ id: edge.source, depth: depth + 1, confidence: newPathConf })
                }
            }
        }

        const impacted = [...visited].filter(id => !changedSet.has(id))

        // Classify each impacted node by risk level
        const classified: ImpactResult['classified'] = {
            critical: [],
            high: [],
            medium: [],
            low: [],
        }

        for (const id of impacted) {
            const node = this.graph.nodes.get(id)
            if (!node) continue

            const depth = depthMap.get(id) ?? 999
            const crossesBoundary = !changedModules.has(node.moduleId)

            const risk: RiskLevel =
                depth === 1 && crossesBoundary ? 'critical' :
                depth === 1                    ? 'high'     :
                depth === 2                    ? 'medium'   :
                                                 'low'

            const entry: ClassifiedImpact = {
                nodeId: id,
                label: node.label,
                file: node.file,
                moduleId: node.moduleId,
                risk,
                depth,
            }

            classified[risk].push(entry)
        }

        return {
            changed: changedNodeIds,
            impacted,
            depth: maxDepth,
            confidence: this.computeConfidence(impacted, pathConfidence),
            classified,
        }
    }

    /**
     * Derive confidence from the actual quality of edges traversed, not from
     * result size. A small result built from fuzzy/unresolved edges is LOW
     * confidence; a large result built from high-confidence AST edges is HIGH.
     *
     * Algorithm:
     *   - Compute the average minimum-path-confidence across all impacted nodes.
     *   - Penalise for deep chains (they amplify uncertainty).
     *   - Map the combined score to HIGH / MEDIUM / LOW.
     */
    private computeConfidence(
        impacted: string[],
        pathConfidence: Map<string, number>,
    ): 'high' | 'medium' | 'low' {
        if (impacted.length === 0) return 'high'

        // Average path confidence across all impacted nodes
        let total = 0
        for (const id of impacted) {
            total += pathConfidence.get(id) ?? 1.0
        }
        const avgConf = total / impacted.length

        // Penalise for deep chains: confidence erodes with depth
        const depthPenalty = impacted.length > 20 ? 0.15 : impacted.length > 10 ? 0.08 : 0

        const score = avgConf - depthPenalty

        if (score >= 0.75) return 'high'
        if (score >= 0.50) return 'medium'
        return 'low'
    }
}
