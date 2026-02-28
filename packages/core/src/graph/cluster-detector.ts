import * as path from 'node:path'
import type { DependencyGraph, ModuleCluster } from './types.js'

/**
 * ClusterDetector — analyzes the dependency graph and groups files
 * into natural module clusters based on coupling metrics.
 */
export class ClusterDetector {
    constructor(private graph: DependencyGraph) { }

    /** Returns groups of files that naturally belong together, sorted by confidence */
    detect(): ModuleCluster[] {
        // Get all file nodes
        const fileNodes = [...this.graph.nodes.values()].filter(n => n.type === 'file')
        if (fileNodes.length === 0) return []

        // Group files by their top-level directory
        const dirGroups = new Map<string, string[]>()
        for (const node of fileNodes) {
            const parts = node.file.split('/')
            // Use the first meaningful directory (skip 'src/' if present)
            let dir = parts.length > 1 ? parts[0] : '.'
            if (dir === 'src' && parts.length > 2) {
                dir = parts[1]
            }
            if (!dirGroups.has(dir)) dirGroups.set(dir, [])
            dirGroups.get(dir)!.push(node.file)
        }

        // Build clusters from directory groups
        const clusters: ModuleCluster[] = []
        for (const [dir, files] of dirGroups) {
            const confidence = this.computeClusterConfidence(files)
            const functionIds = files.flatMap(f => {
                const containEdges = this.graph.outEdges.get(f) || []
                return containEdges
                    .filter(e => e.type === 'contains')
                    .map(e => e.target)
            })

            clusters.push({
                id: dir,
                files,
                confidence,
                suggestedName: this.inferName(dir),
                functions: functionIds,
            })
        }

        return clusters.sort((a, b) => b.confidence - a.confidence)
    }

    /**
     * Confidence = (internal edges) / (internal edges + external edges)
     * Score of 1.0 = perfectly self-contained
     * Score of 0.1 = heavily coupled to the outside
     */
    computeClusterConfidence(files: string[]): number {
        const fileSet = new Set(files)
        let internalEdges = 0
        let externalEdges = 0

        for (const file of files) {
            const outEdges = this.graph.outEdges.get(file) || []
            for (const edge of outEdges) {
                if (edge.type === 'imports') {
                    if (fileSet.has(edge.target)) {
                        internalEdges++
                    } else {
                        externalEdges++
                    }
                }
            }
        }

        // Also count function-level call edges
        for (const file of files) {
            const containEdges = this.graph.outEdges.get(file) || []
            for (const containEdge of containEdges) {
                if (containEdge.type === 'contains') {
                    const fnOutEdges = this.graph.outEdges.get(containEdge.target) || []
                    for (const callEdge of fnOutEdges) {
                        if (callEdge.type === 'calls') {
                            const targetNode = this.graph.nodes.get(callEdge.target)
                            if (targetNode && fileSet.has(targetNode.file)) {
                                internalEdges++
                            } else if (targetNode) {
                                externalEdges++
                            }
                        }
                    }
                }
            }
        }

        const total = internalEdges + externalEdges
        if (total === 0) return 0.5 // No edges = uncertain
        return internalEdges / total
    }

    /** Infer a human-readable name from a directory name */
    private inferName(dir: string): string {
        // Convert kebab-case or snake_case to Title Case
        return dir
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase())
    }
}
