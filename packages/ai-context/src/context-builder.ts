import type { MikkContract, MikkLock, MikkLockFunction } from '@getmikk/core'
import { BM25Index, type BM25Result } from '@getmikk/core'
import type { AIContext, ContextQuery, ContextModule, ContextFunction } from './types.js'
import * as fs from 'node:fs'
import * as path from 'node:path'

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
    KEYWORD_PURPOSE: 0.30,   // purpose contains a task keyword
    KEYWORD_FILE: 0.20,   // file path contains a task keyword
    // Entry-point bonus — functions nothing calls deserve attention
    ENTRY_POINT: 0.20,
    // Exported function bonus
    EXPORTED: 0.10,
}

// Default token budget per context payload
const DEFAULT_TOKEN_BUDGET = 6000

function readContextFile(filePath: string, projectRoot?: string): string {
    if (!projectRoot) return ''
    try {
        return fs.readFileSync(path.resolve(projectRoot, filePath), 'utf-8')
    } catch {
        return ''
    }
}

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

/**
 * Get a module ID and all its descendant module IDs (children, grandchildren, etc.)
 */
function getModuleAndDescendants(moduleId: string, modules: MikkContract['declared']['modules']): string[] {
    const result = [moduleId]
    const children = modules.filter(m => m.parentId === moduleId)
    for (const child of children) {
        result.push(...getModuleAndDescendants(child.id, modules))
    }
    return result
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

const SHORT_TECH_WORDS = new Set([
    'ai', 'ml', 'ui', 'ux', 'ts', 'js', 'db', 'io', 'id', 'ip',
    'ci', 'cd', 'qa', 'api', 'mcp', 'jwt', 'sql',
])

function normalizeKeyword(value: string): string {
    return value.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '')
}

function extractKeywords(task: string, requiredKeywords: string[] = []): string[] {
    const out: string[] = []
    const seen = new Set<string>()

    for (const match of task.matchAll(/"([^"]+)"|'([^']+)'/g)) {
        const phrase = (match[1] ?? match[2] ?? '').toLowerCase().trim()
        if (!phrase || seen.has(phrase)) continue
        seen.add(phrase)
        out.push(phrase)
    }

    const words = task
        .toLowerCase()
        .replace(/[^a-z0-9\s_-]/g, ' ')
        .split(/\s+/)
        .map(normalizeKeyword)
        .filter(w => {
            if (!w || STOP_WORDS.has(w)) return false
            if (w.length > 2) return true
            return SHORT_TECH_WORDS.has(w)
        })

    for (const w of words) {
        if (seen.has(w)) continue
        seen.add(w)
        out.push(w)
    }

    const expandedRequired = requiredKeywords
        .flatMap(item => item.split(/[,\s]+/))
        .map(normalizeKeyword)
        .filter(Boolean)

    for (const kw of expandedRequired) {
        if (seen.has(kw)) continue
        seen.add(kw)
        out.push(kw)
    }

    return out
}

/**
 * Keyword score for a function: exact match > partial match
 * 
 * FIX: Improved keyword matching for better relevance:
 * - Added camelCase component matching (e.g., "login" matches "loginUser")
 * - Added purpose/signature token matching
 * - Added file path component matching
 */
function keywordScore(
    fn: MikkLockFunction,
    keywords: string[]
): { score: number; matchedKeywords: string[] } {
    if (keywords.length === 0) return { score: 0, matchedKeywords: [] }
    
    const nameLower = fn.name.toLowerCase()
    const fileLower = fn.file.toLowerCase()
    const fileNoExt = fileLower.replace(/\.(d\.ts|ts|tsx|js|jsx|mjs|cjs|mts|cts)\b/g, ' ')
    const purposeLower = (fn.purpose ?? '').toLowerCase()
    
    // Get name tokens including camelCase components
    const nameTokens = new Set<string>()
    for (const part of nameLower.split(/[-_.]/)) {
        nameTokens.add(part)
        // Split camelCase
        const camelParts = part.replace(/([a-z])([A-Z])/g, '$1 $2').split(' ')
        for (const cp of camelParts) {
            if (cp.length >= 2) nameTokens.add(cp)
        }
    }
    
    const fileTokens = new Set<string>(
        fileNoExt.match(/[a-z0-9]+/g) ?? []
    )
    const purposeTokens = new Set<string>(
        purposeLower.match(/[a-z0-9]+/g) ?? []
    )
    
    let score = 0
    const matched: string[] = []

    for (const kw of keywords) {
        const shortKw = kw.length <= 2
        const exactName = nameLower === kw
        const partialName = nameLower.includes(kw)
        const tokenMatch = nameTokens.has(kw) || [...nameTokens].some(t => t.includes(kw))
        const fileMatch = fileLower.includes(kw) || fileTokens.has(kw)
        const purposeMatch = purposeLower.includes(kw) || purposeTokens.has(kw)
        
        if (exactName) {
            score = Math.max(score, WEIGHT.KEYWORD_EXACT)
            matched.push(kw)
        } else if (tokenMatch || partialName) {
            score = Math.max(score, WEIGHT.KEYWORD_PARTIAL)
            matched.push(kw)
        } else if (purposeMatch) {
            score = Math.max(score, WEIGHT.KEYWORD_PURPOSE)
            matched.push(kw)
        } else if (fileMatch && !shortKw) {
            score = Math.max(score, WEIGHT.KEYWORD_FILE)
            matched.push(kw)
        }
    }
    return { score, matchedKeywords: matched }
}

