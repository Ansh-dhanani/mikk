import type { MikkContract, MikkLock, MikkLockFunction } from '@ansh-dhanani/core'
import type { AIContext, ContextQuery, ContextModule, ContextFunction } from './types.js'

// ---------------------------------------------------------------------------
// Scoring weights — tune these to adjust what "relevant" means
// ---------------------------------------------------------------------------
const WEIGHT = {
    // Call-graph proximity (closer = more relevant)
    DIRECT_CALL: 1.00,   // fn directly calls or is called by focus node
    HOP_2: 0.60,   // 2 hops away
    HOP_3: 0.35,
    HOP_4: 0.15,
    // Name/keyword match
    KEYWORD_EXACT: 0.90,   // function name exactly matches a task keyword
    KEYWORD_PARTIAL: 0.45,   // function name contains a task keyword
    // Entry-point bonus — functions nothing calls deserve attention
    ENTRY_POINT: 0.20,
    // Exported function bonus
    EXPORTED: 0.10,
}

// Default token budget per context payload
const DEFAULT_TOKEN_BUDGET = 6000

/**
 * Rough token estimator: 1 token ≈ 4 chars for code/identifiers
 */
function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4)
}

// ---------------------------------------------------------------------------
// Graph traversal helpers
// ---------------------------------------------------------------------------

/**
 * BFS from a set of seed node IDs, walking BOTH upstream and downstream
 * edges up to `maxDepth` hops. Returns a Map<nodeId, depth>.
 */
function bfsNeighbors(
    seeds: string[],
    functions: Record<string, MikkLockFunction>,
    maxDepth: number
): Map<string, number> {
    const visited = new Map<string, number>()
    const queue: { id: string; depth: number }[] = seeds.map(id => ({ id, depth: 0 }))

    while (queue.length > 0) {
        const { id, depth } = queue.shift()!
        if (visited.has(id)) continue
        visited.set(id, depth)
        if (depth >= maxDepth) continue

        const fn = functions[id]
        if (!fn) continue

        // Walk downstream (what this fn calls)
        for (const callee of fn.calls) {
            if (!visited.has(callee)) {
                queue.push({ id: callee, depth: depth + 1 })
            }
        }
        // Walk upstream (what calls this fn)
        for (const caller of fn.calledBy) {
            if (!visited.has(caller)) {
                queue.push({ id: caller, depth: depth + 1 })
            }
        }
    }

    return visited
}

/**
 * Convert a depth value to a relevance score using the WEIGHT table.
 */
function depthToScore(depth: number): number {
    switch (depth) {
        case 0: return 1.0
        case 1: return WEIGHT.DIRECT_CALL
        case 2: return WEIGHT.HOP_2
        case 3: return WEIGHT.HOP_3
        default: return WEIGHT.HOP_4
    }
}

// ---------------------------------------------------------------------------
// Keyword extraction — pull meaningful tokens from the task string
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'for', 'in', 'on', 'of', 'to',
    'how', 'does', 'do', 'is', 'are', 'add', 'new', 'create', 'make',
    'update', 'fix', 'get', 'set', 'this', 'that', 'with', 'from',
    'what', 'where', 'when', 'why', 'should', 'can', 'will', 'need',
    'want', 'like', 'just', 'also', 'some', 'all', 'any', 'my', 'your',
])

function extractKeywords(task: string): string[] {
    return task
        .toLowerCase()
        .replace(/[^a-z0-9\s_-]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !STOP_WORDS.has(w))
}

/**
 * Keyword score for a function: exact match > partial match
 */
function keywordScore(fn: MikkLockFunction, keywords: string[]): number {
    if (keywords.length === 0) return 0
    const nameLower = fn.name.toLowerCase()
    const fileLower = fn.file.toLowerCase()
    let score = 0

    for (const kw of keywords) {
        if (nameLower === kw) {
            score = Math.max(score, WEIGHT.KEYWORD_EXACT)
        } else if (nameLower.includes(kw) || fileLower.includes(kw)) {
            score = Math.max(score, WEIGHT.KEYWORD_PARTIAL)
        }
    }
    return score
}

// ---------------------------------------------------------------------------
// Seed resolution — find the best starting nodes for graph traversal
// ---------------------------------------------------------------------------

/**
 * Find seed function IDs from focusFiles, focusModules, or task keywords.
 * Seeds are the "center of gravity" for the BFS walk.
 */
