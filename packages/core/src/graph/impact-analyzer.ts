
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
    private static readonly MAX_PATHS_PER_NODE = 6;
    private static readonly MIN_QUEUE_CAP = 1024;

    constructor(private graph: DependencyGraph) {
        this.riskEngine = new RiskEngine(graph);
        this.confidenceEngine = new ConfidenceEngine(graph);
    }

    /** Given a list of changed node IDs, find everything impacted */
    public analyze(changedNodeIds: string[], maxDepth: number = 8, maxImpacted: number = 500): ImpactResult {
        // depth and shortest-path tracking per visited node
        const visited = new Map<string, { depth: number, paths: string[][] }>();
        const pathKeysByNode = new Map<string, Set<string>>();
        const normalizedDepth = Math.max(maxDepth, 1);
        const maxQueueSize = Math.max(
            ImpactAnalyzer.MIN_QUEUE_CAP,
            maxImpacted * normalizedDepth * 4,
        );

        // Use parent references to avoid cloning full paths and path sets per hop.
        const queue: Array<{ id: string; depth: number; parent: number }> = [];
        const bestQueuedDepth = new Map<string, number>();

        for (const id of changedNodeIds) {
            queue.push({ id, depth: 0, parent: -1 });
            bestQueuedDepth.set(id, 0);
        }
        let queueHead = 0;

        let traversedMaxDepth = 0;
        const entryPoints = new Set<string>();
        const criticalModules = new Set<string>();

        while (queueHead < queue.length && visited.size < maxImpacted) {
            const currentIndex = queueHead;
            const { id: current, depth } = queue[queueHead++];

            // Enforce depth limit to prevent unbounded traversal
            if (depth > maxDepth) continue;

            const path = this.reconstructPath(queue, currentIndex);
            const pathKey = path.join('>');

            if (!visited.has(current)) {
                visited.set(current, { depth, paths: [path] });
                pathKeysByNode.set(current, new Set([pathKey]));
            } else {
                const keys = pathKeysByNode.get(current)!;
                if (keys.size < ImpactAnalyzer.MAX_PATHS_PER_NODE && !keys.has(pathKey)) {
                    visited.get(current)!.paths.push(path);
                    keys.add(pathKey);
                }
                if (depth < visited.get(current)!.depth) {
                    visited.get(current)!.depth = depth;
                }
            }

            traversedMaxDepth = Math.max(traversedMaxDepth, depth);
            const node = this.graph.nodes.get(current);

            if (node?.metadata?.isExported) {
                entryPoints.add(current);
            }

            const dependents = this.graph.inEdges.get(current) || [];
            for (const edge of dependents) {
                if (depth + 1 > maxDepth) continue;
                if (queue.length >= maxQueueSize) continue;
                if (this.pathContains(queue, currentIndex, edge.from)) continue;

                const nextDepth = depth + 1;
                const bestDepth = bestQueuedDepth.get(edge.from);
                if (bestDepth !== undefined && nextDepth > bestDepth + 1) continue;
                if (bestDepth === undefined || nextDepth < bestDepth) {
                    bestQueuedDepth.set(edge.from, nextDepth);
                }

                queue.push({ id: edge.from, depth: nextDepth, parent: currentIndex });
            }
        }

        const impactedIds = Array.from(visited.keys()).filter(id =>
            !changedNodeIds.includes(id) &&
            (id.startsWith('fn:') || id.startsWith('class:') || id.startsWith('var:') || id.startsWith('type:') || id.startsWith('prop:'))
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

            // BFS walks backwards (from changed → dependents), so paths are already
            // in forward direction: changed → dependent. No reversal needed.
            const confidence = this.confidenceEngine.calculateNodeAggregatedConfidence(context.paths);

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
            depth: traversedMaxDepth,
            entryPoints: Array.from(entryPoints),
            criticalModules: Array.from(criticalModules),
            paths: Array.from(visited.values()).flatMap(v => v.paths),
            confidence: Number(avgConfidence.toFixed(3)),
            riskScore: Math.round(riskScore),
            classified
        };
    }

    private reconstructPath(queue: Array<{ id: string; depth: number; parent: number }>, idx: number): string[] {
        const path: string[] = [];
        let cur = idx;
        while (cur >= 0) {
            path.push(queue[cur].id);
            cur = queue[cur].parent;
        }
        return path.reverse();
    }

    private pathContains(queue: Array<{ id: string; depth: number; parent: number }>, idx: number, target: string): boolean {
        let cur = idx;
        while (cur >= 0) {
            if (queue[cur].id === target) return true;
            cur = queue[cur].parent;
        }
        return false;
    }
}
