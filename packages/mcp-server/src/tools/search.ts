import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { BM25Index, buildFunctionTokens, reciprocalRankFusion, DirectSearchEngine } from '@getmikk/core'
import { SemanticSearcher } from '@getmikk/intent-engine'
import { loadContractAndLock, getFunctionBody, getSemanticSearcher } from './shared.js'

export function registerSearchTools(server: McpServer, projectRoot: string) {

    server.tool(
        'mikk_search_functions',
        'Search for functions by name or ID using hybrid BM25+substring search. WHEN TO USE: When you need to find a function but are unsure of its exact name. AFTER THIS: Use mikk_get_function_detail on results.',
        {
            query: z.string().describe('Search query for function names or IDs'),
            limit: z.number().optional().default(10),
        },
        async (args: any): Promise<any> => {
            const { query, limit } = args as any
            const { lock, staleness } = await loadContractAndLock(projectRoot)
            const allFunctions = Object.values(lock.functions)
            const queryLower = query.toLowerCase()
            const substringMatches = allFunctions
                .filter(fn => fn.name.toLowerCase().includes(queryLower) || fn.id.toLowerCase().includes(queryLower))
                .map((fn, i) => ({ id: fn.id, score: 100 - i }))
            const bm25 = new BM25Index()
            for (const fn of allFunctions) { const body = getFunctionBody(fn, projectRoot); bm25.addDocument(fn.id, buildFunctionTokens({ ...fn, body })) }
            const bm25Matches = bm25.search(query, limit * 2)
            const fused = reciprocalRankFusion(substringMatches, bm25Matches)
            const matches = fused.slice(0, limit).map(result => {
                const fn = lock.functions[result.id]; if (!fn) return null
                return { name: fn.name, file: fn.file, module: fn.moduleId, exported: fn.isExported, lines: `${fn.startLine}-${fn.endLine}`, relevance: Math.round(result.score * 10000) / 10000 }
            }).filter(Boolean)
            if (matches.length === 0) return { content: [{ type: 'text' as const, text: `No functions matching "${query}" found.` }] }
            return { content: [{ type: 'text' as const, text: JSON.stringify({ matches, searchMethod: 'hybrid (BM25 + substring via RRF)', warning: staleness }, null, 2) }] }
        },
    )

    server.tool(
        'mikk_find_function',
        'Direct O(1) lookup of a function by exact name. FASTER than mikk_search_functions for exact matches. AFTER THIS: Use mikk_get_function_detail for full details.',
        { name: z.string().describe('Exact function name to find') },
        async (args: any): Promise<any> => {
            const { name } = args as any
            const { lock, staleness } = await loadContractAndLock(projectRoot)
            const engine = new DirectSearchEngine(lock)
            const fn = engine.getExactMatch(name)
            if (!fn) return { content: [{ type: 'text' as const, text: JSON.stringify({ found: false, suggestion: `Function "${name}" not found. Use mikk_search_functions for fuzzy search.`, warning: staleness }, null, 2) }] }
            return { content: [{ type: 'text' as const, text: JSON.stringify({ found: true, function: {
                name: fn.name, file: fn.file, module: fn.moduleId, signature: fn.fullSignature, exported: fn.isExported,
                async: fn.isAsync, lines: `${fn.startLine}-${fn.endLine}`, purpose: fn.purpose || 'No description',
                params: fn.params.map((p: any) => `${p.name}: ${p.type}${p.optional ? '?' : ''}`), returnType: fn.returnType,
                calls: fn.calls.map((c: any) => c.name), keywords: fn.keywords.slice(0, 10),
            }, warning: staleness }, null, 2) }] }
        },
    )

    ;(server as any).tool(
        'mikk_find_by_signature',
        'Find a function by its full signature (e.g., "login(email: string): User"). AFTER THIS: Use mikk_get_function_detail.',
        { signature: z.string().describe('Function signature to match') },
        async (args: any): Promise<any> => {
            const { signature } = args as any
            const { lock, staleness } = await loadContractAndLock(projectRoot)
            const engine = new DirectSearchEngine(lock)
            const fn = engine.findBySignature(signature)
            if (!fn) return { content: [{ type: 'text' as const, text: JSON.stringify({ found: false, suggestion: 'Signature not found. Try mikk_search_functions with partial name.', warning: staleness }, null, 2) }] }
            return { content: [{ type: 'text' as const, text: JSON.stringify({ found: true, function: { name: fn.name, file: fn.file, module: fn.moduleId, signature: fn.fullSignature, lines: `${fn.startLine}-${fn.endLine}` }, warning: staleness }, null, 2) }] }
        },
    )

    ;(server as any).tool(
        'mikk_find_by_location',
        'Find a function at a specific file:line location. WHEN TO USE: When you have a file path and line number.',
        { file: z.string().describe('File path (relative to project root)'), line: z.number().int().positive() },
        async (args: any): Promise<any> => {
            const { file, line } = args as any
            const { lock, staleness } = await loadContractAndLock(projectRoot)
            const normalizedFile = file.replace(/\\/g, '/').replace(/^\.\//, '')
            const engine = new DirectSearchEngine(lock)
            const fn = engine.findByLocation(normalizedFile, line)
            if (!fn) return { content: [{ type: 'text' as const, text: JSON.stringify({ found: false, file: normalizedFile, line, suggestion: 'No function found at this location.', warning: staleness }, null, 2) }] }
            return { content: [{ type: 'text' as const, text: JSON.stringify({ found: true, function: { name: fn.name, file: fn.file, module: fn.moduleId, lines: `${fn.startLine}-${fn.endLine}`, containsLine: line >= fn.startLine && line <= fn.endLine }, warning: staleness }, null, 2) }] }
        },
    )

    ;(server as any).tool(
        'mikk_find_similar',
        'Find functions similar to a given name (handles renames/refactors). WHEN TO USE: When you think a function was renamed.',
        { name: z.string().describe('Function name to find similar matches for'), limit: z.number().optional().default(5) },
        async (args: any): Promise<any> => {
            const { name, limit } = args as any
            const { lock, staleness } = await loadContractAndLock(projectRoot)
            const engine = new DirectSearchEngine(lock)
            const similar = engine.findSimilar(name).slice(0, limit)
            if (similar.length === 0) return { content: [{ type: 'text' as const, text: JSON.stringify({ found: false, suggestion: `No functions similar to "${name}" found.`, warning: staleness }, null, 2) }] }
            return { content: [{ type: 'text' as const, text: JSON.stringify({ found: true, query: name, matches: similar.map(fn => ({ name: fn.name, file: fn.file, module: fn.moduleId, signature: fn.fullSignature })), warning: staleness }, null, 2) }] }
        },
    )

    ;(server as any).tool(
        'mikk_semantic_search',
        'Find functions by meaning using local vector embeddings (no cloud API needed). Query "validate JWT" returns verifyToken ranked by cosine similarity. Requires @xenova/transformers (22MB model, downloads once).',
        {
            query: z.string().min(1).max(500).describe('Natural-language description of what you are looking for'),
            topK: z.number().int().min(1).max(50).optional().default(10),
        },
        async (args: any): Promise<any> => {
            const { query, topK } = args as any
            const available = await SemanticSearcher.isAvailable()
            if (!available) return { content: [{ type: 'text' as const, text: 'WARNING: Semantic search requires @xenova/transformers.\n\nInstall: npm install @xenova/transformers\n\nUse mikk_search_functions for keyword search in the meantime.' }], isError: true }
            const { lock, staleness } = await loadContractAndLock(projectRoot)
            const searcher = getSemanticSearcher(projectRoot)
            try {
                await searcher.index(lock as any)
                const matches = await searcher.search(query, lock as any, topK)
                return { content: [{ type: 'text' as const, text: JSON.stringify({ query, method: 'semantic (vector similarity)', model: SemanticSearcher.MODEL, matches, tip: 'Use mikk_search_functions for exact keyword search.', warning: staleness }, null, 2) }] }
            } catch (err: any) {
                return { content: [{ type: 'text' as const, text: `Semantic search failed: ${err?.message ?? String(err)}. Try mikk_search_functions as fallback.` }], isError: true }
            }
        },
    )

    ;(server as any).tool(
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
        },
        async (args: any): Promise<any> => {
            const { query, moduleId, file, exported, async: isAsync, returnType, searchBody, limit } = args as any
            const { lock, staleness } = await loadContractAndLock(projectRoot)
            let results = Object.values(lock.functions)
            if (query) {
                const q = query.toLowerCase()
                if (searchBody) {
                    results = (await Promise.all(results.map(async fn => {
                        const nameMatch = fn.name?.toLowerCase().includes(q)
                        const purposeMatch = fn.purpose?.toLowerCase().includes(q)
                        let bodyMatch = false
                        try {
                            const absPath = path.isAbsolute(fn.file) ? fn.file : path.join(projectRoot, fn.file)
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
            return { content: [{ type: 'text' as const, text: JSON.stringify({
                query, searchBody, total: results.length,
                results: results.slice(0, limit).map(f => ({ name: f.name, file: f.file, module: f.moduleId, isExported: f.isExported, isAsync: f.isAsync, params: f.params, returnType: f.returnType, purpose: f.purpose })),
                warning: staleness,
            }, null, 2) }] }
        },
    )

    ;(server as any).tool(
        'mikk_bulk_query',
        'Batch query multiple functions at once. Much more efficient than making multiple mikk_get_function_detail calls.',
        {
            functions: z.array(z.string()).describe('Array of function names to query'),
            includeBody: z.boolean().optional().default(false),
            includeCallGraph: z.boolean().optional().default(true),
        },
        async (args: any): Promise<any> => {
            const { functions, includeBody, includeCallGraph } = args as any
            const { lock, staleness } = await loadContractAndLock(projectRoot)
            const results: any[] = []; const notFound: string[] = []
            for (const fnName of functions) {
                const fn = Object.values(lock.functions).find(f => f.name === fnName || f.name.endsWith(`.${fnName}`) || (f.id ?? '').includes(fnName))
                if (!fn) { notFound.push(fnName); continue }
                const result: any = { name: fn.name, file: fn.file, module: fn.moduleId, startLine: fn.startLine, endLine: fn.endLine, isExported: fn.isExported, isAsync: fn.isAsync, params: fn.params, returnType: fn.returnType, purpose: fn.purpose }
                if (includeBody) result.body = getFunctionBody(fn, projectRoot)
                if (includeCallGraph) { result.calls = (fn.calls || []).map((id: string) => lock.functions[id]?.name).filter(Boolean); result.calledBy = (fn.calledBy || []).map((id: string) => lock.functions[id]?.name).filter(Boolean) }
                results.push(result)
            }
            return { content: [{ type: 'text' as const, text: JSON.stringify({ requested: functions.length, found: results.length, notFound, functions: results, warning: staleness }, null, 2) }] }
        },
    )
}
