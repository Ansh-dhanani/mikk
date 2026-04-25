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
 * Mikk: Risk Engine
 * Computes risk scores using a hybrid model:
 *   - PageRank-like centrality (normalised 0-1): captures globally critical hubs
 *     that BFS-depth alone misses (e.g. a shared utility called by 300 functions).
 *   - Fan-in + depth from reverse-BFS: local blast radius.
 *   - Domain modifiers: auth/security, database, public API surface.
 *
 * PageRank is computed lazily and cached per graph instance.
 * We use a sparse power-iteration (20 iterations, damping 0.85).
 */
export class RiskEngine {
    private _pageRankCache: Map<string, number> | null = null;
    private readonly MAX_CONTEXT_VISITS = 2500;

    constructor(private graph: DependencyGraph) {}

    /**
     * Compute the absolute risk score (0-100) for modifying a specific node.
     */
    public scoreNode(nodeId: string): number {
        const node = this.graph.nodes.get(nodeId);
        if (!node) return 0;

        const context = this.analyzeContext(nodeId);
        const modifiers = this.analyzeModifiers(node);
        const pr = this.getPageRank(nodeId);

        // Saturated base scoring keeps small/medium graphs discriminative while
        // preventing very large hubs from collapsing everything into 100.
        const fanInScore = Math.min(45, Math.log2(context.connectedNodesCount + 1) * 10);
        const depthScore = Math.min(20, context.dependencyDepth * 2);
        let score = fanInScore + depthScore;

        // PageRank boost: globally important nodes get up to +25 pts.
        // pr is normalised [0, 1] where 1 = highest-centrality node in graph.
        score += pr * 25;

        // Domain modifiers
        if (modifiers.isAuthOrSecurity) score += 25;
        if (modifiers.isDatabaseOrState) score += 15;
        if (modifiers.isPublicAPI) score += 12;

        return Math.min(Math.max(score, 0), 100);
    }

    /**
     * Return the (lazily computed, cached) PageRank for a node, normalised to [0, 1].
     * Uses sparse power-iteration over the call graph.
     */
    public getPageRank(nodeId: string): number {
        const ranks = this.computePageRanks();
        return ranks.get(nodeId) ?? 0;
    }

    /**
     * Compute PageRank for all function/class nodes in the call graph.
     * Cached per engine instance (i.e. per analyze() call).
     */
    private computePageRanks(): Map<string, number> {
        if (this._pageRankCache) return this._pageRankCache;

        const DAMPING = 0.85;
        const ITERATIONS = 20;
        const nodes: string[] = [];
        for (const [id, node] of this.graph.nodes) {
            if (node.type === 'function' || node.type === 'class') nodes.push(id);
        }
        const N = nodes.length;
        if (N === 0) { this._pageRankCache = new Map(); return this._pageRankCache; }

        const nodeSet = new Set(nodes);
        let ranks = new Map<string, number>();
        for (const id of nodes) ranks.set(id, 1 / N);

        for (let iter = 0; iter < ITERATIONS; iter++) {
            const next = new Map<string, number>();
            for (const id of nodes) next.set(id, (1 - DAMPING) / N);

            for (const id of nodes) {
                // Outgoing call edges from this node
                const outEdges = (this.graph.outEdges.get(id) || [])
                    .filter(e => e.type === 'calls' && nodeSet.has(e.to));
                if (outEdges.length === 0) {
                    // Dangling node: distribute rank evenly (standard PageRank treatment)
                    const share = (ranks.get(id) ?? 0) / N;
                    for (const nid of nodes) next.set(nid, (next.get(nid) ?? 0) + DAMPING * share);
                } else {
                    const share = (ranks.get(id) ?? 0) / outEdges.length;
                    for (const edge of outEdges) {
                        next.set(edge.to, (next.get(edge.to) ?? 0) + DAMPING * share);
                    }
                }
            }
            ranks = next;
        }

        // Normalise to [0, 1]: divide by the max rank
        let maxRank = 0;
        for (const v of ranks.values()) if (v > maxRank) maxRank = v;
        if (maxRank > 0) {
            for (const [k, v] of ranks) ranks.set(k, v / maxRank);
        }

        this._pageRankCache = ranks;
        return ranks;
    }

    private analyzeContext(nodeId: string): RiskContext {
        const visited = new Set<string>();
        let maxDepth = 0;

        // Use index pointer instead of queue.shift() — avoids O(n) array shift per pop.
        const queue: Array<{ id: string, depth: number }> = [{ id: nodeId, depth: 0 }];
        let queueHead = 0;
        visited.add(nodeId);

        let connectedNodesCount = 0;

        while (queueHead < queue.length && visited.size < this.MAX_CONTEXT_VISITS) {
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