// ---------------------------------------------------------------------------
// Seed resolution — find the best starting nodes for graph traversal
// ---------------------------------------------------------------------------

/**
 * Find seed function IDs from focusFiles, focusModules, or task keywords.
 * Seeds are the "center of gravity" for the BFS walk.
 * 
 * FIX: For large codebases (700+ functions), keyword-only matching is too strict.
 * Now uses a multi-stage fallback:
 * 1. Exact keyword match
 * 2. Partial keyword match (fuzzy)
 * 3. Module name match (for large codebases)
 * 4. File path match
 */
function resolveSeeds(
    query: ContextQuery,
    contract: MikkContract,
    lock: MikkLock,
    keywords: string[]
): string[] {
    const strictMode = query.relevanceMode === 'strict'
    const seeds = new Set<string>()
    const functionCount = Object.keys(lock.functions).length
    const isLargeCodebase = functionCount > 100

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
            // Include functions from the module itself and its children
            const allModIds = getModuleAndDescendants(modId, contract.declared.modules)
            for (const fn of Object.values(lock.functions)) {
                if (allModIds.includes(fn.moduleId)) seeds.add(fn.id)
            }
        }
    }

    // 3. Keyword/BM25 match against function names and file paths
    if (seeds.size === 0) {
        // Use inline BM25 scoring for seed finding
        const index = new BM25Index()
        for (const fn of Object.values(lock.functions)) {
            const tokens: string[] = []
            const nameParts = fn.name.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[-_]/)
            tokens.push(...nameParts.filter(p => p.length >= 2))
            if (fn.purpose) {
                const purposeTokens = fn.purpose.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/)
                tokens.push(...purposeTokens.filter(t => t.length >= 2))
            }
            const fileName = path.basename(fn.file).replace(/\.(d\.ts|ts|tsx|js|jsx|py|go|java|rs|cs|cpp|c|php|rb)$/i, '')
            const fileParts = fileName.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[-_]/)
            tokens.push(...fileParts.filter(p => p.length >= 2))
            if (tokens.length > 0) index.addDocument(fn.id, tokens)
        }
        
        const bm25Results = index.search(keywords.join(' '), Math.min(50, Object.keys(lock.functions).length))
        const scoredSeeds = new Map<string, number>()
        for (const r of bm25Results) {
            scoredSeeds.set(r.id, r.score)
        }
        
        for (const fn of Object.values(lock.functions)) {
            const bm25Score = scoredSeeds.get(fn.id) ?? 0
            // Use BM25 score or keyword score (whichever is higher)
            const kwScore = keywordScore(fn, keywords).score
            if (bm25Score > 0 || kwScore >= WEIGHT.KEYWORD_PARTIAL) {
                seeds.add(fn.id)
            }
        }
    }

    // 4. For large codebases: also match module names and file paths with BM25
    if (isLargeCodebase && seeds.size === 0) {
        const taskLower = query.task.toLowerCase()
        
        // Match against module names
        for (const mod of contract.declared.modules) {
            const modNameLower = mod.name.toLowerCase()
            if (taskLower.includes(modNameLower) || modNameLower.split(' ').some(w => taskLower.includes(w))) {
                for (const fn of Object.values(lock.functions)) {
                    if (fn.moduleId === mod.id) seeds.add(fn.id)
                }
            }
        }
        
        // Match against file path components (including context files)
        if (seeds.size === 0) {
            // Also check context files from lock
            const contextFilePaths = new Set<string>()
            if (lock.contextFiles) {
                for (const cf of lock.contextFiles) {
                    contextFilePaths.add(path.basename(cf.path).toLowerCase())
                }
            }
            
            for (const fn of Object.values(lock.functions)) {
                const pathParts = fn.file.toLowerCase().split(/[-_.]+/)
                for (const kw of keywords) {
                    if (pathParts.includes(kw) || pathParts.some(p => p.includes(kw))) {
                        seeds.add(fn.id)
                        break
                    }
                }
                // Also check against context file basenames
                if (seeds.size === 0) {
                    const fnBase = path.basename(fn.file).toLowerCase()
                    for (const cfPath of contextFilePaths) {
                        for (const kw of keywords) {
                            if (cfPath.includes(kw) || kw.includes(cfPath.replace(/\.[^.]+$/, ''))) {
                                seeds.add(fn.id)
                                break
                            }
                        }
                        if (seeds.size > 0) break
                    }
                }
            }
        }
    }

    // 5. Module name match against task (relaxed for large codebases)
    if (!strictMode && seeds.size === 0) {
        const taskLower = query.task.toLowerCase()
        for (const mod of contract.declared.modules) {
            if (
                taskLower.includes(mod.id.toLowerCase()) ||
                taskLower.includes(mod.name.toLowerCase()) ||
                mod.name.split(' ').some(w => w.length > 2 && taskLower.includes(w.toLowerCase()))
            ) {
                // Include functions from module and its children
                const allModIds = getModuleAndDescendants(mod.id, contract.declared.modules)
                for (const fn of Object.values(lock.functions)) {
                    if (allModIds.includes(fn.moduleId)) seeds.add(fn.id)
                }
            }
        }
    }

    // 6. Ultimate fallback for large codebases: return most recently modified or first N functions
    if (seeds.size === 0 && isLargeCodebase) {
        const allFns = Object.values(lock.functions)
        // Return functions from most relevant modules (by name match) or first 50
        const relevantModules = contract.declared.modules
            .filter(m => {
                const taskLower = query.task.toLowerCase()
                return taskLower.includes(m.name.toLowerCase().split(' ')[0].toLowerCase())
            })
            .slice(0, 3)
        
        for (const fn of allFns) {
            const modIds = relevantModules.flatMap(m => getModuleAndDescendants(m.id, contract.declared.modules))
            if (modIds.includes(fn.moduleId)) {
                seeds.add(fn.id)
            }
        }
        
        // If still empty, just take first 20 functions as seeds
        if (seeds.size === 0) {
            Object.keys(lock.functions).slice(0, 20).forEach(id => seeds.add(id))
        }
    }

    return [...seeds]
}

