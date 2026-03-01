import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import {
    getParser, GraphBuilder, ImpactAnalyzer, LockCompiler, hashFile,
    type ParsedFile, type DependencyGraph, type MikkLock, type MikkContract, type ImpactResult
} from '@ansh-dhanani/core'
import type { FileChangeEvent } from './types.js'

/** Threshold: if batch size exceeds this, run full re-analysis */
const FULL_ANALYSIS_THRESHOLD = 15

/** Max retries for race-condition re-hash check */
const MAX_RETRIES = 3

/**
 * IncrementalAnalyzer — re-parses only changed files, updates graph nodes,
 * and recomputes affected module hashes. O(changed files) not O(whole repo).
 *
 * Supports batch analysis: if > 15 files change at once (e.g. git checkout),
 * runs a full re-analysis instead of incremental.
 *
 * Race condition handling: after parsing, re-hashes the file and re-parses
 * if the content changed during parsing (up to 3 retries).
 */
export class IncrementalAnalyzer {
    private parsedFiles: Map<string, ParsedFile> = new Map()

    constructor(
        private graph: DependencyGraph,
        private lock: MikkLock,
        private contract: MikkContract,
        private projectRoot: string
    ) { }

    /** Handle a batch of file change events (debounced by daemon) */
    async analyzeBatch(events: FileChangeEvent[]): Promise<{
        graph: DependencyGraph
        lock: MikkLock
        impactResult: ImpactResult
        mode: 'incremental' | 'full'
    }> {
        // If too many changes at once, run full analysis
        if (events.length > FULL_ANALYSIS_THRESHOLD) {
            return this.runFullAnalysis(events)
        }

        // Incremental: process each event
        let combinedChanged: string[] = []
        let combinedImpacted: string[] = []

        for (const event of events) {
            if (event.type === 'deleted') {
                this.parsedFiles.delete(event.path)
                combinedChanged.push(event.path)
            } else {
                const parsed = await this.parseWithRaceCheck(event.path)
                if (parsed) {
                    this.parsedFiles.set(event.path, parsed)
                }
                combinedChanged.push(...this.findAffectedNodes(event.path))
            }
        }

        // Rebuild graph from all parsed files
        const allParsedFiles = [...this.parsedFiles.values()]
        const builder = new GraphBuilder()
        this.graph = builder.build(allParsedFiles)

        // Run impact analysis on all changed nodes
        const analyzer = new ImpactAnalyzer(this.graph)
        const impactResult = analyzer.analyze([...new Set(combinedChanged)])

        // Recompile lock
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

    /** Add a parsed file to the tracker */
    addParsedFile(file: ParsedFile): void {
        this.parsedFiles.set(file.path, file)
    }

    /** Get the current parsed file count */
    get fileCount(): number {
        return this.parsedFiles.size
    }

    // ─── Private ──────────────────────────────────────────────────

    /**
     * Parse a file with race-condition detection.
     * After parsing, re-hash the file. If the hash differs from what we started with,
     * the file changed during parsing — re-parse (up to MAX_RETRIES).
     */
    private async parseWithRaceCheck(changedFile: string): Promise<ParsedFile | null> {
        const fullPath = path.join(this.projectRoot, changedFile)

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                const content = await fs.readFile(fullPath, 'utf-8')
                const parser = getParser(changedFile)
                const parsedFile = parser.parse(changedFile, content)

                // Race condition check: re-hash after parse
                try {
                    const postParseHash = await hashFile(fullPath)
                    if (postParseHash === parsedFile.hash) {
                        return parsedFile // Content stable
                    }
                    // Content changed during parse — retry
                } catch {
                    return parsedFile // File may have been deleted, return what we have
                }
            } catch {
                return null // File unreadable
            }
        }

        // Exhausted retries — parse one final time and accept
        try {
            const content = await fs.readFile(fullPath, 'utf-8')
            const parser = getParser(changedFile)
            return parser.parse(changedFile, content)
        } catch {
            return null
        }
    }

    /** Run a full re-analysis (for large batches like git checkout) */
    private async runFullAnalysis(events: FileChangeEvent[]): Promise<{
        graph: DependencyGraph
        lock: MikkLock
        impactResult: ImpactResult
        mode: 'full'
    }> {
        // Remove deleted files
        for (const event of events) {
            if (event.type === 'deleted') {
                this.parsedFiles.delete(event.path)
            }
        }

        // Re-parse all non-deleted changed files
        const nonDeleted = events.filter(e => e.type !== 'deleted')
        await Promise.all(nonDeleted.map(async (event) => {
            const parsed = await this.parseWithRaceCheck(event.path)
            if (parsed) {
                this.parsedFiles.set(event.path, parsed)
            }
        }))

        // Full rebuild
        const allParsedFiles = [...this.parsedFiles.values()]
        const builder = new GraphBuilder()
        this.graph = builder.build(allParsedFiles)

        const compiler = new LockCompiler()
        this.lock = compiler.compile(this.graph, this.contract, allParsedFiles)

        const changedPaths = events.map(e => e.path)

        return {
            graph: this.graph,
            lock: this.lock,
            impactResult: {
                changed: changedPaths,
                impacted: [],
                depth: 0,
                confidence: 'low', // Full rebuild = can't determine precise impact
            },
            mode: 'full',
        }
    }

    private findAffectedNodes(filePath: string): string[] {
        return [...this.graph.nodes.values()]
            .filter(n => n.file === filePath)
            .map(n => n.id)
    }
}
