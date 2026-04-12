import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { spawn } from 'node:child_process'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { DeadCodeDetector } from '@getmikk/core'
import { loadContractAndLock, buildGraphFromLock } from './shared.js'

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
            const { moduleId, includeExported, minLines, limit } = args as any
            const { lock, staleness } = await loadContractAndLock(projectRoot)
            const graph = buildGraphFromLock(lock)
            const detector = new DeadCodeDetector(graph, lock)
            const result = detector.detect()
            let dead = result.deadFunctions || []
            if (moduleId) dead = dead.filter(f => f.moduleId === moduleId)
            if (!includeExported) dead = dead.filter(f => !(f as any).isExported)
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
                ;(acc[mid] = acc[mid] || []).push(f)
                return acc
            }, {})
            return {
                content: [{
                    type: 'text' as const, text: JSON.stringify({
                        summary: {
                            totalFunctions: Object.keys(lock.functions).length,
                            deadCount: dead.length,
                            deadPercent: Math.round((dead.length / Object.keys(lock.functions).length) * 100),
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
        },
    )

        // ── mikk_get_complexity ──────────────────────────────────────────────────
        ; (server as any).tool(
            'mikk_get_complexity',
            'Get cyclomatic complexity data for functions above a threshold — identifies technical debt and refactoring candidates. Returns distribution (critical ≥20, high ≥15, medium ≥10) with per-function breakdown. WHEN TO USE: Before refactoring or to prioritize technical debt.',
            {
                moduleId: z.string().optional(),
                minComplexity: z.number().optional().default(5).describe('Minimum complexity to include (default: 5)'),
                limit: z.number().optional().default(30),
            },
            async (args: any): Promise<any> => {
                const { moduleId, minComplexity, limit } = args as any
                const { lock, staleness } = await loadContractAndLock(projectRoot)
                const allFunctions = Object.values(lock.functions)
                    .filter(f => ((f as any).complexity || 1) >= minComplexity)
                    .filter(f => !moduleId || f.moduleId === moduleId)
                    .sort((a, b) => ((b as any).complexity || 1) - ((a as any).complexity || 1))
                    .slice(0, limit)
                const total = Object.keys(lock.functions).length
                return {
                    content: [{
                        type: 'text' as const, text: JSON.stringify({
                            summary: {
                                totalAnalyzed: total,
                                overThreshold: allFunctions.length,
                                distribution: {
                                    critical: allFunctions.filter(f => ((f as any).complexity || 1) >= 20).length,
                                    high: allFunctions.filter(f => { const c = (f as any).complexity || 1; return c >= 15 && c < 20 }).length,
                                    medium: allFunctions.filter(f => { const c = (f as any).complexity || 1; return c >= 10 && c < 15 }).length,
                                    low: allFunctions.filter(f => { const c = (f as any).complexity || 1; return c >= minComplexity && c < 10 }).length,
                                },
                            },
                            functions: allFunctions.map(f => ({
                                name: f.name, file: f.file, module: f.moduleId,
                                complexity: (f as any).complexity || 1,
                                lines: f.endLine - f.startLine + 1,
                                isExported: f.isExported,
                                errorHandlingCount: ((f as any).errorHandling || []).length,
                                purpose: f.purpose,
                            })),
                            warning: staleness,
                            hint: 'Functions with complexity ≥15 are prime refactoring candidates. Use mikk_get_function_detail to review before splitting.',
                        }, null, 2)
                    }]
                }
            },
        )
}