// ---------------------------------------------------------------------------
// Main ContextBuilder
// ---------------------------------------------------------------------------

export class ContextBuilder {
    private bm25Index: BM25Index

    constructor(
        private contract: MikkContract,
        private lock: MikkLock
    ) {
        this.bm25Index = this.buildBm25Index()
    }

    private buildBm25Index(): BM25Index {
        const index = new BM25Index()
        for (const fn of Object.values(this.lock.functions)) {
            const tokens: string[] = []
            
            // Add function name tokens (split by underscore, camelCase)
            const nameParts = fn.name.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[-_]/)
            tokens.push(...nameParts.filter(p => p.length >= 2))
            
            // Add purpose tokens
            if (fn.purpose) {
                const purposeTokens = fn.purpose.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/)
                tokens.push(...purposeTokens.filter(t => t.length >= 2))
            }
            
            // Add file name tokens (basename without extension)
            const fileName = path.basename(fn.file).replace(/\.(d\.ts|ts|tsx|js|jsx|py|go|java|rs|cs|cpp|c|php|rb)$/i, '')
            const fileParts = fileName.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[-_]/)
            tokens.push(...fileParts.filter(p => p.length >= 2))
            
            // Add module ID tokens
            if (fn.moduleId) {
                const modParts = fn.moduleId.split(/[-_]/)
                tokens.push(...modParts.filter(p => p.length >= 2))
            }
            
            if (tokens.length > 0) {
                index.addDocument(fn.id, tokens)
            }
        }
        return index
    }

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
        const relevanceMode = query.relevanceMode ?? 'balanced'
        const strictMode = relevanceMode === 'strict'
        const tokenBudget = query.tokenBudget ?? DEFAULT_TOKEN_BUDGET
        const maxHops = query.maxHops ?? 4
        const requiredKeywords = query.requiredKeywords ?? []
        const keywords = extractKeywords(query.task, requiredKeywords)
        const requiredKeywordSet = new Set(
            requiredKeywords
                .flatMap(item => item.split(/[,\s]+/))
                .map(normalizeKeyword)
                .filter(Boolean)
        )

        // ── Step 1: Resolve seeds ──────────────────────────────────────────
        const seeds = resolveSeeds(query, this.contract, this.lock, keywords)
        const seedSet = new Set(seeds)

        // ── Step 2: BFS proximity scores ──────────────────────────────────
        const proximityMap = seeds.length > 0
            ? bfsNeighbors(seeds, this.lock.functions, maxHops)
            : new Map<string, number>()

        // ── Step 3: Score every function ──────────────────────────────────
        const allFunctions = Object.values(this.lock.functions)
        const focusFiles = query.focusFiles ?? []
        const focusModules = new Set(query.focusModules ?? [])
        const requireAllKeywords = query.requireAllKeywords ?? false
        const minKeywordMatches = query.minKeywordMatches ?? 1
        const strictPassIds = new Set<string>()
        const reasons: string[] = []
        const suggestions: string[] = []
        const nearMissSuggestions: string[] = []

        const scored: { fn: MikkLockFunction; score: number }[] = allFunctions.map(fn => {
            let score = 0

            // ── BM25 Search Score (primary ranking) ────────────────────────────
            const bm25Results = this.bm25Index.search(keywords.join(' '), Math.min(100, allFunctions.length))
            const bm25ScoreMap = new Map(bm25Results.map(r => [r.id, r.score]))
            const bm25Score = bm25ScoreMap.get(fn.id) ?? 0
            // Normalize BM25 score to 0-1 range and weight it heavily
            const normalizedBm25 = bm25Score > 0 ? Math.min(1, bm25Score / 10) * 0.7 : 0
            score += normalizedBm25

            // Proximity from BFS
            const depth = proximityMap.get(fn.id)
            if (depth !== undefined) {
                score += depthToScore(depth)
            }

            // Keyword match (supplemental)
            const kwInfo = keywordScore(fn, keywords)
            score += kwInfo.score * 0.3

            const matchedSet = new Set(kwInfo.matchedKeywords)
            const inFocusFile = focusFiles.some(filePath => fn.file.includes(filePath) || filePath.includes(fn.file))
            const inFocusModule = focusModules.has(fn.moduleId)
            const inFocus = inFocusFile || inFocusModule

            const requiredPass = requiredKeywordSet.size === 0
                ? true
                : [...requiredKeywordSet].every(kw => matchedSet.has(kw))
            const generalPass = requireAllKeywords
                ? (keywords.length > 0 && matchedSet.size >= keywords.length)
                : (keywords.length === 0 ? false : matchedSet.size >= minKeywordMatches)
            const keywordPass = requiredPass && generalPass
            if (keywordPass) strictPassIds.add(fn.id)

            if (strictMode) {
                const isSeed = seedSet.has(fn.id)
                const seedFromFocus = isSeed && (inFocus || focusFiles.length > 0 || focusModules.size > 0)
                if (!(inFocus || keywordPass || seedFromFocus)) {
                    if (kwInfo.score > 0) {
                        nearMissSuggestions.push(`${fn.name} (${fn.file}:${fn.startLine})`)
                    }
                    return { fn, score: -1 }
                }
            }

            // Entry-point bonus
            if (!strictMode && fn.calledBy.length === 0) score += WEIGHT.ENTRY_POINT

            return { fn, score }
        })

        // ── Step 4: Sort by score descending ──────────────────────────────
        scored.sort((a, b) => b.score - a.score)
        for (const { fn, score } of scored) {
            if (score <= 0) continue
            suggestions.push(`${fn.name} (${fn.file}:${fn.startLine})`)
            if (suggestions.length >= 5) break
        }
        for (const s of nearMissSuggestions) {
            if (suggestions.includes(s)) continue
            suggestions.push(s)
            if (suggestions.length >= 5) break
        }

        // ── Step 5: Fill token budget ──────────────────────────────────────
        let selected: MikkLockFunction[] = []
        
        // Check if query found any relevant matches
        const hasRelevantMatches = scored.some(s => s.score > 0)
        
        // Pre-calculate baseline overhead (context files, routes, constraints)
        let usedTokens = 0
        const routesStr = (!strictMode && this.lock.routes) ? JSON.stringify(this.lock.routes) : ''
        const ctxStr = (!strictMode && this.lock.contextFiles) 
            ? this.lock.contextFiles.map(cf => readContextFile(cf.path, query.projectRoot).slice(0, 2000)).join('\n')
            : ''
        usedTokens += estimateTokens(routesStr + ctxStr + JSON.stringify(this.contract.declared.constraints))

        for (const { fn, score } of scored) {
            // Only select functions with positive BM25/keyword score
            // If no seeds found at all (unmatched query), still filter by score > 0
            const hasRelevantScore = score > 0
            const shouldFilter = seeds.length > 0 || keywords.length > 0
            
            if (shouldFilter && !hasRelevantScore) continue // Skip irrelevant functions
            if (selected.length >= (query.maxFunctions ?? 80)) break

            const snippet = this.buildFunctionSnippet(fn, query)
            // Multiply tokens by 2.2 to account for it being in both JSON and text prompt, plus JSON framing
            const tokens = estimateTokens(snippet) * 2.2

            if (usedTokens + tokens > tokenBudget && selected.length > 0) continue  // skip, try smaller ones later
            selected.push(fn)
            usedTokens += tokens
        }

        if (strictMode) {
            if (requiredKeywordSet.size > 0) {
                reasons.push(`required terms: ${[...requiredKeywordSet].join(', ')}`)
            }
            if (strictPassIds.size === 0) {
                reasons.push('no functions matched strict keyword filters')
            }
        }

        if (strictMode && query.exactOnly) {
            selected = selected.filter(fn => strictPassIds.has(fn.id))
            usedTokens = selected.reduce(
                (sum, fn) => sum + estimateTokens(this.buildFunctionSnippet(fn, query)),
                0
            )
            if (selected.length === 0 && strictPassIds.size > 0) {
                reasons.push('exact matches exist but did not fit token budget or max function limit')
            }
        }

        if (strictMode && query.failFast && selected.length === 0) {
            reasons.push('fail-fast enabled: returning no context when exact match set is empty')
            return {
                project: {
                    name: this.contract.project.name,
                    language: this.contract.project.language,
                    description: this.contract.project.description,
                    moduleCount: this.contract.declared.modules.length,
                    functionCount: Object.keys(this.lock.functions).length,
                },
                modules: [],
                constraints: this.contract.declared.constraints,
                decisions: this.contract.declared.decisions.map(d => ({
                    title: d.title,
                    reason: d.reason,
                })),
                contextFiles: [],
                routes: [],
                prompt: '',
                meta: {
                    seedCount: seeds.length,
                    totalFunctionsConsidered: allFunctions.length,
                    selectedFunctions: 0,
                    estimatedTokens: 0,
                    keywords,
                    reasons,
                    suggestions: suggestions.length > 0 ? suggestions : undefined,
                },
            }
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

        // Strict mode favors precision and token efficiency: keep only function graph context.
        const contextFiles = strictMode ? [] : this.lock.contextFiles
        const routes = strictMode ? [] : this.lock.routes

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
            contextFiles: contextFiles?.map(cf => ({
                path: cf.path,
                content: readContextFile(cf.path, query.projectRoot),
                type: cf.type,
            })),
            routes: routes?.map(r => ({
                method: r.method,
                path: r.path,
                handler: r.handler,
                middlewares: r.middlewares,
                file: r.file,
                line: r.line,
            })),
            prompt: this.generatePrompt(query, contextModules),
            meta: {
                seedCount: seeds.length,
                totalFunctionsConsidered: allFunctions.length,
                selectedFunctions: selected.length,
                estimatedTokens: usedTokens,
                keywords,
                reasons: reasons.length > 0 ? reasons : undefined,
                suggestions: (selected.length === 0 && suggestions.length > 0) ? suggestions : undefined,
            },
        }
    }

    // ── Private helpers ────────────────────────────────────────────────────

    private toContextFunction(fn: MikkLockFunction, query: ContextQuery): ContextFunction {
        const base: ContextFunction = {
            name: fn.name,
            file: fn.file,
            startLine: fn.startLine,
            endLine: fn.endLine,
            calls: query.includeCallGraph !== false ? fn.calls : [],
            calledBy: query.includeCallGraph !== false ? fn.calledBy : [],
            params: fn.params,
            returnType: fn.returnType,
            isAsync: fn.isAsync,
            isExported: fn.isExported,
            purpose: fn.purpose,
            errorHandling: fn.errorHandling?.map(e => `${e.type} @ line ${e.line}: ${e.detail}`),
            edgeCases: fn.edgeCasesHandled,
        }

        // Attach body if requested and projectRoot is available
        if (query.includeBodies !== false && query.projectRoot) {
            base.body = this.readFunctionBody(fn, query.projectRoot)
        }

        return base
    }

    /**
     * Read the actual source code of a function from disk.
     * Uses startLine/endLine from the lock to extract the relevant lines.
     * Large bodies are compressed to preserve logic while stripping noise.
     */
    private readFunctionBody(fn: MikkLockFunction, projectRoot: string): string | undefined {
        try {
            const filePath = path.resolve(projectRoot, fn.file)
            if (!fs.existsSync(filePath)) return undefined

            const content = fs.readFileSync(filePath, 'utf-8')
            const lines = content.split('\n')
            const start = Math.max(0, fn.startLine - 1)  // Convert to 0-based
            const end = Math.min(lines.length, fn.endLine)
            const body = lines.slice(start, end).join('\n')

            // Skip if body is trivially small (single-line setters etc.)
            if (body.length < 20) return undefined

            return compressBody(body)
        } catch {
            return undefined
        }
    }

    /**
     * Build a compact text snippet for token estimation.
     * Mirrors what the providers will emit.
     */
    private buildFunctionSnippet(fn: MikkLockFunction, query: ContextQuery): string {
        const asyncStr = fn.isAsync ? 'async ' : ''
        const params = fn.params?.map(p => `${p.name}: ${p.type}`).join(', ') || ''
        const retStr = fn.returnType ? `: ${fn.returnType}` : ''
        const parts = [`${asyncStr}${fn.name}(${params})${retStr} ${fn.file}:${fn.startLine}-${fn.endLine}`]
        if (fn.purpose) parts.push(` — ${fn.purpose}`)
        if (query.includeCallGraph !== false && fn.calls.length > 0) {
            parts.push(` calls:[${fn.calls.join(',')}]`)
        }
        // Estimate body contribution to tokens if bodies will be included
        if (query.includeBodies !== false && query.projectRoot) {
            const bodyLines = (fn.endLine - fn.startLine) + 1
            // Compressed bodies are ~40-60% smaller; use reduced estimate
            const charsPerLine = bodyLines > 15 ? 20 : 40
            parts.push('X'.repeat(bodyLines * charsPerLine))
        }
        return parts.join('')
    }

    /** Generate the natural-language prompt section */
    private generatePrompt(query: ContextQuery, modules: ContextModule[]): string {
        const lines: string[] = []
        const strictMode = query.relevanceMode === 'strict'

        lines.push('=== ARCHITECTURAL CONTEXT ===')
        lines.push(`Project: ${this.contract.project.name} (${this.contract.project.language})`)
        if (this.contract.project.description) {
            lines.push(`Description: ${this.contract.project.description}`)
        }
        lines.push(`Task: ${query.task}`)
        lines.push('')

        // Include routes (API endpoints) — critical for understanding how the app works
        const routes = this.lock.routes
        if (!strictMode && routes && routes.length > 0) {
            lines.push('=== HTTP ROUTES ===')
            for (const r of routes) {
                const mw = r.middlewares.length > 0 ? ` [${r.middlewares.join(', ')}]` : ''
                lines.push(`  ${r.method} ${r.path} → ${r.handler}${mw}  (${r.file}:${r.line})`)
            }
            lines.push('')
        }

        // Include context files (schemas, data models) first — they define the shape
        const ctxFiles = this.lock.contextFiles
        if (!strictMode && ctxFiles && ctxFiles.length > 0) {
            lines.push('=== DATA MODELS & SCHEMAS ===')
            for (const cf of ctxFiles) {
                lines.push(`--- ${cf.path} (${cf.type}) ---`)
                // Trim to ~2000 chars per file in prompt output
                const maxChars = 2000
                const cfContent = readContextFile(cf.path, query.projectRoot)
                if (cfContent.length > maxChars) {
                    lines.push(cfContent.slice(0, maxChars))
                    lines.push(`... (truncated, ${cf.size ?? cfContent.length} bytes total)`)
                } else {
                    lines.push(cfContent.trimEnd())
                }
                lines.push('')
            }
        }

        for (const mod of modules) {
            lines.push(`--- Module: ${mod.name} (${mod.id}) ---`)
            if (mod.description) lines.push(mod.description)
            if (mod.intent) lines.push(`Intent: ${mod.intent}`)
            lines.push('')

            for (const fn of mod.functions) {
                // Rich signature
                const asyncStr = fn.isAsync ? 'async ' : ''
                const params = fn.params && fn.params.length > 0
                    ? fn.params.map(p => `${p.name}${p.optional ? '?' : ''}: ${p.type}`).join(', ')
                    : ''
                const retStr = fn.returnType ? `: ${fn.returnType}` : ''
                const exported = fn.isExported ? 'export ' : ''
                const sig = `${exported}${asyncStr}${fn.name}(${params})${retStr}`

                const callStr = fn.calls.length > 0
                    ? ` → [${fn.calls.join(', ')}]`
                    : ''
                const calledByStr = fn.calledBy.length > 0
                    ? ` ← called by [${fn.calledBy.join(', ')}]`
                    : ''
                lines.push(`  ${sig}  ${fn.file}:${fn.startLine}-${fn.endLine}${callStr}${calledByStr}`)
                if (fn.purpose) lines.push(`    purpose: ${fn.purpose}`)
                if (fn.edgeCases && fn.edgeCases.length > 0) {
                    lines.push(`    edge cases: ${fn.edgeCases.join('; ')}`)
                }
                if (fn.errorHandling && fn.errorHandling.length > 0) {
                    lines.push(`    error handling: ${fn.errorHandling.join('; ')}`)
                }
                if (fn.body) {
                    lines.push('    ```')
                    lines.push(fn.body)
                    lines.push('    ```')
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

// ---------------------------------------------------------------------------
// Body compressor — produces dense pseudo-code preserving all logic
// ---------------------------------------------------------------------------

/**
 * Compress a function body for context output.
 * Bodies ≤ 15 lines pass through unchanged.
 * Larger bodies get noise stripped, templates collapsed, and blocks condensed.
 */
function compressBody(raw: string): string {
    const lines = raw.split('\n')
    if (lines.length <= 15) return raw

    let result = stripNoise(lines)
    result = removeEmptyBlocks(result)
    result = collapseTemplates(result)
    result = collapseChains(result)
    result = collapseSimpleBlocks(result)
    result = dedent(result)

    return result.join('\n')
}

/** Strip blank lines, comment-only lines, and console.* statements */
function stripNoise(lines: string[]): string[] {
    const out: string[] = []
    let inBlock = false

    for (const line of lines) {
        const t = line.trim()

        // Track block comments
        if (inBlock) {
            if (t.includes('*/')) inBlock = false
            continue
        }
        if (t.startsWith('/*')) {
            if (!t.includes('*/')) inBlock = true
            continue
        }

        // Skip blank lines
        if (!t) continue

        // Skip single-line comments (preserve TODO/FIXME/NOTE)
        if (t.startsWith('//') && !/\b(TODO|FIXME|HACK|NOTE)\b/i.test(t)) continue

        // Skip console.log/error/warn/info/debug statements
        if (/^\s*console\.(log|error|warn|info|debug)\s*\(/.test(line)) continue

        out.push(line)
    }

    return out
}

/** Remove empty blocks left after noise stripping (empty else {}, catch {}) */
function removeEmptyBlocks(lines: string[]): string[] {
    const out: string[] = []
    let i = 0

    while (i < lines.length) {
        const t = lines[i].trim()
        const next = i + 1 < lines.length ? lines[i + 1].trim() : ''

        // "} else {" followed by "}" → just "}" (closing the if-block)
        if (/^}\s*else\s*\{$/.test(t) && next === '}') {
            const indent = lines[i].match(/^(\s*)/)?.[1] || ''
            out.push(`${indent}}`)
            i += 2
            continue
        }

        // "} catch (...) {" followed by "}" → "} catch (...) {}" on one line
        if (/^}\s*catch\s*(\(.*\))?\s*\{$/.test(t) && next === '}') {
            const indent = lines[i].match(/^(\s*)/)?.[1] || ''
            out.push(`${indent}${t} }`)
            i += 2
            continue
        }

        out.push(lines[i])
        i++
    }

    return out
}
/** Collapse multi-line template literals (>5 lines) into short descriptors */
function collapseTemplates(lines: string[]): string[] {
    const out: string[] = []
    let i = 0

    while (i < lines.length) {
        const line = lines[i]
        const t = line.trim()

        // Count unescaped backticks on this line
        const bts = (t.replace(/\\`/g, '').match(/`/g) || []).length

        if (bts % 2 === 1) {
            // Odd count → opens a multi-line template literal
            const start = i
            const collected: string[] = [t]
            i++

            while (i < lines.length) {
                const tl = lines[i].trim()
                collected.push(tl)
                const tlBts = (tl.replace(/\\`/g, '').match(/`/g) || []).length
                if (tlBts % 2 === 1) { i++; break }
                i++
            }

            // Only collapse if the template is large (>5 lines)
            if (collected.length > 5) {
                const content = collected.join('\n')
                const desc = describeTemplate(content)
                const indent = line.match(/^(\s*)/)?.[1] || ''
                const btIdx = t.indexOf('`')
                const prefix = btIdx >= 0 ? t.substring(0, btIdx) : ''
                out.push(`${indent}${prefix}[template: ${desc}]`)
            } else {
                // Small template — keep original lines
                for (let j = start; j < i; j++) out.push(lines[j])
            }
            continue
        }

        out.push(line)
        i++
    }

    return out
}

/** Analyze template content and produce a short description */
function describeTemplate(content: string): string {
    const lower = content.toLowerCase()
    const f: string[] = []

    if (lower.includes('<!doctype') || lower.includes('<html')) f.push('HTML page')
    else if (lower.includes('<div') || lower.includes('<span')) f.push('HTML fragment')
    if (lower.includes('<style>') || lower.includes('font-family')) f.push('with CSS')
    if (lower.includes('<script>')) f.push('with JS')
    if (/\bselect\b|\binsert\b|\bupdate\b.*\bset\b/i.test(content)) f.push('SQL query')

    const interps = (content.match(/\$\{/g) || []).length
    if (interps > 0) f.push(`${interps} vars`)

    return f.length > 0 ? f.join(', ') : `${content.split('\n').length}-line string`
}

/** Collapse 3+ consecutive .replace() lines into a summary */
function collapseChains(lines: string[]): string[] {
    const out: string[] = []
    let i = 0

    while (i < lines.length) {
        if (lines[i].trim().includes('.replace(')) {
            const start = i
            let count = 0
            while (i < lines.length && lines[i].trim().includes('.replace(')) {
                count++
                i++
            }

            if (count >= 3) {
                const indent = lines[start].match(/^(\s*)/)?.[1] || ''
                // If the previous line is the chain's assignment target (no semicolon), merge
                if (out.length > 0) {
                    const prev = out[out.length - 1].trimEnd()
                    if (!prev.endsWith(';') && !prev.endsWith('{') && !prev.endsWith('}')) {
                        out[out.length - 1] = `${prev} [${count}x .replace() chain]`
                        continue
                    }
                }
                out.push(`${indent}[${count}x .replace() chain]`)
            } else {
                for (let j = start; j < i; j++) out.push(lines[j])
            }
            continue
        }

        out.push(lines[i])
        i++
    }

    return out
}

/** Collapse single-statement if/else blocks (3 lines → 1 line) */
function collapseSimpleBlocks(lines: string[]): string[] {
    const out: string[] = []
    let i = 0

    while (i < lines.length) {
        const t = lines[i].trim()

        // Match: if (...) {   or   else if (...) {   or   else {
        if (/^(if\s*\(.*\)|else\s+if\s*\(.*\)|else)\s*\{\s*$/.test(t) && i + 2 < lines.length) {
            const body = lines[i + 1].trim()
            const close = lines[i + 2].trim()

            // Only collapse if the next line is a single statement and line after is closing }
            if (close === '}' && !body.startsWith('if') && !body.startsWith('for') &&
                !body.startsWith('while') && !body.startsWith('switch')) {
                const indent = lines[i].match(/^(\s*)/)?.[1] || ''
                out.push(`${indent}${t} ${body} }`)
                i += 3
                continue
            }
        }

        out.push(lines[i])
        i++
    }

    return out
}

/** Remove common leading indentation */
function dedent(lines: string[]): string[] {
    let min = Infinity
    for (const l of lines) {
        const m = l.match(/^(\s+)\S/)
        if (m && m[1].length < min) min = m[1].length
    }
    if (min === Infinity || min <= 0) return lines

    return lines.map(l => {
        if (!l.trim()) return l
        const spaces = l.length - l.trimStart().length
        return l.substring(Math.min(min, spaces))
    })
}
