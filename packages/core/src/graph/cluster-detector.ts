import * as path from 'node:path'
import type { DependencyGraph, ModuleCluster, GraphNode } from './types.js'

/**
 * ClusterDetector — analyzes the dependency graph and groups files
 * into natural module clusters using greedy agglomeration with coupling scores.
 *
 * Algorithm (Section 4 of Mikk Technical Reference):
 * 1. Build a coupling matrix: coupling(A,B) = (edges between A,B) / (total edges of A + total edges of B)
 * 2. Sort files by total edge count (most connected first)
 * 3. Greedy agglomeration: seed clusters from most connected files,
 *    expand by pulling in strongly-coupled neighbors
 * 4. Orphan files go to single-file clusters with low confidence
 */
export class ClusterDetector {
    constructor(
        private graph: DependencyGraph,
        private minClusterSize: number = 2,
        private minCouplingScore: number = 0.15
    ) { }

    /** Returns groups of files that naturally belong together, sorted by confidence */
    detect(): ModuleCluster[] {
        const fileNodes = [...this.graph.nodes.values()].filter(n => n.type === 'file')
        if (fileNodes.length === 0) return []

        const files = fileNodes.map(n => n.id)
        const couplingMatrix = this.computeCouplingMatrix(files)
        const assigned = new Set<string>()
        const clusters: ModuleCluster[] = []

        // Sort files by total edge count (most connected first)
        const sortedFiles = [...files].sort((a, b) =>
            this.getTotalEdges(b) - this.getTotalEdges(a)
        )

        for (const seedFile of sortedFiles) {
            if (assigned.has(seedFile)) continue

            // Start a new cluster with this file as seed
            const cluster: string[] = [seedFile]
            assigned.add(seedFile)

            // Expand: find files strongly coupled to any file in this cluster
            let expanded = true
            while (expanded) {
                expanded = false

                for (const clusterFile of [...cluster]) {
                    const partners = couplingMatrix.get(clusterFile) || new Map()

                    for (const [candidate, score] of partners) {
                        if (assigned.has(candidate)) continue
                        if (score < this.minCouplingScore) continue

                        // Is this candidate more coupled to this cluster than to others?
                        const clusterAffinity = this.computeClusterAffinity(
                            candidate, cluster, couplingMatrix
                        )
                        const bestOutsideAffinity = this.computeBestOutsideAffinity(
                            candidate, cluster, couplingMatrix, assigned
                        )

                        if (clusterAffinity > bestOutsideAffinity) {
                            cluster.push(candidate)
                            assigned.add(candidate)
                            expanded = true
                        }
                    }
                }
            }

            if (cluster.length >= this.minClusterSize) {
                const filePathsForCluster = cluster.map(id => this.getNodeFile(id))
                clusters.push({
                    id: this.inferClusterId(filePathsForCluster),
                    files: filePathsForCluster,
                    confidence: this.computeClusterConfidence(cluster),
                    suggestedName: this.inferClusterName(filePathsForCluster),
                    functions: this.getFunctionIdsForFiles(cluster),
                })
            }
        }

        // Orphan files get their own single-file clusters
        for (const file of files) {
            if (!assigned.has(file)) {
                const filePath = this.getNodeFile(file)
                clusters.push({
                    id: this.inferClusterId([filePath]),
                    files: [filePath],
                    confidence: 0.3,
                    suggestedName: this.inferClusterName([filePath]),
                    functions: this.getFunctionIdsForFiles([file]),
                })
            }
        }

        return clusters.sort((a, b) => b.confidence - a.confidence)
    }

    // ─── Coupling Matrix ──────────────────────────────────────────

    /**
     * Build coupling matrix: for every pair of files, compute
     * coupling(A,B) = (edges between A,B * 2) / (totalEdges(A) + totalEdges(B))
     */
    private computeCouplingMatrix(files: string[]): Map<string, Map<string, number>> {
        const matrix = new Map<string, Map<string, number>>()
        const fileEdgeCounts = new Map<string, number>()
        const pairCounts = new Map<string, number>()

        // Count total edges per file
        for (const fileId of files) {
            const outCount = (this.graph.outEdges.get(fileId) || []).length
            const inCount = (this.graph.inEdges.get(fileId) || []).length
            fileEdgeCounts.set(fileId, outCount + inCount)
        }

        const fileSet = new Set(files)

        // Count edges between each pair of files (file-level imports + function-level calls)
        for (const edge of this.graph.edges) {
            if (edge.type !== 'imports' && edge.type !== 'calls') continue

            const sourceFile = this.getFileForNode(edge.source)
            const targetFile = this.getFileForNode(edge.target)

            if (!sourceFile || !targetFile || sourceFile === targetFile) continue
            if (!fileSet.has(sourceFile) || !fileSet.has(targetFile)) continue

            // Increment pair count for both directions
            this.incrementPair(matrix, sourceFile, targetFile)
            this.incrementPair(matrix, targetFile, sourceFile)
        }

        // Normalize to coupling scores
        for (const [file, partners] of matrix) {
            const totalEdges = fileEdgeCounts.get(file) || 1
            for (const [partner, edgeCount] of partners) {
                const partnerEdges = fileEdgeCounts.get(partner) || 1
                const score = (edgeCount * 2) / (totalEdges + partnerEdges)
                partners.set(partner, score)
            }
        }

        return matrix
    }

