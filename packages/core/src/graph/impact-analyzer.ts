import type { DependencyGraph, ImpactResult, ClassifiedImpact } from './types.js'
import { RiskEngine } from './risk-engine.js'
import { ConfidenceEngine } from './confidence-engine.js'

/**
 * Mikk 2.0: Impact Analyzer
 * Given changed nodes, walks the graph backwards (reverse dependency)
 * to find everything impacted, computing quantitative risk and confidence.
 */
export class ImpactAnalyzer {
    private riskEngine: RiskEngine;
    private confidenceEngine: ConfidenceEngine;

    constructor(private graph: DependencyGraph) {
        this.riskEngine = new RiskEngine(graph);
        this.confidenceEngine = new ConfidenceEngine(graph);
    }

    /** Given a list of changed node IDs, find everything impacted */
    public analyze(changedNodeIds: string[]): ImpactResult {
        // depth and shortest-path tracking per visited node
        const visited = new Map<string, { depth: number, paths: string[][] }>();
        // Use an index pointer instead of queue.shift() to avoid O(n) dequeue cost.
        const queue: { id: string, depth: number, path: string[], pathSet: Set<string> }[] =
            changedNodeIds.map(id => ({ id, depth: 0, path: [id], pathSet: new Set([id]) }));
        let queueHead = 0;

        let maxDepth = 0;
        const entryPoints = new Set<string>();
        const criticalModules = new Set<string>();

        while (queueHead < queue.length) {
            const { id: current, depth, path, pathSet } = queue[queueHead++];

            if (!visited.has(current)) {
                visited.set(current, { depth, paths: [path] });
            } else {
                visited.get(current)!.paths.push(path);
                if (depth < visited.get(current)!.depth) {
                    visited.get(current)!.depth = depth;
                }
            }

            maxDepth = Math.max(maxDepth, depth);
            const node = this.graph.nodes.get(current);

            if (node?.metadata?.isExported) {
                entryPoints.add(current);
            }

            const dependents = this.graph.inEdges.get(current) || [];
            for (const edge of dependents) {
                // Allow 'contains' edges so if a function is changed, the file it belongs to is impacted, 
                // which then allows traversing 'imports' edges from other files.
                if (!pathSet.has(edge.from)) {
                    const newPathSet = new Set(pathSet);
                    newPathSet.add(edge.from);
                    queue.push({
                        id: edge.from,
                        depth: depth + 1,
                        path: [...path, edge.from],
                        pathSet: newPathSet,
                    });
                }
            }
        }

        const impactedIds = Array.from(visited.keys()).filter(id => 
            !changedNodeIds.includes(id) && id.startsWith('fn:')
        );
        
        let totalRisk = 0;
        let totalConfidence = 0;

        const classified = {
            critical: [] as ClassifiedImpact[],
            high: [] as ClassifiedImpact[],
            medium: [] as ClassifiedImpact[],
            low: [] as ClassifiedImpact[]
        };

        for (const id of impactedIds) {
            const context = visited.get(id)!;
            const node = this.graph.nodes.get(id);
            let risk = this.riskEngine.scoreNode(id);

            // Path reversal for confidence calculation (since BFS walks backwards)
            const reversedPaths = context.paths.map(p => [...p].reverse());
            const confidence = this.confidenceEngine.calculateNodeAggregatedConfidence(reversedPaths);

            // Mikk 2.0 Hybrid Risk: Boost if boundary crossed at depth 1
            // Check if ANY changed node crosses module boundary (not just first one)
            if (context.depth === 1 && node?.moduleId) {
                const crossesBoundary = changedNodeIds.some(id => {
                    const changedNode = this.graph.nodes.get(id);
                    // Add proper null checks for module IDs
                    if (!changedNode?.moduleId || !node.moduleId) {
                        return false;
                    }
                    return changedNode.moduleId !== node.moduleId;
                });
                if (crossesBoundary) {
                    risk = Math.max(risk, 80);
                }
            }

            totalRisk += risk;
            totalConfidence += confidence;

            const impactEntry: ClassifiedImpact = {
                nodeId: id,
                label: node?.name || 'unknown',
                file: node?.file || 'unknown',
                risk: (risk >= 80 ? 'CRITICAL' : risk >= 60 ? 'HIGH' : risk >= 40 ? 'MEDIUM' : 'LOW'),
                riskScore: risk,
                depth: context.depth
            };

            if (risk >= 80) classified.critical.push(impactEntry);
            else if (risk >= 60) classified.high.push(impactEntry);
            else if (risk >= 40) classified.medium.push(impactEntry);
            else classified.low.push(impactEntry);

            if (risk > 70 && node?.moduleId) {
                criticalModules.add(node.moduleId);
            }
        }

        const avgConfidence = impactedIds.length > 0 
            ? totalConfidence / impactedIds.length 
            : 1.0;

        const riskScore = impactedIds.length > 0
            ? Math.min(Math.max(totalRisk / impactedIds.length, 0), 100)
            : 0;

        const allImpacted: ClassifiedImpact[] = [
            ...classified.critical,
            ...classified.high,
            ...classified.medium,
            ...classified.low
        ];

        return {
            changed: changedNodeIds,
            impacted: impactedIds,
            allImpacted,
            depth: maxDepth,
            entryPoints: Array.from(entryPoints),
            criticalModules: Array.from(criticalModules),
            paths: Array.from(visited.values()).flatMap(v => v.paths),
            confidence: Number(avgConfidence.toFixed(3)),
            riskScore: Math.round(riskScore),
            classified
        };
    }
}
