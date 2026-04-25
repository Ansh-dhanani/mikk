import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ContextBuilder, getProvider } from '@getmikk/ai-context'
import { loadContractAndLock, _ALC, _CPT, _track, MAX_QUERY_HOPS, MAX_QUERY_TOKEN_BUDGET, requestQueue, PRIORITIES } from './shared.js'

// Per-server session memory: track which function IDs we've already sent this session.
// Keyed by projectRoot so multiple projects stay isolated.
const _sessionFunctionsSent = new Map<string, Set<string>>()
function getSessionSent(projectRoot: string): Set<string> {
    let s = _sessionFunctionsSent.get(projectRoot)
    if (!s) { s = new Set(); _sessionFunctionsSent.set(projectRoot, s) }
    return s
}

export function registerContextTools(server: McpServer, projectRoot: string) {

    // ── mikk_reset_session ────────────────────────────────────────────────
    server.tool(
        'mikk_reset_session',
        'Reset session memory — clears the list of functions already sent this session so the next mikk_query_context returns a full context without the "already sent" annotation. WHEN TO USE: When switching to a completely different part of the codebase or a new task.',
        { projectRoot: z.string().optional() },
        async (args: any): Promise<any> => {
            const effectiveRoot = (args as any)?.projectRoot || projectRoot
            const before = getSessionSent(effectiveRoot).size
            _sessionFunctionsSent.delete(effectiveRoot)
            return { content: [{ type: 'text' as const, text: JSON.stringify({ reset: true, clearedFunctions: before, hint: 'Session cleared. Next mikk_query_context will return full context.' }) }] }
        },
    )

    server.tool(
        'mikk_query_context',
        'Ask an architecture question — returns graph-traced context with relevant functions, files, and call chains. Use to understand how code flows through the project. AFTER THIS: Use mikk_before_edit on any files you plan to modify.',
        {
            question: z.string().describe('The architecture question or task description'),
            maxHops: z.number().int().min(1).max(MAX_QUERY_HOPS).optional().default(4),
            tokenBudget: z.number().int().min(256).max(MAX_QUERY_TOKEN_BUDGET).optional().default(6000),
            focusFile: z.string().optional().describe('Anchor traversal from a specific file path'),
            focusModule: z.string().optional().describe('Anchor traversal from a specific module ID'),
            strict: z.boolean().optional().default(false).describe('High-precision mode: include only tightly relevant context'),
            requiredTerms: z.array(z.string()).optional(),
            requireAllKeywords: z.boolean().optional().default(false),
            minKeywordMatches: z.number().optional().default(1),
            exactOnly: z.boolean().optional().default(false),
            failFast: z.boolean().optional().default(false),
            autoFallback: z.boolean().optional().default(true),
            provider: z.enum(['claude', 'generic', 'compact']).optional().default('generic'),
            projectRoot: z.string().optional(),
        },
        async (args: any): Promise<any> => {
            return requestQueue.add(async () => {
                const { question, maxHops, tokenBudget, focusFile, focusModule, strict, requiredTerms,
                    requireAllKeywords, minKeywordMatches, exactOnly, failFast, autoFallback, provider, projectRoot: argRoot } = args as any
                const effectiveRoot = argRoot || projectRoot
                const { contract, lock, staleness } = await loadContractAndLock(effectiveRoot)
                const query: any = {
                    task: question, maxHops, tokenBudget,
                    focusFiles: focusFile ? [focusFile] : undefined,
                    focusModules: focusModule ? [focusModule] : undefined,
                    includeCallGraph: true, includeBodies: true,
                    relevanceMode: strict ? 'strict' : 'balanced',
                    requiredKeywords: requiredTerms, requireAllKeywords, minKeywordMatches, exactOnly, failFast, projectRoot: effectiveRoot,
                    // SECURITY: Never include .env files in AI agent context — they may contain real secrets
                    excludeFiles: ['.env', '.env.local', '.env.production', '.env.development', '.env.staging', '.env.example'],
                }
                const builder = new ContextBuilder(contract, lock)
                let ctx = builder.build(query)
                let fallbackUsed = false
                if (autoFallback !== false && strict && ctx.modules.length === 0) {
                    const relaxed: any = { ...query, relevanceMode: 'balanced', requiredKeywords: undefined, requireAllKeywords: false, minKeywordMatches: 1, exactOnly: false, failFast: false }
                    const fallback = builder.build(relaxed)
                    if (fallback.modules.length > 0) { ctx = fallback; fallbackUsed = true }
                }
                if (ctx.modules.length === 0) {
                    return { content: [{ type: 'text' as const, text: `No context found for "${question}". Run \`mikk analyze\` or check the file path.` }], isError: true }
                }
                const formatter = getProvider(provider ?? 'generic')
                const output = formatter.formatContext(ctx)

                // Session deduplication: track which function IDs we've already sent.
                // On follow-up queries, annotate re-sent functions so the AI knows they're
                // already in context rather than re-reading them from scratch.
                const sessionSent = getSessionSent(effectiveRoot)
                const allFnIds = ctx.modules.flatMap(m => m.functions.map((f: any) => f.name + ':' + f.file))
                const newFnIds = allFnIds.filter(id => !sessionSent.has(id))
                const repeatedCount = allFnIds.length - newFnIds.length
                for (const id of allFnIds) sessionSent.add(id)
                const dedupNote = repeatedCount > 0
                    ? `\n[Session: ${repeatedCount} function(s) already sent this session — shown for reference only]\n`
                    : ''

                const warning = staleness ? `\n\n${staleness}` : ''
                const fallbackNote = fallbackUsed ? 'Note: strict mode had no exact matches; showing balanced fallback context.\n\n' : ''
                const _rawQC = (tokenBudget ?? 6000) * 3
                const _tokQC = _track(effectiveRoot, _rawQC, output)
                const tokLine = `\n\n---\n// tokens: ${JSON.stringify(_tokQC)}`
                return {
                    content: [{ type: 'text' as const, text: dedupNote + fallbackNote + output + warning + '\n\n---\nHint: Use mikk_before_edit on files you plan to modify, then mikk_impact_analysis to see blast radius.' + tokLine }],
                }
            }, { priority: PRIORITIES.SEARCH })
        },
    )
}