    private incrementPair(matrix: Map<string, Map<string, number>>, a: string, b: string): void {
        if (!matrix.has(a)) matrix.set(a, new Map())
        const partners = matrix.get(a)!
        partners.set(b, (partners.get(b) || 0) + 1)
    }

    // ─── Affinity Computation ─────────────────────────────────────

    /** Average coupling score of a candidate to all files in the cluster */
    private computeClusterAffinity(
        candidate: string,
        cluster: string[],
        couplingMatrix: Map<string, Map<string, number>>
    ): number {
        const partners = couplingMatrix.get(candidate) || new Map()
        let totalScore = 0
        let count = 0
        for (const clusterFile of cluster) {
            const score = partners.get(clusterFile) || 0
            totalScore += score
            count++
        }
        return count > 0 ? totalScore / count : 0
    }

    /** Best coupling score of a candidate to any file NOT in the cluster and not yet assigned */
    private computeBestOutsideAffinity(
        candidate: string,
        cluster: string[],
        couplingMatrix: Map<string, Map<string, number>>,
        assigned: Set<string>
    ): number {
        const partners = couplingMatrix.get(candidate) || new Map()
        const clusterSet = new Set(cluster)
        let best = 0
        for (const [partner, score] of partners) {
            if (clusterSet.has(partner) || assigned.has(partner)) continue
            if (score > best) best = score
        }
        return best
    }

    // ─── Confidence ───────────────────────────────────────────────

    /**
     * Confidence = (internal edges) / (internal edges + external edges)
     * Score of 1.0 = perfectly self-contained
     * Score of 0.0 = all edges go outside
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
        if (total === 0) return 0.5
        return internalEdges / total
    }

    // ─── Helpers ──────────────────────────────────────────────────

    /** Total edges (in + out) for a node */
    private getTotalEdges(nodeId: string): number {
        return (this.graph.outEdges.get(nodeId) || []).length +
            (this.graph.inEdges.get(nodeId) || []).length
    }

    /** Get the file path a node belongs to (for function/class nodes, return their file) */
    private getFileForNode(nodeId: string): string | null {
        const node = this.graph.nodes.get(nodeId)
        if (!node) return null
        if (node.type === 'file') return nodeId
        // For function/class/generic nodes, find their parent file
        return node.file || null
    }

    /** Get the file path from a file node ID (the node's .file property) */
    private getNodeFile(fileNodeId: string): string {
        const node = this.graph.nodes.get(fileNodeId)
        return node?.file || fileNodeId
    }

    /** Get all function IDs contained in a set of file node IDs */
    private getFunctionIdsForFiles(fileNodeIds: string[]): string[] {
        return fileNodeIds.flatMap(f => {
            const containEdges = this.graph.outEdges.get(f) || []
            return containEdges
                .filter(e => e.type === 'contains')
                .map(e => e.target)
        })
    }

    /** Infer a module ID from file paths (common directory prefix) */
    private inferClusterId(filePaths: string[]): string {
        if (filePaths.length === 0) return 'unknown'
        if (filePaths.length === 1) {
            return this.getDirSegment(filePaths[0])
        }
        // Find the longest common directory prefix
        const segments = filePaths.map(f => f.split('/'))
        const firstSegments = segments[0]
        let commonLen = 0
        for (let i = 0; i < firstSegments.length - 1; i++) {
            if (segments.every(s => s[i] === firstSegments[i])) {
                commonLen = i + 1
            } else {
                break
            }
        }
        const commonPath = firstSegments.slice(0, commonLen).join('/')
        return this.getDirSegment(commonPath || filePaths[0])
    }

    /** Get the most meaningful directory segment from a path */
    private getDirSegment(filePath: string): string {
        const parts = filePath.split('/')
        // Skip 'src' if present
        if (parts[0] === 'src' && parts.length >= 2) return parts[1]
        if (parts.length > 1) return parts[0]
        return path.basename(filePath, path.extname(filePath))
    }

    /** Infer a human-readable cluster name */
    private inferClusterName(filePaths: string[]): string {
        const dir = this.inferClusterId(filePaths)
        return dir
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase())
    }
}
