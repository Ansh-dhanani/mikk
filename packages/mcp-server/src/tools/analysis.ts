import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { spawn } from 'node:child_process'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { DeadCodeDetector, TaintAnalyzer } from '@getmikk/core'
import { loadContractAndLock, buildGraphFromLock, requestQueue, withTimeout, PRIORITIES } from './shared.js'

function normalizePathKey(p: string): string {
    return (p || '').replace(/\\/g, '/').toLowerCase()
}

export function registerAnalysisTools(server: McpServer, projectRoot: string) {

    // ── mikk_dead_code ───────────────────────────────────────────────────────
    // Unified dead code tool — merges what was split across dead_code + get_dead_code.
    // Multi-pass analysis: exempts exports, entry points, route handlers, tests, constructors.
    ; (server as any).tool(
        'mikk_dead_code',
        'Detect unused functions (dead code) with multi-pass exemptions — exports, entry points, route handlers, tests, and constructors are automatically excluded. Returns dead functions grouped by module with complexity scores to prioritize removal. WHEN TO USE: Before refactoring or cleanup. AFTER THIS: Use mikk_get_function_detail on any suspicious function before removing.',
        {
            moduleId: z.string().optional().describe('Filter results to a specific module ID'),
            includeExported: z.boolean().optional().default(false).describe('Include exported functions (usually false — exports have external callers)'),
            minLines: z.number().optional().default(3).describe('Min function length to report (filters out trivial stubs)'),
            limit: z.number().optional().default(50),
        },
        async (args: any): Promise<any> => {
            return requestQueue.add(async () => {
                const { moduleId, includeExported, minLines, limit } = args as any
                const { lock, staleness } = await loadContractAndLock(projectRoot)
                const graph = buildGraphFromLock(lock)
                const detector = new DeadCodeDetector(graph, lock)
                const result = detector.detect()
                let dead = result.deadFunctions || []
                if (moduleId) {
                    const lockMod = (lock.modules as any)?.[moduleId]
                    const modFileSet = new Set<string>(((lockMod?.files ?? []) as string[]).map(normalizePathKey))
                    dead = dead.filter(f => modFileSet.has(normalizePathKey(f.file)))
                }
                if (!includeExported) {
                    dead = dead.filter(f => {
                        const fn = lock.functions[f.id]
                        return !(fn?.isExported)
                    })
                }
                if (minLines > 0) dead = dead.filter(f => {
                    const fn = lock.functions[f.id]
                    return fn ? (fn.endLine - fn.startLine + 1) >= minLines : true
                })
                // Sort by complexity desc to surface worst offenders first
                dead = dead.sort((a, b) => {
                    const fnA = lock.functions[a.id]; const fnB = lock.functions[b.id];
                    return ((fnB as any)?.complexity || 1) - ((fnA as any)?.complexity || 1)
                })
                const byModule = dead.reduce((acc: Record<string, any[]>, f) => {
                    const mid = f.moduleId ?? 'unknown'
                        ; (acc[mid] = acc[mid] || []).push(f)
                    return acc
                }, {})
                const totalFunctions = Object.keys(lock.functions).length
                const deadPercent = totalFunctions > 0
                    ? Math.round((dead.length / totalFunctions) * 100)
                    : 0
                return {
                    content: [{
                        type: 'text' as const, text: JSON.stringify({
                            summary: {
                                totalFunctions,
                                deadCount: dead.length,
                                deadPercent,
                                moduleBreakdown: Object.entries(byModule).map(([mod, fns]: [string, any[]]) => ({ module: mod, dead: fns.length })).sort((a, b) => b.dead - a.dead),
                            },
                            deadFunctions: dead.slice(0, limit).map(f => {
                                const fn = lock.functions[f.id]
                                return {
                                    name: f.name, file: f.file, module: f.moduleId,
                                    lines: fn ? (fn.endLine - fn.startLine + 1) : 0,
                                    complexity: (fn as any)?.complexity || 1,
                                    isExported: (fn as any)?.isExported,
                                    purpose: (fn as any)?.purpose,
                                }
                            }),
                            warning: staleness,
                            hint: 'Use mikk_get_function_detail before removing — a function may be called via reflection or dynamic import.',
                        }, null, 2)
                    }]
                }
            }, { priority: PRIORITIES.STANDARD })
        },
    )

        // ── mikk_get_complexity ──────────────────────────────────────────────────
        ; (server as any).tool(
            'mikk_get_complexity',
            'Get functions above a complexity threshold — identifies technical debt and refactoring candidates. Complexity is scored from available data: error handling count, call density, param count, function length, async depth. Returns distribution (critical ≥20, high ≥15, medium ≥10) with per-function breakdown. WHEN TO USE: Before refactoring or to prioritize technical debt.',
            {
                moduleId: z.string().optional(),
                minComplexity: z.number().optional().default(5).describe('Minimum complexity to include (default: 5)'),
                limit: z.number().optional().default(30),
            },
            async (args: any): Promise<any> => {
                return requestQueue.add(async () => {
                    const { moduleId, minComplexity, limit } = args as any
                    const { lock, staleness } = await loadContractAndLock(projectRoot)

                    // Compute complexity on-the-fly from available lock fields.
                    // MikkLockFunction has no stored complexity — derive from:
                    //   errorHandling count (+2 each), call density (+1 per 5 calls),
                    //   param count (+1 if >4), async (+1), line length (+1 per 30 lines)
                    function computeComplexity(f: typeof lock.functions[string]): number {
                        const lines = f.endLine - f.startLine + 1
                        const callCount = (f.calls || []).length
                        const errCount = (f.errorHandling || []).length
                        const paramCount = (f.params || []).length
                        return 1
                            + (errCount * 2)
                            + Math.floor(callCount / 5)
                            + (paramCount > 4 ? 1 : 0)
                            + (f.isAsync ? 1 : 0)
                            + Math.floor(lines / 30)
                    }

                    const allFunctions = Object.values(lock.functions)
                        .map(f => ({ fn: f, complexity: computeComplexity(f) }))
                        .filter(({ complexity, fn }) => complexity >= minComplexity && (!moduleId || fn.moduleId === moduleId))
                        .sort((a, b) => b.complexity - a.complexity)
                        .slice(0, limit)

                    const total = Object.keys(lock.functions).length
                    const complexities = allFunctions.map(x => x.complexity)
                    return {
                        content: [{
                            type: 'text' as const, text: JSON.stringify({
                                summary: {
                                    totalAnalyzed: total,
                                    overThreshold: allFunctions.length,
                                    note: 'Complexity is derived from error-handling count, call density, params, async, and line length.',
                                    distribution: {
                                        critical: complexities.filter(c => c >= 20).length,
                                        high: complexities.filter(c => c >= 15 && c < 20).length,
                                        medium: complexities.filter(c => c >= 10 && c < 15).length,
                                        low: complexities.filter(c => c >= minComplexity && c < 10).length,
                                    },
                                },
                                functions: allFunctions.map(({ fn: f, complexity }) => ({
                                    name: f.name, file: f.file, module: f.moduleId,
                                    complexity,
                                    lines: f.endLine - f.startLine + 1,
                                    callCount: (f.calls || []).length,
                                    errorHandlingCount: (f.errorHandling || []).length,
                                    paramCount: (f.params || []).length,
                                    isAsync: f.isAsync,
                                    isExported: f.isExported,
                                    purpose: f.purpose,
                                })),
                                warning: staleness,
                                hint: 'Functions with complexity ≥15 are prime refactoring candidates. Use mikk_get_function_detail to review before splitting.',
                            }, null, 2)
                        }]
                    }
                }, { priority: PRIORITIES.STANDARD })
            },
        )

        // ── mikk_taint_analysis ───────────────────────────────────────────────────
        // Exposes the fully-implemented TaintAnalyzer that was previously dead code.
        ; (server as any).tool(
            'mikk_taint_analysis',
            'Detect data-flow security vulnerabilities: SQL injection, command injection, XSS, path traversal, prototype pollution. Traces tainted user-controlled sources (req.body, process.argv) to dangerous sinks (eval, executeQuery, innerHTML) through the call graph. WHEN TO USE: Security audit, before deploying user-facing endpoints, or after mikk_secrets_scan finds XSS/SQLi patterns.',
            {
                severity: z.enum(['critical', 'high', 'medium', 'all']).optional().default('all'),
                limit: z.number().int().min(1).max(100).optional().default(30),
                sources: z.array(z.string()).optional().describe('Custom taint source patterns (e.g. ["req.body", "process.argv"])'),
                sinks: z.array(z.string()).optional().describe('Custom taint sink patterns (e.g. ["query(", "eval("])'),
                projectRoot: z.string().optional(),
            },
            async (args: any): Promise<any> => {
                return requestQueue.add(async () => {
                    const { severity, limit, sources: customSources, sinks: customSinks, projectRoot: argRoot } = args as any
                    const effectiveRoot = argRoot || projectRoot
                    const { lock, staleness } = await loadContractAndLock(effectiveRoot)
                    const allFunctions = Object.values(lock.functions)

                    // T15/T18 fix: inter-procedural taint via body scanning + BFS
                    const srcPatterns: string[] = (customSources ?? []).map((s: string) => s.toLowerCase())
                    const snkPatterns: string[] = (customSinks ?? []).map((s: string) => s.toLowerCase())
                    const { getFunctionBody } = await import('./shared.js')

                    const bodySources = new Set<string>()
                    const bodySinks = new Map<string, string>()

                    for (const fn of allFunctions) {
                        const body = getFunctionBody(fn, effectiveRoot)
                        const text = (body + ' ' + fn.name + ' ' + (fn.purpose || '')).toLowerCase()
                        const isSource = (srcPatterns.length > 0 ? srcPatterns.some(p => text.includes(p)) : false) ||
                            /req\.(body|query|params)|process\.argv/.test(text)
                        if (isSource) bodySources.add(fn.id)
                        const isDynProp = /\w+\s*\[\s*\w+\s*\]\s*=/.test(body)
                        const isObjAssign = /Object\.assign\s*\(/.test(body)
                        const isSqlSink = (snkPatterns.length > 0 ? snkPatterns.some(p => text.includes(p)) : false) ||
                            /query\s*\(|\.exec\s*\(/.test(text)
                        if (isDynProp) bodySinks.set(fn.id, 'dynamic_property_assignment (bracket write sink)')
                        else if (isObjAssign) bodySinks.set(fn.id, 'Object.assign (prototype pollution vector)')
                        else if (isSqlSink) bodySinks.set(fn.id, snkPatterns[0] ?? 'sql-query')
                    }

                    // BFS inter-procedural path discovery
                    const callMap = new Map<string, string[]>()
                    const callerMap = new Map<string, string[]>()
                    for (const fn of allFunctions) {
                        callMap.set(fn.id, fn.calls ?? [])
                        for (const callee of (fn.calls ?? [])) {
                            if (!callerMap.has(callee)) callerMap.set(callee, [])
                            callerMap.get(callee)!.push(fn.id)
                        }
                    }

                    // T18 fix: same-function detection — source function is also a sink
                    for (const srcId of bodySources) {
                        if (bodySinks.has(srcId)) {
                            const srcFn = lock.functions[srcId]; if (!srcFn) continue
                            bodySources.delete(srcId) // handled below
                        }
                    }

                    // T15 fix: propagate sources upward — callers of source functions are also tainted
                    const expandedSources = new Set<string>(bodySources)
                    for (const srcId of bodySources) {
                        const callers = callerMap.get(srcId) ?? []
                        for (const callerId of callers) expandedSources.add(callerId)
                    }

                    const detectedPaths: any[] = []

                    // T18: same-function source+sink detection
                    for (const fn of allFunctions) {
                        const body = getFunctionBody(fn, effectiveRoot)
                        const text = (body + ' ' + fn.name + ' ' + (fn.purpose || '')).toLowerCase()
                        const isSource = (srcPatterns.length > 0 ? srcPatterns.some(p => text.includes(p)) : false) ||
                            /req\.(body|query|params)|process\.argv/.test(text)
                        if (isSource && bodySinks.has(fn.id)) {
                            detectedPaths.push({
                                source: fn.name, sink: bodySinks.get(fn.id),
                                hops: [fn.name], chain: [fn.name], path: [fn.name], severity: 'high', confidence: 0.8,
                            })
                        }
                    }

                    for (const srcId of expandedSources) {
                        const srcFn = lock.functions[srcId]; if (!srcFn) continue
                        // Find the original source name (the callee that was the direct source)
                        const origSrcName = bodySources.has(srcId) ? srcFn.name :
                            (callMap.get(srcId) ?? []).filter(id => bodySources.has(id)).map(id => lock.functions[id]?.name).filter(Boolean)[0] ?? srcFn.name
                        const queue: { id: string; path: string[] }[] = [{ id: srcId, path: [origSrcName, srcFn.name].filter((v,i,a) => a.indexOf(v)===i) }]
                        const visited = new Set<string>()
                        while (queue.length > 0) {
                            const item = queue.shift()!
                            if (visited.has(item.id) || item.path.length > 8) continue
                            visited.add(item.id)
                            if (bodySinks.has(item.id)) {
                                detectedPaths.push({
                                    source: origSrcName, sink: bodySinks.get(item.id),
                                    hops: item.path, chain: item.path, path: item.path, severity: 'high', confidence: 0.7,
                                })
                            }
                            for (const callee of (callMap.get(item.id) ?? [])) {
                                if (!visited.has(callee) && lock.functions[callee])
                                    queue.push({ id: callee, path: [...item.path, lock.functions[callee].name] })
                            }
                        }
                    }

                    // Built-in TaintAnalyzer for additional coverage
                    const analyzer = new TaintAnalyzer(lock)
                    const result = analyzer.analyze()
                    const SORD: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 }
                    const minSev = SORD[severity === 'all' ? 'low' : severity] ?? 1
                    const filtered = result.flows.filter(f => (SORD[f.severity] ?? 1) >= minSev).slice(0, limit)
                    const builtinPaths = filtered.map(f => ({
                        source: f.source, sink: f.sink,
                        hops: f.path ?? [], chain: f.path ?? [], path: f.path ?? [],
                        severity: f.severity, confidence: f.confidence,
                    }))
                    const allPaths = [...detectedPaths, ...builtinPaths]
                    const bySev: Record<string, any[]> = {}
                    for (const f of filtered) { if (!bySev[f.severity]) bySev[f.severity] = []; bySev[f.severity].push(f) }

                    return {
                        content: [{
                            type: 'text' as const, text: JSON.stringify({
                                summary: { ...result.summary, totalFlows: allPaths.length },
                                filteredFlows: allPaths.length,
                                paths: allPaths,
                                bySeverity: { critical: bySev.critical ?? [], high: bySev.high ?? [], medium: bySev.medium ?? [] },
                                warning: staleness,
                                hint: allPaths.length > 0
                                    ? 'Review critical/high flows first. Use mikk_get_function_detail on source/sink functions to see the actual code.'
                                    : 'No taint flows detected. Run mikk_secrets_scan for hardcoded credential checks.',
                            }, null, 2)
                        }]
                    }
                }, { priority: PRIORITIES.STANDARD })
            },
        )
}
