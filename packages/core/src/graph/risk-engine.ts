import type { DependencyGraph, GraphNode } from './types.js'

export interface RiskContext {
    connectedNodesCount: number;
    dependencyDepth: number;
}

export interface RiskModifiers {
    isAuthOrSecurity: boolean;
    isDatabaseOrState: boolean;
    isPublicAPI: boolean;
}

/**
 * Mikk 2.0: Risk Engine
 * Computes risk scores based on a quantitative mathematical model.
 */
export class RiskEngine {
    constructor(private graph: DependencyGraph) {}

    /**
     * Compute the absolute risk score (0-100) for modifying a specific node.
     * Formula: Base Risk = (Connected Nodes * 1.5) + (Depth * 2) + Modifiers
     */
    public scoreNode(nodeId: string): number {
        const node = this.graph.nodes.get(nodeId);
        if (!node) return 0;

        const context = this.analyzeContext(nodeId);
        const modifiers = this.analyzeModifiers(node);

        let score = (context.connectedNodesCount * 1.5) + (context.dependencyDepth * 2);

        // Apply strict modifiers
        if (modifiers.isAuthOrSecurity) score += 30;
        if (modifiers.isDatabaseOrState) score += 20;
        if (modifiers.isPublicAPI) score += 15;

        return Math.min(Math.max(score, 0), 100);
    }

    private analyzeContext(nodeId: string): RiskContext {
        const visited = new Set<string>();
        let maxDepth = 0;

        // Use index pointer instead of queue.shift() — avoids O(n) array shift per pop.
        const queue: Array<{ id: string, depth: number }> = [{ id: nodeId, depth: 0 }];
        let queueHead = 0;
        visited.add(nodeId);

        let connectedNodesCount = 0;

        while (queueHead < queue.length) {
            const current = queue[queueHead++];
            maxDepth = Math.max(maxDepth, current.depth);

            const inEdges = this.graph.inEdges.get(current.id) || [];
            connectedNodesCount += inEdges.length;

            for (const edge of inEdges) {
                if (!visited.has(edge.from)) {
                    visited.add(edge.from);
                    queue.push({ id: edge.from, depth: current.depth + 1 });
                }
            }
        }

        return {
            connectedNodesCount,
            dependencyDepth: maxDepth
        };
    }

    private analyzeModifiers(node: GraphNode): RiskModifiers {
        const nameAndFile = `${node.name} ${node.file}`.toLowerCase();
        
        const authKeywords = ['auth', 'login', 'jwt', 'verify', 'token', 'crypt', 'hash', 'password'];
        const dbKeywords = ['db', 'query', 'sql', 'insert', 'update', 'delete', 'redis', 'cache', 'transaction'];
        
        return {
            isAuthOrSecurity: authKeywords.some(kw => nameAndFile.includes(kw)),
            isDatabaseOrState: dbKeywords.some(kw => nameAndFile.includes(kw)),
            isPublicAPI: !!node.metadata?.isExported
        };
    }
}
