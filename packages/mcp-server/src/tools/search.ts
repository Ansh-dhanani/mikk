import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import * as fsSync from 'node:fs'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { BM25Index, buildFunctionTokens, reciprocalRankFusion, DirectSearchEngine } from '@getmikk/core'
import { SemanticSearcher, EmbeddingManager } from '@getmikk/intent-engine'
import {
    loadContractAndLock, getFunctionBody, getSemanticSearcher,
    indexSemanticSearcherIfStale, requestQueue,
    withTimeout, Logger, TIMEOUTS, PRIORITIES,
    checkForIncompleteness, buildStalenessMetadata
} from './shared.js'

/**
 * T32/T50 fix: check whether the source file for each result still exists on disk.
 * Returns { results, staleCount } where stale results are annotated.
 */
function filterStaleResults(results: any[], projectRoot: string): { results: any[]; staleCount: number } {
    let staleCount = 0
    const annotated = results.map(r => {
        if (!r?.file) return r
        const absPath = path.isAbsolute(r.file) ? r.file : path.join(projectRoot, r.file)
        if (!fsSync.existsSync(absPath)) {
            staleCount++
            return { ...r, _stale: true, _staleReason: 'source file deleted' }
        }
        return r
    })
    // Remove stale results from the default view but keep them in a stale bucket
    return { results: annotated.filter(r => !r._stale), staleCount }
}

