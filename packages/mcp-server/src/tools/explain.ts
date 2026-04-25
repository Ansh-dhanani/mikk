/**
 * explain.ts — "explain_codebase" MCP tool.
 *
 * One tool call that gives an AI agent everything it needs to start working:
 *   • language + detected frameworks
 *   • entry points
 *   • API surface (routes + handlers) by semantic role
 *   • data models
 *   • module map
 *   • top exported APIs
 *   • key config files
 *
 * Uses SemanticRoleClassifier from @getmikk/core — no LLM, fully static.
 */

import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { SemanticRoleClassifier } from '@getmikk/core'
import type { SemanticRole } from '@getmikk/core'
import { loadContractAndLock, _track, _tok } from './shared.js'

// ─── Framework detection from lock context files ──────────────────────────────

function detectFrameworks(contextFiles: string[]): string[] {
    const frameworks = new Set<string>()
    const rules: [RegExp, string][] = [
        [/next\.config/, 'Next.js'],
        [/nuxt\.config/, 'Nuxt'],
        [/svelte\.config/, 'SvelteKit'],
        [/astro\.config/, 'Astro'],
        [/remix\.config/, 'Remix'],
        [/vite\.config/, 'Vite'],
        [/angular\.json/, 'Angular'],
        [/nest-cli\.json/, 'NestJS'],
        [/express/, 'Express'],
        [/fastify/, 'Fastify'],
        [/hono/, 'Hono'],
        [/django/, 'Django'],
        [/flask/, 'Flask'],
        [/fastapi/, 'FastAPI'],
        [/spring/, 'Spring'],
        [/rails/, 'Rails'],
        [/laravel/, 'Laravel'],
        [/gin\.go|echo\.go/, 'Go HTTP'],
        [/actix|axum/, 'Rust Web'],
    ]
    for (const cf of contextFiles) {
        const normalized = cf.toLowerCase().replace(/\\/g, '/')
        for (const [pattern, name] of rules) {
            if (pattern.test(normalized)) frameworks.add(name)
        }
    }
    return [...frameworks]
}

// ─── Group functions by role ──────────────────────────────────────────────────

interface RoleGroup {
    role: SemanticRole
    count: number
    examples: Array<{ name: string; file: string; id: string }>
}

// ─── Register tool ────────────────────────────────────────────────────────────

