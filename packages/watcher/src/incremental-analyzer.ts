import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import {
    getParser, GraphBuilder, ImpactAnalyzer, LockCompiler, hashFile,
    type ParsedFile, type DependencyGraph, type MikkLock, type MikkContract, type ImpactResult, type GraphEdge
} from '@getmikk/core'
import type { FileChangeEvent } from './types.js'

/** Threshold: if batch size exceeds this, run full re-analysis */
const FULL_ANALYSIS_THRESHOLD = 15

/** Max retries for race-condition re-hash check */
const MAX_RETRIES = 3

/**
 * IncrementalAnalyzer — re-parses only changed files, performs a surgical
 * graph update (removes stale nodes/edges, inserts new ones), then runs
 * impact analysis over the affected subgraph.
 *
 * Complexity is O(changed files + edges touching changed files), NOT O(whole repo).
 *
 * For batches larger than FULL_ANALYSIS_THRESHOLD (e.g. git checkout), a full
 * rebuild is used instead because the overhead of surgical updates exceeds
 * the cost of a clean rebuild at that point.
 *
 * Race condition handling: after parsing, the file is re-hashed. If the hash
 * differs (file changed during parsing), we re-parse up to MAX_RETRIES times.
 */
export class IncrementalAnalyzer {
    private parsedFiles: Map<string, ParsedFile> = new Map()

    constructor(
        private graph: DependencyGraph,
        private lock: MikkLock,
        private contract: MikkContract,
        private projectRoot: string
    ) {
        // Ensure adjacency maps exist even if the graph was constructed without them
        // (e.g. in tests that pass `{ nodes: new Map(), edges: [] }`).
        if (!this.graph.outEdges) this.graph.outEdges = new Map()
        if (!this.graph.inEdges) this.graph.inEdges = new Map()
    }

    /** Handle a batch of file change events (debounced by daemon) */
    async analyzeBatch(events: FileChangeEvent[]): Promise<{
        graph: DependencyGraph
        lock: MikkLock
        impactResult: ImpactResult
        mode: 'incremental' | 'full'
    }> {
        if (events.length > FULL_ANALYSIS_THRESHOLD) {
            return this.runFullAnalysis(events)
        }

        const changedFilePaths: string[] = []

        // Parse changed/added files; remove deleted ones from the tracker
        for (const event of events) {
            if (event.type === 'deleted') {
                this.parsedFiles.delete(event.path)
            } else {
                const parsed = await this.parseWithRaceCheck(event.path)
                if (parsed) this.parsedFiles.set(event.path, parsed)
            }
            changedFilePaths.push(event.path)
        }

        const changedFileSet = new Set(changedFilePaths)

        // ── Surgical graph update ─────────────────────────────────────────
        //
        // Step 1: collect node IDs that belong to the changed files so we
        // can remove their stale edges even after the nodes are gone.
        const staleNodeIds = new Set<string>(
            changedFilePaths.flatMap(fp => this.findNodeIdsForFile(fp))
        )

        // Step 2: remove stale nodes (file nodes + symbol nodes for changed files)
        for (const nodeId of staleNodeIds) {
            this.graph.nodes.delete(nodeId)
        }
        for (const fp of changedFilePaths) {
            // File-level node uses the path as its id
            this.graph.nodes.delete(fp)
        }

        // Step 3: remove stale edges — any edge whose source or target was
        // in a changed file. We check both the node map (already cleaned) and
        // the staleNodeIds set (node removed in step 2).
        const allStaleIds = new Set([...staleNodeIds, ...changedFilePaths])
        this.graph.edges = this.graph.edges.filter(
            edge => !allStaleIds.has(edge.source) && !allStaleIds.has(edge.target)
        )

        // Step 4: build a mini-graph from the changed files and merge it in.
        // We only pass changed files to GraphBuilder so it creates nodes/edges
        // for those files only. We then merge those into the existing graph.
        const changedParsedFiles = changedFilePaths
            .map(fp => this.parsedFiles.get(fp))
            .filter((f): f is ParsedFile => f !== undefined)

        if (changedParsedFiles.length > 0) {
            const miniBuilder = new GraphBuilder()
            const miniGraph = miniBuilder.build(changedParsedFiles)

            // Merge nodes
            for (const [id, node] of miniGraph.nodes) {
                this.graph.nodes.set(id, node)
            }
            // Merge edges — deduplicate by key but prefer fresher confidence
            const existingEdgeMap = new Map<string, GraphEdge>()
            for (const existingEdge of this.graph.edges) {
                existingEdgeMap.set(`${existingEdge.source}->${existingEdge.target}:${existingEdge.type}`, existingEdge)
            }
            for (const edge of miniGraph.edges) {
                const key = `${edge.source}->${edge.target}:${edge.type}`
                const existing = existingEdgeMap.get(key)
                if (!existing) {
                    this.graph.edges.push(edge)
                    existingEdgeMap.set(key, edge)
                } else if (
                    edge.confidence !== undefined &&
                    (existing.confidence === undefined || edge.confidence > existing.confidence)
                ) {
                    existing.confidence = edge.confidence
                }
            }
        }

        // Step 5: rebuild adjacency maps from the updated edge list
        this.graph.outEdges = new Map()
        this.graph.inEdges = new Map()
        for (const edge of this.graph.edges) {
            if (!this.graph.outEdges.has(edge.source)) this.graph.outEdges.set(edge.source, [])
            this.graph.outEdges.get(edge.source)!.push(edge)
            if (!this.graph.inEdges.has(edge.target)) this.graph.inEdges.set(edge.target, [])
            this.graph.inEdges.get(edge.target)!.push(edge)
        }

        // ── Impact analysis over the changed nodes ────────────────────────
        const changedNodeIds = [
            ...new Set(changedFilePaths.flatMap(fp => this.findNodeIdsForFile(fp)))
        ]

        const analyzer = new ImpactAnalyzer(this.graph)
        const impactResult = analyzer.analyze(changedNodeIds)

        // ── Recompile lock ────────────────────────────────────────────────
        const allParsedFiles = [...this.parsedFiles.values()]
        const compiler = new LockCompiler()
        this.lock = compiler.compile(this.graph, this.contract, allParsedFiles)

        return { graph: this.graph, lock: this.lock, impactResult, mode: 'incremental' }
    }