function resolveSeeds(
    query: ContextQuery,
    contract: MikkContract,
    lock: MikkLock
): string[] {
    const seeds = new Set<string>()

    // 1. Explicit focus files → all functions in those files
    if (query.focusFiles && query.focusFiles.length > 0) {
        for (const filePath of query.focusFiles) {
            for (const fn of Object.values(lock.functions)) {
                if (fn.file.includes(filePath) || filePath.includes(fn.file)) {
                    seeds.add(fn.id)
                }
            }
        }
    }

    // 2. Explicit focus modules → all functions in those modules
    if (query.focusModules && query.focusModules.length > 0) {
        for (const modId of query.focusModules) {
            for (const fn of Object.values(lock.functions)) {
                if (fn.moduleId === modId) seeds.add(fn.id)
            }
        }
    }

    // 3. Keyword match against function names and file paths
    if (seeds.size === 0) {
        const keywords = extractKeywords(query.task)
        for (const fn of Object.values(lock.functions)) {
            if (keywordScore(fn, keywords) >= WEIGHT.KEYWORD_PARTIAL) {
                seeds.add(fn.id)
            }
        }
    }

    // 4. Module name match against task
    if (seeds.size === 0) {
        const taskLower = query.task.toLowerCase()
        for (const mod of contract.declared.modules) {
            if (
                taskLower.includes(mod.id.toLowerCase()) ||
                taskLower.includes(mod.name.toLowerCase())
            ) {
                for (const fn of Object.values(lock.functions)) {
                    if (fn.moduleId === mod.id) seeds.add(fn.id)
                }
            }
        }
    }

    return [...seeds]
}

// ---------------------------------------------------------------------------
// Main ContextBuilder
// ---------------------------------------------------------------------------

export class ContextBuilder {
    constructor(
        private contract: MikkContract,
        private lock: MikkLock
    ) { }

    /**
     * Build AI context for a given query.
     *
     * Algorithm:
     * 1. Resolve seed nodes from focusFiles / focusModules / keyword match
     * 2. BFS outward up to maxHops, collecting proximity scores
     * 3. Add keyword scores on top
     * 4. Sort all functions by total score, descending
     * 5. Fill a token budget greedily — highest-scored functions first
     * 6. Group survivors by module, emit structured context
     */
    build(query: ContextQuery): AIContext {
        const tokenBudget = query.tokenBudget ?? DEFAULT_TOKEN_BUDGET
        const maxHops = query.maxHops ?? 4

        // ── Step 1: Resolve seeds ──────────────────────────────────────────
        const seeds = resolveSeeds(query, this.contract, this.lock)

        // ── Step 2: BFS proximity scores ──────────────────────────────────
        const proximityMap = seeds.length > 0
            ? bfsNeighbors(seeds, this.lock.functions, maxHops)
            : new Map<string, number>()

        // ── Step 3: Score every function ──────────────────────────────────
        const keywords = extractKeywords(query.task)
        const allFunctions = Object.values(this.lock.functions)

        const scored: { fn: MikkLockFunction; score: number }[] = allFunctions.map(fn => {
            let score = 0

            // Proximity from BFS
            const depth = proximityMap.get(fn.id)
            if (depth !== undefined) {
                score += depthToScore(depth)
            }

            // Keyword match
            score += keywordScore(fn, keywords)

            // Entry-point bonus
            if (fn.calledBy.length === 0) score += WEIGHT.ENTRY_POINT

            return { fn, score }
        })

        // ── Step 4: Sort by score descending ──────────────────────────────
        scored.sort((a, b) => b.score - a.score)

        // ── Step 5: Fill token budget ──────────────────────────────────────
        const selected: MikkLockFunction[] = []
        let usedTokens = 0

        for (const { fn, score } of scored) {
            if (score <= 0 && seeds.length > 0) break // Nothing relevant left
            if (selected.length >= (query.maxFunctions ?? 80)) break

            const snippet = this.buildFunctionSnippet(fn, query)
            const tokens = estimateTokens(snippet)

            if (usedTokens + tokens > tokenBudget) continue  // skip, try smaller ones later
            selected.push(fn)
            usedTokens += tokens
        }

        // ── Step 6: Group by module ────────────────────────────────────────
        const byModule = new Map<string, MikkLockFunction[]>()
        for (const fn of selected) {
            if (!byModule.has(fn.moduleId)) byModule.set(fn.moduleId, [])
            byModule.get(fn.moduleId)!.push(fn)
        }

        const contextModules: ContextModule[] = []
        for (const [modId, fns] of byModule) {
            const modDef = this.contract.declared.modules.find(m => m.id === modId)
            const moduleFiles = Object.values(this.lock.files)
                .filter(f => f.moduleId === modId)
                .map(f => f.path)

            contextModules.push({
                id: modId,
                name: modDef?.name ?? modId,
                description: modDef?.description ?? '',
                intent: modDef?.intent,
                functions: fns.map(fn => this.toContextFunction(fn, query)),
                files: moduleFiles,
            })
        }

        // Sort modules: ones with more selected functions first
        contextModules.sort((a, b) => b.functions.length - a.functions.length)

        return {
            project: {
                name: this.contract.project.name,
                language: this.contract.project.language,
                description: this.contract.project.description,
                moduleCount: this.contract.declared.modules.length,
                functionCount: Object.keys(this.lock.functions).length,
            },
            modules: contextModules,
            constraints: this.contract.declared.constraints,
            decisions: this.contract.declared.decisions.map(d => ({
                title: d.title,
                reason: d.reason,
            })),
            prompt: this.generatePrompt(query, contextModules),
            meta: {
                seedCount: seeds.length,
                totalFunctionsConsidered: allFunctions.length,
                selectedFunctions: selected.length,
                estimatedTokens: usedTokens,
                keywords,
            },
        }
    }