export function registerExplainTools(server: McpServer, projectRoot: string) {
    server.tool(
        'mikk_explain_codebase',
        [
            'COMPREHENSIVE CODEBASE OVERVIEW — best first tool for a new task.',
            'Returns in ONE call:',
            '  • Primary language + detected frameworks',
            '  • Entry points (main, bootstrap, server start)',
            '  • API surface: routes, HTTP handlers, middleware',
            '  • Data layer: models, schemas, repositories',
            '  • Module map with function counts',
            '  • Top exported APIs',
            '  • Key config files',
            'After this call you know WHERE to look — use mikk_query_context or mikk_read_function for details.',
        ].join('\n'),
        { projectRoot: z.string().optional() },
        async (args: any): Promise<any> => {
            const effectiveRoot = (args as any)?.projectRoot || projectRoot
            const { contract, lock, staleness } = await loadContractAndLock(effectiveRoot)

            // ── 1. Files and context files ────────────────────────────────────
            const lockFiles = Object.keys(lock.files)
            // lock.contextFiles is Array<{path, type, size}>, not string[].
            // Extract .path strings for framework detection.
            const rawContextFiles: any[] = (lock as any).contextFiles ?? []
            const contextFilePaths: string[] = rawContextFiles.map((cf: any) =>
                typeof cf === 'string' ? cf : (cf?.path ?? '')
            ).filter(Boolean)
            const frameworks = detectFrameworks([...lockFiles, ...contextFilePaths])

            // ── 2. Semantic role classification ───────────────────────────────
            const classifier = new SemanticRoleClassifier()

            // We classify by file paths only (no re-parsing needed — lock has all data)
            const fileRoles = new Map<string, ReturnType<typeof classifier.classifyFile>>()
            for (const fp of lockFiles) {
                fileRoles.set(fp, classifier.classifyFile(fp))
            }

            // ── 3. Function role groups ───────────────────────────────────────
            const roleGroups = new Map<SemanticRole, RoleGroup>()
            const MAX_EXAMPLES = 6

            for (const [id, fn] of Object.entries(lock.functions)) {
                const fileRole = fileRoles.get(fn.file)
                // Use file role as the primary signal (it's higher precision)
                const role: SemanticRole = fileRole && fileRole.role !== 'unknown'
                    ? fileRole.role
                    : 'unknown'

                if (!roleGroups.has(role)) {
                    roleGroups.set(role, { role, count: 0, examples: [] })
                }
                const group = roleGroups.get(role)!
                group.count++
                if (group.examples.length < MAX_EXAMPLES) {
                    group.examples.push({ name: fn.name, file: fn.file, id })
                }
            }

            // ── 4. Entry points ───────────────────────────────────────────────
            const entryPoints: Array<{ name: string; file: string }> = []
            const ENTRY_NAMES = /^(main|bootstrap|start|serve|listen|run|init|createApp|createServer)$/i
            for (const [id, fn] of Object.entries(lock.functions)) {
                if (ENTRY_NAMES.test(fn.name) || fn.file.match(/\/(index|main|app|server|bootstrap)\.[jt]sx?$/)) {
                    entryPoints.push({ name: fn.name, file: fn.file })
                }
            }
            // deduplicate by file
            const seenEntryFiles = new Set<string>()
            const dedupedEntryPoints = entryPoints.filter(e => {
                if (seenEntryFiles.has(e.file)) return false
                seenEntryFiles.add(e.file)
                return true
            })

            // ── 5. API surface ────────────────────────────────────────────────
            const apiRoutes: Array<{ method?: string; path?: string; handler: string; file: string }> =
                (lock.routes ?? []).map((r: any) => ({
                    method: r.method,
                    path: r.path,
                    handler: r.handler,
                    file: r.file,
                }))

            const apiHandlerGroup = roleGroups.get('api-handler')
            const routeGroup = roleGroups.get('route')

            // ── 6. Data layer ─────────────────────────────────────────────────
            const modelFiles = lockFiles.filter(fp => {
                const role = fileRoles.get(fp)?.role
                return role === 'model' || role === 'schema' || role === 'dto'
            })

            // ── 7. Module map ─────────────────────────────────────────────────
            const moduleMap = contract.declared.modules.map(mod => {
                const fns = Object.values(lock.functions).filter(f => f.moduleId === mod.id)
                const exported = fns.filter(f => f.isExported).length
                return {
                    id: mod.id,
                    name: mod.name,
                    description: mod.description,
                    totalFunctions: fns.length,
                    exportedFunctions: exported,
                }
            })

            // ── 8. Top exported APIs ──────────────────────────────────────────
            const topExported = Object.entries(lock.functions)
                .filter(([, fn]) => fn.isExported)
                .slice(0, 20)
                .map(([id, fn]) => ({
                    name: fn.name,
                    file: fn.file,
                    moduleId: fn.moduleId,
                    id,
                }))

            // ── 9. Interesting config/context files ───────────────────────────
            const configFiles = lockFiles
                .filter(fp => {
                    const r = fileRoles.get(fp)?.role
                    return r === 'config' || fp.match(/\.(json|yaml|yml|toml|env)$/)
                })
                .slice(0, 10)

            // ── Build response ────────────────────────────────────────────────
            const totalFunctions = Object.keys(lock.functions).length
            const classifiedCount = [...roleGroups.values()].reduce((s, g) => s + (g.role !== 'unknown' ? g.count : 0), 0)

            const response = {
                project: {
                    name: contract.project.name,
                    description: contract.project.description,
                    language: contract.project.language,
                    frameworks,
                    totalFiles: lockFiles.length,
                    totalFunctions,
                    classifiedFunctions: classifiedCount,
                    classificationCoverage: `${Math.round((classifiedCount / Math.max(1, totalFunctions)) * 100)}%`,
                },
                entryPoints: dedupedEntryPoints.slice(0, 8),
                apiSurface: {
                    explicitRoutes: apiRoutes.slice(0, 20),
                    routeFiles: routeGroup?.examples ?? [],
                    handlerFiles: apiHandlerGroup?.examples ?? [],
                    totalRouteFiles: routeGroup?.count ?? 0,
                    totalHandlerFiles: apiHandlerGroup?.count ?? 0,
                },
                dataLayer: {
                    modelFiles: modelFiles.slice(0, 12),
                    modelGroup: roleGroups.get('model')?.examples ?? [],
                    schemaGroup: roleGroups.get('schema')?.examples ?? [],
                    repositoryGroup: roleGroups.get('repository')?.examples ?? [],
                },
                architecture: {
                    modules: moduleMap,
                    roleBreakdown: [...roleGroups.values()]
                        .filter(g => g.role !== 'unknown')
                        .sort((a, b) => b.count - a.count)
                        .map(g => ({ role: g.role, count: g.count, exampleFiles: [...new Set(g.examples.map(e => e.file))].slice(0, 3) })),
                },
                topExportedAPIs: topExported,
                configFiles,
                warning: staleness,
                hint: [
                    'Use mikk_query_context("your task") to get task-scoped context.',
                    'Use mikk_read_function(id) to read a specific function body.',
                    'Use mikk_get_blast_radius(functionId) before editing.',
                ].join(' | '),
            }

            const rawEst = Math.round(lockFiles.length * 25)
                ; (response as any).tokens = _track(effectiveRoot, rawEst, response)
            return { content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }] }
        },
    )

    // ── Bonus: classify a single file path ────────────────────────────────────
    server.tool(
        'mikk_classify_file',
        'Classify the semantic role of a file path (route, api-handler, model, test, etc.) without reading it. Instant — no parsing needed.',
        {
            filePath: z.string().describe('Relative or absolute file path to classify'),
            projectRoot: z.string().optional()
        },
        async ({ filePath, projectRoot: argRoot }: { filePath: string, projectRoot?: string }) => {
            const effectiveRoot = argRoot || projectRoot
            const classifier = new SemanticRoleClassifier()
            const normalized = path.isAbsolute(filePath)
                ? path.relative(effectiveRoot, filePath).replace(/\\/g, '/')
                : filePath.replace(/\\/g, '/')

            const result = classifier.classifyFile(normalized)
            return {
                content: [{
                    type: 'text' as const,
                    text: JSON.stringify({
                        file: normalized,
                        role: result.role,
                        framework: result.framework,
                        confidence: result.confidence,
                        isDeadCodeExempt: ['route', 'api-handler', 'middleware', 'entry-point', 'test', 'migration', 'seed', 'script'].includes(result.role),
                        hint: result.role === 'unknown' ? 'Role could not be determined. Check filename conventions.' : `This file is classified as "${result.role}" with ${Math.round(result.confidence * 100)}% confidence.`,
                    }, null, 2),
                }],
            }
        },
    )
}
