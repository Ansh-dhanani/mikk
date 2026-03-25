import type { DependencyGraph } from './types.js'

/**
 * Mikk 2.0: Query Engine
 * Provides high-performance graph traversal and path-finding tools.
 * Focuses on symbol-level precision.
 */
export class QueryEngine {
    constructor(private graph: DependencyGraph) {}

    /** Find all direct dependents (who calls me?) */
    public getDependents(nodeId: string): string[] {
        return (this.graph.inEdges.get(nodeId) || [])
            .filter(e => e.type !== 'contains')
            .map(e => e.from);
    }

    /** Find all direct dependencies (who do I call?) */
    public getDependencies(nodeId: string): string[] {
        return (this.graph.outEdges.get(nodeId) || [])
            .filter(e => e.type !== 'contains')
            .map(e => e.to);
    }

    /** 
     * Find the shortest path between two nodes using BFS.
     * Returns an array of node IDs or null if no path exists.
     */
    public findPath(start: string, end: string): string[] | null {
        if (!this.graph.nodes.has(start) || !this.graph.nodes.has(end)) return null;
        if (start === end) return [start];

        const queue: { id: string, path: string[] }[] = [{ id: start, path: [start] }];
        const visited = new Set<string>([start]);

        while (queue.length > 0) {
            const { id, path } = queue.shift()!;
            
            const outwardEdges = this.graph.outEdges.get(id) || [];
            for (const edge of outwardEdges) {
                if (edge.type === 'contains') continue;
                
                if (edge.to === end) {
                    return [...path, end];
                }

                if (!visited.has(edge.to)) {
                    visited.add(edge.to);
                    queue.push({ id: edge.to, path: [...path, edge.to] });
                }
            }
        }

        return null;
    }

    /** 
     * Get the full downstream impact (transitive dependents) of a node.
     * Useful for assessing "What would break if I change X?"
     */
    public getDownstreamImpact(nodeId: string): string[] {
        const visited = new Set<string>();
        const queue: string[] = [nodeId];

        while (queue.length > 0) {
            const current = queue.shift()!;
            const dependents = this.getDependents(current);
            
            for (const dep of dependents) {
                if (!visited.has(dep) && dep !== nodeId) {
                    visited.add(dep);
                    queue.push(dep);
                }
            }
        }

        return Array.from(visited);
    }
}
