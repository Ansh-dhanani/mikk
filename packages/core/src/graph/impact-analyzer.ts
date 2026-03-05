import type { DependencyGraph, ImpactResult, ClassifiedImpact, RiskLevel } from './types.js'

/**
 * ImpactAnalyzer — Given changed nodes, walks the graph backwards (BFS)
 * to find everything that depends on them.
 * Powers "what breaks if I change X?"
 *
 * Now includes risk classification:
 *   CRITICAL = direct caller (depth 1) that crosses a module boundary
 *   HIGH     = direct caller (depth 1) within the same module
 *   MEDIUM   = depth 2
 *   LOW      = depth 3+
 */
export class ImpactAnalyzer {
    constructor(private graph: DependencyGraph) { }

    /** Given a list of changed node IDs, find everything impacted */
    analyze(changedNodeIds: string[]): ImpactResult {
        const visited = new Set<string>()
        const depthMap = new Map<string, number>()
        const queue: { id: string; depth: number }[] = changedNodeIds.map(id => ({ id, depth: 0 }))
        let maxDepth = 0

        const changedSet = new Set(changedNodeIds)

        // Collect module IDs of the changed nodes
        const changedModules = new Set<string | undefined>()
        for (const id of changedNodeIds) {
            const node = this.graph.nodes.get(id)
            if (node) changedModules.add(node.moduleId)
        }

        while (queue.length > 0) {
            const { id: current, depth } = queue.shift()!
            if (visited.has(current)) continue
            visited.add(current)
            depthMap.set(current, depth)
            maxDepth = Math.max(maxDepth, depth)

            // Find everything that depends on current (incoming edges)
            const dependents = this.graph.inEdges.get(current) || []
            for (const edge of dependents) {
                if (!visited.has(edge.source) && edge.type !== 'contains') {
                    queue.push({ id: edge.source, depth: depth + 1 })
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
                    depth === 1 ? 'high' :
                        depth === 2 ? 'medium' :
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
            confidence: this.computeConfidence(impacted.length, maxDepth),
            classified,
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
