import type { DependencyGraph } from './types.js'
import type { MikkLock } from '../contract/schema.js'
import type { DeadCodeResult, DeadCodeEntry } from './dead-code-detector.js'

export type { DeadCodeResult, DeadCodeEntry }

/**
 * ScopeAnalyzer — given a task description and a set of anchor functions/files,
 * returns the MINIMAL set of files an agent must touch to accomplish the task,
 * plus the functions it will need to read for context.
 *
 * This is the missing counterpart to ImpactAnalyzer. Where impact asks
 * "what breaks if I change X?", scope asks "what do I need to change to do Y?"
 *
 * Algorithm:
 *   1. Score all functions by relevance to the task query (keyword overlap).
 *   2. BFS forward from top-K anchors through outEdges (calls) to find
 *      the reachable implementation surface.
 *   3. Cluster by file — each file gets a relevance score = max(fn scores).
 *   4. Return the minimal file set that covers the top-scoring functions,
 *      plus read-only context files they depend on.
 */
export class ScopeAnalyzer {
    constructor(
        private graph: DependencyGraph,
        private lock: MikkLock,
    ) {}

    analyze(query: string, maxFiles = 8, maxHops = 3): ScopeResult {
        const tokens = tokenize(query)
        if (tokens.length === 0) return empty()

        // Score every function by keyword overlap with query
        const scored: Array<{ id: string; score: number }> = []
        for (const [id, fn] of Object.entries(this.lock.functions)) {
            const score = this.scoreFunction(fn, tokens)
            if (score > 0) scored.push({ id, score })
        }
        scored.sort((a, b) => b.score - a.score)

        const anchors = scored.slice(0, 5).map(s => s.id)
        if (anchors.length === 0) return empty()

        // BFS forward from anchors to find implementation surface
        const visited = new Set<string>()
        const fileScores = new Map<string, number>()
        const fnScores = new Map<string, number>()

        const queue: Array<{ id: string; hop: number }> = anchors.map(id => ({ id, hop: 0 }))
        let head = 0

        // Seed file scores from anchor scores
        for (const { id, score } of scored.slice(0, 5)) {
            fnScores.set(id, score)
            const fn = this.lock.functions[id]
            if (fn) {
                const cur = fileScores.get(fn.file) ?? 0
                fileScores.set(fn.file, Math.max(cur, score))
            }
        }

        while (head < queue.length) {
            const { id, hop } = queue[head++]
            if (visited.has(id) || hop > maxHops) continue
            visited.add(id)

            const fn = this.lock.functions[id]
            if (!fn) continue

            const decayed = (fnScores.get(id) ?? 1) * Math.pow(0.6, hop)
            const cur = fileScores.get(fn.file) ?? 0
            fileScores.set(fn.file, Math.max(cur, decayed))

            for (const edge of this.graph.outEdges.get(id) ?? []) {
                if (edge.type === 'calls' && !visited.has(edge.to)) {
                    fnScores.set(edge.to, (fnScores.get(edge.to) ?? 0) + decayed * edge.confidence)
                    queue.push({ id: edge.to, hop: hop + 1 })
                }
            }
        }

        // Sort files by score, take top maxFiles
        const rankedFiles = [...fileScores.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, maxFiles)

        const editFiles = rankedFiles.slice(0, Math.ceil(rankedFiles.length * 0.6))
        const readFiles = rankedFiles.slice(editFiles.length)

        // Collect the top functions per edit file for context
        const functionsByFile: Record<string, string[]> = {}
        for (const [file] of editFiles) {
            const fns = Object.values(this.lock.functions)
                .filter(fn => fn.file === file)
                .sort((a, b) => (fnScores.get(b.id) ?? 0) - (fnScores.get(a.id) ?? 0))
                .slice(0, 6)
                .map(fn => fn.name)
            functionsByFile[file] = fns
        }

        return {
            query,
            editFiles: editFiles.map(([file, score]) => ({
                file,
                score: Math.round(score * 100) / 100,
                functions: functionsByFile[file] ?? [],
            })),
            readFiles: readFiles.map(([file, score]) => ({
                file,
                score: Math.round(score * 100) / 100,
                functions: [],
            })),
            anchorFunctions: anchors.map(id => this.lock.functions[id]?.name ?? id),
            totalFilesConsidered: fileScores.size,
            hint: `Edit ${editFiles.length} file(s), read ${readFiles.length} for context. Start with editFiles[0].`,
        }
    }

    private scoreFunction(fn: MikkLock['functions'][string], tokens: string[]): number {
        const text = [
            fn.name,
            fn.purpose ?? '',
            fn.file,
            fn.moduleId,
            ...(fn.edgeCasesHandled ?? []),
        ].join(' ').toLowerCase()

        let score = 0
        for (const tok of tokens) {
            if (fn.name.toLowerCase().includes(tok)) score += 3   // name match weighs more
            else if (text.includes(tok)) score += 1
        }
        return score
    }
}

export interface ScopeFile {
    file: string
    score: number
    functions: string[]
}

export interface ScopeResult {
    query: string
    editFiles: ScopeFile[]
    readFiles: ScopeFile[]
    anchorFunctions: string[]
    totalFilesConsidered: number
    hint: string
}

function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .split(/[\s\-_./\\:]+/)
        .filter(t => t.length > 2 && !STOP_WORDS.has(t))
}

const STOP_WORDS = new Set([
    'the','and','for','are','but','not','you','all','can','had','her','was','one',
    'our','out','day','get','has','him','his','how','its','let','put','say','she',
    'too','use','with','that','this','from','have','they','will','been','more',
    'also','into','than','then','when','what','make','like','just','some','over',
])

function empty(): ScopeResult {
    return {
        query: '',
        editFiles: [],
        readFiles: [],
        anchorFunctions: [],
        totalFilesConsidered: 0,
        hint: 'No matching functions found. Run mikk analyze first, or broaden your query.',
    }
}