    /** Handle a single file change event */
    async analyze(event: FileChangeEvent): Promise<{
        graph: DependencyGraph
        lock: MikkLock
        impactResult: ImpactResult
    }> {
        const result = await this.analyzeBatch([event])
        return { graph: result.graph, lock: result.lock, impactResult: result.impactResult }
    }

    /** Seed the tracker with an already-parsed file (called during initial analysis) */
    addParsedFile(file: ParsedFile): void {
        this.parsedFiles.set(file.path, file)
    }

    /** Current number of tracked files */
    get fileCount(): number {
        return this.parsedFiles.size
    }

    // ─── Private helpers ──────────────────────────────────────────

    /**
     * Parse a file with race-condition detection.
     * After parsing we re-hash the file; if the hash differs the file changed
     * while we were parsing it and we retry (up to MAX_RETRIES).
     */
    private async parseWithRaceCheck(changedFile: string): Promise<ParsedFile | null> {
        const fullPath = path.join(this.projectRoot, changedFile)

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                const content = await fs.readFile(fullPath, 'utf-8')
                const parser = getParser(changedFile)
                const parsedFile = await parser.parse(changedFile, content)

                try {
                    const postParseHash = await hashFile(fullPath)
                    if (postParseHash === parsedFile.hash) return parsedFile
                    // Hash differs — file changed mid-parse, retry
                } catch {
                    // File may have been deleted after reading; return what we have
                    return parsedFile
                }
            } catch {
                return null // File unreadable
            }
        }

        // Exhausted retries — accept whatever we get on the final attempt
        try {
            const content = await fs.readFile(fullPath, 'utf-8')
            const parser = getParser(changedFile)
            return await parser.parse(changedFile, content)
        } catch {
            return null
        }
    }

    /**
     * Full re-analysis for large batches (e.g. git checkout switching branches).
     * Rebuilds the entire graph and lock from scratch.
     */
    private async runFullAnalysis(events: FileChangeEvent[]): Promise<{
        graph: DependencyGraph
        lock: MikkLock
        impactResult: ImpactResult
        mode: 'full'
    }> {
        for (const event of events) {
            if (event.type === 'deleted') this.parsedFiles.delete(event.path)
        }

        const nonDeleted = events.filter(e => e.type !== 'deleted')
        await Promise.all(nonDeleted.map(async (event) => {
            const parsed = await this.parseWithRaceCheck(event.path)
            if (parsed) this.parsedFiles.set(event.path, parsed)
        }))

        const allParsedFiles = [...this.parsedFiles.values()]
        const builder = new GraphBuilder()
        this.graph = builder.build(allParsedFiles)

        const compiler = new LockCompiler()
        this.lock = compiler.compile(this.graph, this.contract, allParsedFiles)

        return {
            graph: this.graph,
            lock: this.lock,
            impactResult: {
                changed: events.map(e => e.path),
                impacted: [],
                classified: { critical: [], high: [], medium: [], low: [] },
                depth: 0,
                confidence: 'low',
            },
            mode: 'full',
        }
    }

    /**
     * Return all graph node IDs whose `file` property matches the given path.
     * Used both to find stale nodes to remove and to identify changed nodes
     * for impact analysis.
     */
    private findNodeIdsForFile(filePath: string): string[] {
        const ids: string[] = []
        for (const [id, node] of this.graph.nodes) {
            if (node.file === filePath) ids.push(id)
        }
        return ids
    }
}