    // ── Private helpers ────────────────────────────────────────────────────

    private toContextFunction(fn: MikkLockFunction, query: ContextQuery): ContextFunction {
        return {
            name: fn.name,
            file: fn.file,
            startLine: fn.startLine,
            endLine: fn.endLine,
            calls: query.includeCallGraph !== false ? fn.calls : [],
            calledBy: query.includeCallGraph !== false ? fn.calledBy : [],
            purpose: fn.purpose,
            errorHandling: fn.errorHandling?.map(e => `${e.type} @ line ${e.line}: ${e.detail}`),
            edgeCases: fn.edgeCasesHandled,
        }
    }

    /**
     * Build a compact text snippet for token estimation.
     * Mirrors what the providers will emit.
     */
    private buildFunctionSnippet(fn: MikkLockFunction, query: ContextQuery): string {
        const parts = [`${fn.name}(${fn.file}:${fn.startLine}-${fn.endLine})`]
        if (fn.purpose) parts.push(` — ${fn.purpose}`)
        if (query.includeCallGraph !== false && fn.calls.length > 0) {
            parts.push(` calls:[${fn.calls.join(',')}]`)
        }
        return parts.join('')
    }

    /** Generate the natural-language prompt section */
    private generatePrompt(query: ContextQuery, modules: ContextModule[]): string {
        const lines: string[] = []

        lines.push('=== ARCHITECTURAL CONTEXT ===')
        lines.push(`Project: ${this.contract.project.name} (${this.contract.project.language})`)
        if (this.contract.project.description) {
            lines.push(`Description: ${this.contract.project.description}`)
        }
        lines.push(`Task: ${query.task}`)
        lines.push('')

        for (const mod of modules) {
            lines.push(`--- Module: ${mod.name} (${mod.id}) ---`)
            if (mod.description) lines.push(mod.description)
            if (mod.intent) lines.push(`Intent: ${mod.intent}`)
            lines.push('')

            for (const fn of mod.functions) {
                const callStr = fn.calls.length > 0
                    ? ` → [${fn.calls.join(', ')}]`
                    : ''
                const calledByStr = fn.calledBy.length > 0
                    ? ` ← called by [${fn.calledBy.join(', ')}]`
                    : ''
                lines.push(`  ${fn.name}  ${fn.file}:${fn.startLine}-${fn.endLine}${callStr}${calledByStr}`)
                if (fn.purpose) lines.push(`    purpose: ${fn.purpose}`)
                if (fn.edgeCases && fn.edgeCases.length > 0) {
                    lines.push(`    edge cases: ${fn.edgeCases.join('; ')}`)
                }
                if (fn.errorHandling && fn.errorHandling.length > 0) {
                    lines.push(`    error handling: ${fn.errorHandling.join('; ')}`)
                }
            }
            lines.push('')
        }

        if (this.contract.declared.constraints.length > 0) {
            lines.push('=== CONSTRAINTS (MUST follow) ===')
            for (const c of this.contract.declared.constraints) {
                lines.push(`  • ${c}`)
            }
            lines.push('')
        }

        if (this.contract.declared.decisions.length > 0) {
            lines.push('=== ARCHITECTURAL DECISIONS ===')
            for (const d of this.contract.declared.decisions) {
                lines.push(`  • ${d.title}: ${d.reason}`)
            }
            lines.push('')
        }

        return lines.join('\n')
    }
}