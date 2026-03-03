import type { MikkContract, MikkLock, MikkLockFunction } from '@getmikk/core'
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
            contextFiles: this.lock.contextFiles?.map(cf => ({
                path: cf.path,
                content: cf.content,
                type: cf.type,
            })),
            routes: this.lock.routes?.map(r => ({
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

        lines.push('=== ARCHITECTURAL CONTEXT ===')
        lines.push(`Project: ${this.contract.project.name} (${this.contract.project.language})`)
        if (this.contract.project.description) {
            lines.push(`Description: ${this.contract.project.description}`)
        }
        lines.push(`Task: ${query.task}`)
        lines.push('')

        // Include routes (API endpoints) — critical for understanding how the app works
        const routes = this.lock.routes
        if (routes && routes.length > 0) {
            lines.push('=== HTTP ROUTES ===')
            for (const r of routes) {
                const mw = r.middlewares.length > 0 ? ` [${r.middlewares.join(', ')}]` : ''
                lines.push(`  ${r.method} ${r.path} → ${r.handler}${mw}  (${r.file}:${r.line})`)
            }
            lines.push('')
        }

        // Include context files (schemas, data models) first — they define the shape
        const ctxFiles = this.lock.contextFiles
        if (ctxFiles && ctxFiles.length > 0) {
            lines.push('=== DATA MODELS & SCHEMAS ===')
            for (const cf of ctxFiles) {
                lines.push(`--- ${cf.path} (${cf.type}) ---`)
                // Trim to ~2000 chars per file in prompt output
                const maxChars = 2000
                if (cf.content.length > maxChars) {
                    lines.push(cf.content.slice(0, maxChars))
                    lines.push(`... (truncated, ${cf.size} bytes total)`)
                } else {
                    lines.push(cf.content.trimEnd())
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