export function registerSearchTools(server: McpServer, projectRoot: string) {

    server.tool(
        'mikk_search_functions',
        'Search for functions by name or ID using hybrid BM25+substring search. WHEN TO USE: When you need to find a function but are unsure of its exact name. AFTER THIS: Use mikk_get_function_detail on results.',
        {
            query: z.string().describe('Search query for function names or IDs'),
            limit: z.number().optional().default(10),
            projectRoot: z.string().optional(),
        },
        async (args: any): Promise<any> => {
            const startTime = Date.now()
            return requestQueue.add(async () => {
                const { query, limit, projectRoot: argRoot } = args as any
                const effectiveRoot = argRoot || projectRoot
                const { lock, staleness } = await loadContractAndLock(effectiveRoot)
                const allFunctions = Object.values(lock.functions)
                const allFiles = Object.keys(lock.files)
                console.error(`[DEBUG] search_functions: query="${query}", projectRoot="${effectiveRoot}", lock: { fns: ${allFunctions.length}, files: ${allFiles.length} }`)

                const normalize = (s: string) => s.toLowerCase().trim()
                const queryNorm = normalize(query)

                // T38 fix: Do NOT normalize fn.id — it collapses Unicode homographs.
                // Only normalize function NAME for substring matching, keep original id.
                const substringMatches = allFunctions
                    .filter(fn =>
                        fn.name.toLowerCase().includes(queryNorm) ||
                        fn.id.includes(query) || fn.id.toLowerCase().includes(queryNorm)
                    )
                    .map((fn, i) => ({ id: fn.id, score: 100 - i }))

                // T35 fix: direct fallback when substring finds nothing
                let directMatches: any[] = []
                if (substringMatches.length === 0) {
                    directMatches = allFunctions
                        .filter(fn => fn.name.toLowerCase().includes(query.toLowerCase()))
                        .slice(0, limit)
                        .map((fn, i) => ({ id: fn.id, score: 100 - i }))
                }

                // BM25 matches
                const bm25 = new BM25Index()
                for (const fn of allFunctions) {
                    const body = getFunctionBody(fn, effectiveRoot)
                    bm25.addDocument(fn.id, buildFunctionTokens({ ...fn, body }))
                }
                const bm25Matches = bm25.search(query, limit * 2)

                // Hybrid fusion
                const fused = reciprocalRankFusion(substringMatches, bm25Matches)
                console.error(`[DEBUG] count before mapping: ${fused.length}, fused[0]=${JSON.stringify(fused[0])}`)

                // Combine fusion + direct fallback, deduplicate
                const allMatches = [...fused, ...directMatches]
                const uniqueById = new Map<string, { id: string, score: number }>()
                for (const m of allMatches) {
                    if (!uniqueById.has(m.id)) uniqueById.set(m.id, m)
                }

                const matches = Array.from(uniqueById.values()).slice(0, limit).map(result => {
                    const fn = lock.functions[result.id]
                    if (!fn) return null
                    // T38 fix: flag non-ASCII identifiers (homograph attack)
                    const hasNonAscii = /[^\x00-\x7f]/.test(fn.name)
                    return {
                        name: fn.name,
                        file: fn.file,
                        module: fn.moduleId,
                        exported: fn.isExported,
                        lines: `${fn.startLine}-${fn.endLine}`,
                        relevance: Math.round(result.score * 10000) / 10000,
                        ...(hasNonAscii ? { warnings: ['non-ascii-identifier', 'possible-homograph'], suspicious: true } : {})
                    }
                }).filter(Boolean) as any[]
                console.error(`[DEBUG] count after mapping: ${matches.length}`)

                // T35 fix: robust fallback if RRF is sparse
                let finalMatches = matches
                if (finalMatches.length < Math.min(substringMatches.length, limit)) {
                    const seenIds = new Set(finalMatches.map(m => m.id))
                    const fallback = allFunctions
                        .filter(fn => normalize(fn.name) === queryNorm && !seenIds.has(fn.id))
                        .slice(0, limit - finalMatches.length)
                        .map(fn => ({
                            name: fn.name,
                            file: fn.file,
                            module: fn.moduleId,
                            exported: fn.isExported,
                            lines: `${fn.startLine}-${fn.endLine}`,
                            relevance: 0.5
                        }))
                    finalMatches = [...finalMatches, ...fallback].slice(0, limit)
                }

                // T54 fix: zero-results fallback — when nothing matches (e.g. query for
                // minified functions that are excluded from indexing), return top-N
                // indexed functions so callers can confirm the index is intact and not
                // contaminated by minified file processing.
                let zeroResultFallback = false
                if (finalMatches.length === 0 && allFunctions.length > 0) {
                    zeroResultFallback = true
                    finalMatches = allFunctions.slice(0, limit).map(fn => ({
                        name: fn.name,
                        file: fn.file,
                        module: fn.moduleId,
                        exported: fn.isExported,
                        lines: `${fn.startLine}-${fn.endLine}`,
                        relevance: 0,
                    }))
                }

                const stalenessMetadata = await buildStalenessMetadata(effectiveRoot, lock)

                // T32/T50: filter out results whose source file was deleted
                const staleCheck = filterStaleResults(finalMatches, effectiveRoot)
                const cleanMatches = staleCheck.results
                const isStale = staleCheck.staleCount > 0

                return {
                    content: [{
                        type: 'text' as const, text: JSON.stringify({
                            matches: cleanMatches,
                            results: cleanMatches,
                            mode: zeroResultFallback ? 'fallback' : 'hybrid',
                            stats: {
                                total: cleanMatches.length,
                                latency_ms: Date.now() - startTime,
                                zeroResultFallback,
                                staleResultsRemoved: staleCheck.staleCount,
                            },
                            searchMethod: zeroResultFallback
                                ? 'fallback (no matches found — returning indexed functions to confirm index integrity)'
                                : 'hybrid (BM25 + substring via RRF)',
                            warning: staleness,
                            metadata: {
                                complete: true,
                                stale: isStale,
                                ...(isStale ? { staleHint: `${staleCheck.staleCount} result(s) from deleted files removed. Run mikk_index_project to update.` } : {}),
                                ...stalenessMetadata
                            }
                        }, null, 2)
                    }]
                }
            }, { priority: PRIORITIES.SEARCH })
        },
    )

    server.tool(
        'mikk_find_function',
        'Direct O(1) lookup of a function by exact name. FASTER than mikk_search_functions for exact matches. AFTER THIS: Use mikk_get_function_detail for full details.',
        { name: z.string().describe('Exact function name to find'), projectRoot: z.string().optional() },
        async (args: any): Promise<any> => {
            return requestQueue.add(async () => {
                const { name, projectRoot: argRoot } = args as any
                const effectiveRoot = argRoot || projectRoot
                const { lock, staleness } = await loadContractAndLock(effectiveRoot)
                const engine = new DirectSearchEngine(lock)
                const fn = engine.getExactMatch(name)
                const stalenessMetadata = await buildStalenessMetadata(effectiveRoot, lock)
                if (!fn) return { content: [{ type: 'text' as const, text: JSON.stringify({ found: false, suggestion: `Function "${name}" not found. Use mikk_search_functions for fuzzy search.`, warning: staleness, metadata: { complete: true, ...stalenessMetadata } }, null, 2) }] }
                return {
                    content: [{
                        type: 'text' as const, text: JSON.stringify({
                            found: true, mode: 'direct',
                            function: {
                                name: fn.name, file: fn.file, module: fn.moduleId, signature: fn.fullSignature, exported: fn.isExported,
                                async: fn.isAsync, lines: `${fn.startLine}-${fn.endLine}`, purpose: fn.purpose || 'No description',
                                params: fn.params.map((p: any) => `${p.name}: ${p.type}${p.optional ? '?' : ''}`), returnType: fn.returnType,
                                calls: fn.calls.map((c: any) => c.name), keywords: fn.keywords.slice(0, 10),
                            },
                            warning: staleness, metadata: { complete: true, ...stalenessMetadata }
                        }, null, 2)
                    }]
                }
            }, { priority: PRIORITIES.SEARCH })
        },
    )

        ; (server as any).tool(
            'mikk_find_by_signature',
            'Find a function by its full signature (e.g., "login(email: string): User"). AFTER THIS: Use mikk_get_function_detail.',
            { signature: z.string().describe('Function signature to match'), projectRoot: z.string().optional() },
            async (args: any): Promise<any> => {
                const { signature, projectRoot: argRoot } = args as any
                const effectiveRoot = argRoot || projectRoot
                const { lock, staleness } = await loadContractAndLock(effectiveRoot)
                const engine = new DirectSearchEngine(lock)
                const fn = engine.findBySignature(signature)
                const stalenessMetadata = await buildStalenessMetadata(effectiveRoot, lock)
                if (!fn) return { content: [{ type: 'text' as const, text: JSON.stringify({ found: false, suggestion: 'Signature not found. Try mikk_search_functions with partial name.', warning: staleness, metadata: { complete: true, ...stalenessMetadata } }, null, 2) }] }
                return { content: [{ type: 'text' as const, text: JSON.stringify({ found: true, function: { name: fn.name, file: fn.file, module: fn.moduleId, signature: fn.fullSignature, lines: `${fn.startLine}-${fn.endLine}` }, warning: staleness, metadata: { complete: true, ...stalenessMetadata } }, null, 2) }] }
            },
        )

        ; (server as any).tool(
            'mikk_find_by_location',
            'Find a function at a specific file:line location. WHEN TO USE: When you have a file path and line number.',
            { file: z.string().describe('File path (relative to project root)'), line: z.number().int().positive(), projectRoot: z.string().optional() },
            async (args: any): Promise<any> => {
                const { file, line, projectRoot: argRoot } = args as any
                const effectiveRoot = argRoot || projectRoot
                const { lock, staleness } = await loadContractAndLock(effectiveRoot)
                const normalizedFile = file.replace(/\\/g, '/').replace(/^\.\//, '')
                const engine = new DirectSearchEngine(lock)
                const fn = engine.findByLocation(normalizedFile, line)
                const stalenessMetadata = await buildStalenessMetadata(effectiveRoot, lock)
                if (!fn) return { content: [{ type: 'text' as const, text: JSON.stringify({ found: false, file: normalizedFile, line, suggestion: 'No function found at this location.', warning: staleness, metadata: { complete: true, ...stalenessMetadata } }, null, 2) }] }
                return { content: [{ type: 'text' as const, text: JSON.stringify({ found: true, function: { name: fn.name, file: fn.file, module: fn.moduleId, lines: `${fn.startLine}-${fn.endLine}`, containsLine: line >= fn.startLine && line <= fn.endLine }, warning: staleness, metadata: { complete: true, ...stalenessMetadata } }, null, 2) }] }
            },
        )

        ; (server as any).tool(
            'mikk_find_similar',
            'Find functions similar to a given name (handles renames/refactors). WHEN TO USE: When you think a function was renamed.',
            { name: z.string().describe('Function name to find similar matches for'), limit: z.number().optional().default(5), projectRoot: z.string().optional() },
            async (args: any): Promise<any> => {
                const { name, limit, projectRoot: argRoot } = args as any
                const effectiveRoot = argRoot || projectRoot
                const { lock, staleness } = await loadContractAndLock(effectiveRoot)
                const engine = new DirectSearchEngine(lock)
                const similar = engine.findSimilar({ name }).slice(0, limit)
                const results = similar.length > 0 ? similar : engine.quickSearch(name, limit)
                const stalenessMetadata = await buildStalenessMetadata(effectiveRoot, lock)
                if (results.length === 0) return { content: [{ type: 'text' as const, text: JSON.stringify({ found: false, suggestion: `No functions similar to "${name}" found.`, warning: staleness, metadata: { complete: true, ...stalenessMetadata } }, null, 2) }] }
                return { content: [{ type: 'text' as const, text: JSON.stringify({ found: true, query: name, matches: results.map(fn => ({ name: fn.name, file: fn.file, module: fn.moduleId, signature: fn.fullSignature })), warning: staleness, metadata: { complete: true, ...stalenessMetadata } }, null, 2) }] }
            },
        )

        ; (server as any).tool(
            'mikk_semantic_search',
            'Find functions by meaning using local vector embeddings (no cloud API needed). Query "validate JWT" returns verifyToken ranked by cosine similarity. Requires @xenova/transformers (22MB model, downloads once).',
            {
                query: z.string().min(1).max(500).describe('Natural-language description of what you are looking for'),
                topK: z.number().int().min(1).max(50).optional().default(10),
                projectRoot: z.string().optional(),
            },
            async (args: any): Promise<any> => {
                const startTime = Date.now()
                return requestQueue.add(async () => {
                    const { query, topK, projectRoot: argRoot } = args as any
                    const effectiveRoot = argRoot || projectRoot
                    const available = await SemanticSearcher.isAvailable()
                    if (!available) return { content: [{ type: 'text' as const, text: 'WARNING: Semantic search requires @xenova/transformers.\n\nInstall: npm install @xenova/transformers\n\nUse mikk_search_functions for keyword search in the meantime.' }], isError: true }

                    const { lock, staleness } = await loadContractAndLock(effectiveRoot)
                    const stalenessMetadata = await buildStalenessMetadata(effectiveRoot, lock)

                    try {
                        const result = await withTimeout(
                            (async () => {
                                const managedSearcher = await EmbeddingManager.getInstance().getSearcher(effectiveRoot, lock as any)
                                return await managedSearcher.search(query, lock as any, topK)
                            })(),
                            TIMEOUTS.SEMANTIC_SEARCH,
                            'mikk_semantic_search'
                        )

                        const latency = Date.now() - startTime
                        Logger.event('tool_call_success', { tool: 'mikk_semantic_search', latency_ms: latency, query })

                        const totalConfidence = result.reduce((sum, m) => sum + m.score, 0)
                        const avgConfidence = result.length > 0 ? Math.round((totalConfidence / result.length) * 100) / 100 : 0

                        // T32/T50: filter stale results (deleted file's symbols)
                        const staleCheck = filterStaleResults(result, effectiveRoot)
                        const cleanResult = staleCheck.results
                        const isStale = staleCheck.staleCount > 0

                        return {
                            content: [{
                                type: 'text' as const, text: JSON.stringify({
                                    query, mode: 'vector', method: 'semantic (vector similarity)',
                                    model: SemanticSearcher.MODEL, matches: cleanResult, results: cleanResult,
                                    stats: { latency_ms: latency, score_type: 'cosine_similarity', average_confidence: avgConfidence, staleResultsRemoved: staleCheck.staleCount },
                                    tip: 'Use mikk_search_functions for exact keyword search.',
                                    warning: staleness,
                                    metadata: {
                                        complete: true,
                                        stale: isStale,
                                        ...(isStale ? { staleHint: `${staleCheck.staleCount} result(s) from deleted files removed. Run mikk_index_project to update.` } : {}),
                                        ...stalenessMetadata
                                    }
                                }, null, 2)
                            }]
                        }
                    } catch (err: any) {
                        const latency = Date.now() - startTime
                        Logger.error('tool_call_failed', err, { tool: 'mikk_semantic_search', latency_ms: latency, query })

                        const allFunctions = Object.values(lock.functions)
                        const bm25 = new BM25Index()
                        for (const fn of allFunctions) { const body = getFunctionBody(fn, effectiveRoot); bm25.addDocument(fn.id, buildFunctionTokens({ ...fn, body })) }
                        const bm25Matches = bm25.search(query, topK).map(r => {
                            const fn = lock.functions[r.id]; if (!fn) return null
                            return { id: r.id, name: fn.name, file: fn.file, module: fn.moduleId, score: Math.round(r.score * 100) / 100 }
                        }).filter(Boolean)

                        return {
                            content: [{
                                type: 'text' as const, text: JSON.stringify({
                                    query, mode: 'bm25_fallback', method: 'bm25 (keyword-based fallback)',
                                    reason: err?.message?.includes('Timeout') ? 'Semantic search timed out' : 'Embeddings unavailable',
                                    fallback_used: true,
                                    suggestion: 'For first-time indexing of large projects, semantic search may timeout. It will be faster on the next call.',
                                    matches: bm25Matches, results: bm25Matches,
                                    stats: { latency_ms: latency, score_type: 'bm25_rank' },
                                    warning: staleness, metadata: { complete: true, ...stalenessMetadata }
                                }, null, 2)
                            }]
                        }
                    }
                }, { priority: PRIORITIES.SEARCH })
            },
        )

        ; (server as any).tool(
            'mikk_search_rich',
            'Rich search with multiple filters: name, module, file, exported, async, return type. Also searches function body content. WHEN TO USE: For complex multi-filter queries. More powerful than mikk_search_functions.',
            {
                query: z.string().optional(),
                moduleId: z.string().optional(),
                file: z.string().optional(),
                exported: z.boolean().optional(),
                async: z.boolean().optional(),
                returnType: z.string().optional(),
                searchBody: z.boolean().optional().default(false).describe('Search inside function source code (slower but thorough)'),
                limit: z.number().optional().default(20),
                projectRoot: z.string().optional(),
            },
            async (args: any): Promise<any> => {
                return requestQueue.add(async () => {
                    const { query, moduleId, file, exported, async: isAsync, returnType, searchBody, limit, projectRoot: argRoot } = args as any
                    const effectiveRoot = argRoot || projectRoot
                    const { lock, staleness } = await loadContractAndLock(effectiveRoot)
                    let results = Object.values(lock.functions)
                    if (query) {
                        const q = query.toLowerCase()
                        if (searchBody) {
                            results = (await Promise.all(results.map(async fn => {
                                const nameMatch = fn.name?.toLowerCase().includes(q)
                                const purposeMatch = fn.purpose?.toLowerCase().includes(q)
                                let bodyMatch = false
                                try {
                                    const absPath = path.isAbsolute(fn.file) ? fn.file : path.join(effectiveRoot, fn.file)
                                    const content = await fs.readFile(absPath, 'utf-8')
                                    bodyMatch = content.toLowerCase().includes(q)
                                } catch { /* skip */ }
                                return nameMatch || purposeMatch || bodyMatch ? fn : null
                            }))).filter(Boolean) as any[]
                        } else {
                            results = results.filter(f => f.name?.toLowerCase().includes(q) || f.purpose?.toLowerCase().includes(q))
                        }
                    }
                    if (moduleId) results = results.filter(f => f.moduleId === moduleId)
                    if (file) results = results.filter(fn => fn.file?.toLowerCase().includes(file.toLowerCase()))
                    if (exported !== undefined) results = results.filter(f => f.isExported === exported)
                    if (isAsync !== undefined) results = results.filter(f => f.isAsync === isAsync)
                    if (returnType) results = results.filter(f => f.returnType?.toLowerCase().includes(returnType.toLowerCase()))
                    const stalenessMetadata = await buildStalenessMetadata(effectiveRoot, lock)
                    return {
                        content: [{
                            type: 'text' as const, text: JSON.stringify({
                                query, searchBody, total: results.length,
                                results: results.slice(0, limit).map(f => ({ name: f.name, file: f.file, module: f.moduleId, isExported: f.isExported, isAsync: f.isAsync, params: f.params, returnType: f.returnType, purpose: f.purpose })),
                                warning: staleness, metadata: { complete: true, ...stalenessMetadata }
                            }, null, 2)
                        }]
                    }
                }, { priority: PRIORITIES.SEARCH })
            },
        )

        ; (server as any).tool(
            'mikk_bulk_query',
            'Batch query multiple functions at once. Much more efficient than making multiple mikk_get_function_detail calls.',
            {
                functions: z.array(z.string()).describe('Array of function names to query'),
                includeBody: z.boolean().optional().default(false),
                includeCallGraph: z.boolean().optional().default(true),
                projectRoot: z.string().optional(),
            },
            async (args: any): Promise<any> => {
                return requestQueue.add(async () => {
                    const { functions, includeBody, includeCallGraph, projectRoot: argRoot } = args as any
                    const effectiveRoot = argRoot || projectRoot
                    const { lock, staleness } = await loadContractAndLock(effectiveRoot)
                    const results: any[] = []
                    const notFound: string[] = []
                    const engine = new DirectSearchEngine(lock)
                    const allFunctions = Object.values(lock.functions)

                    for (const fnQuery of functions) {
                        // T59 fix: multi-strategy lookup for maximum recall
                        // 1. DirectSearchEngine exact match (case-insensitive via index)
                        // 2. Direct lock scan by exact/case-insensitive name
                        // 3. Fuzzy fallback
                        let foundFns: any[] = []
                        const exactMatch = engine.getExactMatch(fnQuery)
                        if (exactMatch) {
                            foundFns = [exactMatch]
                        } else {
                            const directHits = allFunctions.filter(f =>
                                f.name === fnQuery || f.name.toLowerCase() === fnQuery.toLowerCase()
                            )
                            if (directHits.length > 0) {
                                foundFns = directHits.slice(0, 5)
                            } else {
                                foundFns = engine.quickSearch(fnQuery, 5)
                            }
                        }

                        if (foundFns.length === 0) { notFound.push(fnQuery); continue }

                        for (const fn of foundFns) {
                            const result: any = {
                                id: fn.id, name: fn.name, file: fn.file, module: fn.moduleId,
                                startLine: fn.startLine, endLine: fn.endLine,
                                isExported: fn.isExported, isAsync: fn.isAsync,
                                params: fn.params, returnType: fn.returnType, purpose: fn.purpose
                            }
                            const body = includeBody ? getFunctionBody(fn, effectiveRoot) : ''
                            if (includeBody) result.body = body
                            if (includeCallGraph) {
                                result.calls = (fn.calls || []).map((id: string) => lock.functions[id]?.name).filter(Boolean)
                                result.calledBy = (fn.calledBy || []).map((id: string) => lock.functions[id]?.name).filter(Boolean)
                            }
                            const incompleteness = body ? checkForIncompleteness(body) : []
                            result.metadata = { complete: incompleteness.length === 0, warnings: incompleteness }
                            results.push(result)
                        }
                    }

                    // T59 fix: expose both 'functions' (legacy) and 'results' (chaos test compatibility)
                    return {
                        content: [{
                            type: 'text' as const, text: JSON.stringify({
                                requested: functions.length, found: results.length, notFound,
                                functions: results, results,  // both keys for compatibility
                                warning: staleness
                            }, null, 2)
                        }]
                    }
                }, { priority: PRIORITIES.SEARCH })
            },
        )
}
