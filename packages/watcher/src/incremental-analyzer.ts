import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import {
    LanguageRegistry, GraphBuilder, ImpactAnalyzer, LockCompiler, hashFile,
    type ParsedFile, type DependencyGraph, type MikkLock, type MikkContract, type ImpactResult
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
 */
export class IncrementalAnalyzer {
    private parsedFiles: Map<string, ParsedFile> = new Map()

    constructor(
        private graph: DependencyGraph,
        private lock: MikkLock,
        private contract: MikkContract,
        private projectRoot: string
    ) {
        if (!this.graph.outEdges) this.graph.outEdges = new Map()
        if (!this.graph.inEdges) this.graph.inEdges = new Map()
    }

    public get fileCount(): number {
        return this.parsedFiles.size
    }

    /** Handle a batch of file change events */
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

        for (const event of events) {
            if (event.type === 'deleted') {
                this.parsedFiles.delete(event.path)
            } else {
                const parsed = await this.parseWithRaceCheck(event.path)
                if (parsed) this.parsedFiles.set(event.path, parsed)
            }
            changedFilePaths.push(event.path)
        }

        // --- Surgical graph update ---
        const staleNodeIds = new Set<string>(
            changedFilePaths.flatMap(fp => this.findNodeIdsForFile(fp))
        )

        for (const nodeId of staleNodeIds) {
            this.graph.nodes.delete(nodeId)
        }
        for (const fp of changedFilePaths) {
            this.graph.nodes.delete(fp)
        }

        const allStaleIds = new Set([...staleNodeIds, ...changedFilePaths])
        this.graph.edges = this.graph.edges.filter(
            edge => !allStaleIds.has(edge.from) && !allStaleIds.has(edge.to)
        )

        const changedParsedFiles = changedFilePaths
            .map(fp => this.parsedFiles.get(fp))
            .filter((f): f is ParsedFile => f !== undefined)

        if (changedParsedFiles.length > 0) {
            const miniBuilder = new GraphBuilder()
            const miniGraph = miniBuilder.build(changedParsedFiles)

            for (const [id, node] of miniGraph.nodes) {
                this.graph.nodes.set(id, node)
            }
            
            for (const edge of miniGraph.edges) {
                 this.graph.edges.push(edge)
            }
        }

        // Rebuild adjacency maps
        this.graph.outEdges = new Map()
        this.graph.inEdges = new Map()
        for (const edge of this.graph.edges) {
            if (!this.graph.outEdges.has(edge.from)) this.graph.outEdges.set(edge.from, [])
            this.graph.outEdges.get(edge.from)!.push(edge)
            if (!this.graph.inEdges.has(edge.to)) this.graph.inEdges.set(edge.to, [])
            this.graph.inEdges.get(edge.to)!.push(edge)
        }

        const changedNodeIds = [
            ...new Set(changedFilePaths.flatMap(fp => this.findNodeIdsForFile(fp)))
        ]

        const analyzer = new ImpactAnalyzer(this.graph)
        const impactResult = analyzer.analyze(changedNodeIds)

        const allParsedFiles = [...this.parsedFiles.values()]
        const compiler = new LockCompiler()
        this.lock = await compiler.compile(this.graph, this.contract, allParsedFiles, undefined, this.projectRoot)

        return { graph: this.graph, lock: this.lock, impactResult, mode: 'incremental' }
    }

    async analyze(event: FileChangeEvent): Promise<{
        graph: DependencyGraph
        lock: MikkLock
        impactResult: ImpactResult
    }> {
        const result = await this.analyzeBatch([event])
        return { graph: result.graph, lock: result.lock, impactResult: result.impactResult }
    }

    addParsedFile(file: ParsedFile): void {
        this.parsedFiles.set(file.path, file)
    }

    private async parseWithRaceCheck(changedFile: string): Promise<ParsedFile | null> {
        const fullPath = path.join(this.projectRoot, changedFile)
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                const content = await fs.readFile(fullPath, 'utf-8')
                const langDef = LanguageRegistry.getInstance().getForFile(changedFile)
                if (!langDef) return null
                
                const parsedFile = await langDef.extractor.extract(changedFile, content)

                try {
                    const postParseHash = await hashFile(fullPath)
                    if (postParseHash === parsedFile.hash) return parsedFile
                } catch {
                    return parsedFile
                }
            } catch {
                return null
            }
        }
        return null
    }

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
        this.lock = await compiler.compile(this.graph, this.contract, allParsedFiles, undefined, this.projectRoot)

        const impactResult: ImpactResult = {
            changed: events.map(e => e.path),
            impacted: [],
            allImpacted: [],
            depth: 0,
            entryPoints: [],
            criticalModules: [],
            paths: [],
            confidence: 1.0,
            riskScore: 0,
            classified: { critical: [], high: [], medium: [], low: [] }
        }

        return { graph: this.graph, lock: this.lock, impactResult, mode: 'full' }
    }

    private findNodeIdsForFile(filePath: string): string[] {
        const ids: string[] = []
        for (const [id, node] of this.graph.nodes) {
            if (node.file === filePath) ids.push(id)
        }
        return ids
    }
}
