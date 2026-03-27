import type { DependencyGraph } from './types.js'

/**
 * QueryEngine — high-performance graph traversal and path-finding.
 *
 * All BFS loops use an index pointer instead of Array.shift() to avoid
 * the O(n) cost of shifting the underlying array on each dequeue.
 */
export class QueryEngine {
    constructor(private graph: DependencyGraph) {}

    /** Find all direct dependents (who calls this node?) */
    getDependents(nodeId: string): string[] {
        return (this.graph.inEdges.get(nodeId) ?? [])
            .filter(e => e.type !== 'contains')
            .map(e => e.from)
    }

    /** Find all direct dependencies (what does this node call?) */
    getDependencies(nodeId: string): string[] {
        return (this.graph.outEdges.get(nodeId) ?? [])
            .filter(e => e.type !== 'contains')
            .map(e => e.to)
    }

    /**
     * Find the shortest path between two nodes using BFS.
     * Returns an ordered array of node IDs, or null if no path exists.
     */
    findPath(start: string, end: string): string[] | null {
        if (!this.graph.nodes.has(start) || !this.graph.nodes.has(end)) return null
        if (start === end) return [start]

        const visited = new Set<string>([start])
        // Each entry: [nodeId, pathSoFar]
        const queue: Array<[string, string[]]> = [[start, [start]]]
        let head = 0

        while (head < queue.length) {
            const [id, path] = queue[head++]

            for (const edge of this.graph.outEdges.get(id) ?? []) {
                if (edge.type === 'contains') continue
                if (edge.to === end) return [...path, end]
                if (!visited.has(edge.to)) {
                    visited.add(edge.to)
                    queue.push([edge.to, [...path, edge.to]])
                }
            }
        }

        return null
    }

    /**
     * Get the full downstream (transitive dependents) of a node.
     * Answers "What would break if I change X?"
     */
    getDownstreamImpact(nodeId: string): string[] {
        const visited = new Set<string>()
        const queue: string[] = [nodeId]
        let head = 0

        while (head < queue.length) {
            const current = queue[head++]
            for (const dep of this.getDependents(current)) {
                if (!visited.has(dep) && dep !== nodeId) {
                    visited.add(dep)
                    queue.push(dep)
                }
            }
        }

        return [...visited]
    }
}
