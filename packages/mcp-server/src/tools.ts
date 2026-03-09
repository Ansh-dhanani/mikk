import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
    ContractReader, LockReader,
    ImpactAnalyzer, DeadCodeDetector, AdrManager,
    type MikkContract, type MikkLock,
    type DependencyGraph, type GraphNode, type GraphEdge,
} from '@getmikk/core'
import { ContextBuilder, getProvider } from '@getmikk/ai-context'
import { SemanticSearcher } from '@getmikk/intent-engine'
import type { ContextQuery } from '@getmikk/ai-context'

// Singleton per projectRoot — pipeline load is ~1-2s, must not repeat per request
const semanticSearchers = new Map<string, SemanticSearcher>()
function getSemanticSearcher(projectRoot: string): SemanticSearcher {
    let s = semanticSearchers.get(projectRoot)
    if (!s) {
        s = new SemanticSearcher(projectRoot)
        semanticSearchers.set(projectRoot, s)
    }
    return s
}

/**
 * Register all MCP tools — actions an AI assistant can invoke.
 */
export function registerTools(server: McpServer, projectRoot: string) {

    // ─────────────────────────────────────────────────────────────────────
    // TOOL: mikk_get_project_overview
    // ─────────────────────────────────────────────────────────────────────
    server.tool(
        'mikk_get_project_overview',
        'Get a high-level overview of the project: modules, function counts, file counts, tech stack',
        {},
        async () => {
            const { contract, lock, staleness } = await loadContractAndLock(projectRoot)

            const modules = contract.declared.modules.map(mod => {
                const fns = Object.values(lock.functions).filter(f => f.moduleId === mod.id)
                const files = Object.values(lock.files).filter(f => f.moduleId === mod.id)
                return {
                    id: mod.id,
                    name: mod.name,
                    description: mod.description,
                    functions: fns.length,
                    files: files.length,
                    exported: fns.filter(f => f.isExported).length,
                }
            })

            const overview = {
                project: contract.project,
                totalFunctions: Object.keys(lock.functions).length,
                totalFiles: Object.keys(lock.files).length,
                totalModules: modules.length,
                modules,
                constraints: contract.declared.constraints,
                decisions: contract.declared.decisions,
                warning: staleness,
                hint: 'Next: Use mikk_query_context with your task description, or mikk_list_modules to explore the architecture.',
            }

            return { content: [{ type: 'text' as const, text: JSON.stringify(overview, null, 2) }] }
        },
    )

    // ─────────────────────────────────────────────────────────────────────
    // TOOL: mikk_query_context
    // ─────────────────────────────────────────────────────────────────────
    server.tool(
        'mikk_query_context',
        'Ask an architecture question — returns graph-traced context with relevant functions, files, and call chains. Use this to understand how code flows through the project.',
        {
            question: z.string().describe('The architecture question or task description'),
            maxHops: z.number().optional().default(4).describe('Graph traversal depth (default: 4)'),
            tokenBudget: z.number().optional().default(6000).describe('Max tokens for function bodies (default: 6000)'),
            focusFile: z.string().optional().describe('Anchor traversal from a specific file path'),
            focusModule: z.string().optional().describe('Anchor traversal from a specific module ID'),
            provider: z.enum(['claude', 'generic', 'compact']).optional().default('generic').describe('AI provider format: claude (XML tags), generic (plain), compact (minimal tokens)'),
        },
        async ({ question, maxHops, tokenBudget, focusFile, focusModule, provider }) => {
            const { contract, lock, staleness } = await loadContractAndLock(projectRoot)

            const query: ContextQuery = {
                task: question,
                maxHops,
                tokenBudget,
                focusFiles: focusFile ? [focusFile] : undefined,
                focusModules: focusModule ? [focusModule] : undefined,
                includeCallGraph: true,
                includeBodies: true,
                projectRoot,
            }

            const builder = new ContextBuilder(contract, lock)
            const ctx = builder.build(query)

            if (ctx.modules.length === 0) {
                return {
                    content: [{
                        type: 'text' as const,
                        text: `No context found for "${question}". ${focusFile
                                ? `The file "${focusFile}" may not exist in the lock.`
                                : 'The project may have no analyzed functions.'
                            } Run \`mikk analyze\` or check the file path.`,
                    }],
                    isError: true,
                }
            }

            const formatter = getProvider(provider ?? 'generic')
            const output = formatter.formatContext(ctx)
            const warning = staleness ? `\n\n${staleness}` : ''

            return {
                content: [{ type: 'text' as const, text: output + warning + '\n\n---\nHint: Use mikk_before_edit on any files you plan to modify, then mikk_impact_analysis to see the full blast radius.' }],
            }
        },
    )

    // ─────────────────────────────────────────────────────────────────────
    // TOOL: mikk_impact_analysis
    // ─────────────────────────────────────────────────────────────────────
    server.tool(
        'mikk_impact_analysis',
        'Analyze the blast radius of changing a specific file. Returns which functions and modules would be impacted.',
        {
            file: z.string().describe('The file path (relative to project root) to analyze impact for'),
        },
        async ({ file }) => {
            const { lock, staleness } = await loadContractAndLock(projectRoot)
            const graph = buildGraphFromLock(lock)
            const analyzer = new ImpactAnalyzer(graph)

            const normalizedFile = file.replace(/\\/g, '/')
            let fileNodes = [...graph.nodes.values()].filter(n => n.file === normalizedFile)

            if (fileNodes.length === 0) {
                const basename = normalizedFile.split('/').pop() || normalizedFile
                fileNodes = [...graph.nodes.values()].filter(n => {
                    const nodeName = n.file.split('/').pop() || n.file
                    return nodeName === basename
                })
            }

            if (fileNodes.length === 0) {
                return {
                    content: [{ type: 'text' as const, text: `No functions found in "${file}". Use mikk_search_functions to look up the correct path, or mikk_list_modules to explore by module.` }],
                    isError: true,
                }
            }

            const result = analyzer.analyze(fileNodes.map(n => n.id))

            const impactedDetails = result.impacted.slice(0, 30).map(id => {
                const node = graph.nodes.get(id)
                return { function: node?.label ?? id, file: node?.file ?? '', module: node?.moduleId ?? '' }
            })

            const response = {
                file,
                changedNodes: result.changed.length,
                impactedNodes: result.impacted.length,
                depth: result.depth,
                confidence: result.confidence,
                classified: {
                    critical: result.classified.critical.length,
                    high: result.classified.high.length,
                    medium: result.classified.medium.length,
                    low: result.classified.low.length,
                    criticalItems: result.classified.critical.slice(0, 10),
                    highItems: result.classified.high.slice(0, 10),
                },
                impacted: impactedDetails,
                truncated: result.impacted.length > 30,
                warning: staleness,
                hint: 'Next: Use mikk_get_function_detail on critical/high items to review them. Then mikk_before_edit to validate your planned changes.',
            }

            return { content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }] }
        },
    )

    // ─────────────────────────────────────────────────────────────────────
    // TOOL: mikk_before_edit
    // ─────────────────────────────────────────────────────────────────────
    server.tool(
        'mikk_before_edit',
        'Call this BEFORE editing any file. Returns the blast radius (what depends on this file), exported functions at risk, and architectural constraints that apply. This is your safety check.',
        {
            files: z.array(z.string()).describe('The file paths (relative to project root) you are about to edit'),
        },
        async ({ files: filesToEdit }) => {
            const { contract, lock, staleness } = await loadContractAndLock(projectRoot)
            const graph = buildGraphFromLock(lock)
            const analyzer = new ImpactAnalyzer(graph)

            const fileReports: Record<string, any> = {}

            for (const file of filesToEdit) {
                // Normalize: backslashes → forward slash, strip leading ./
                const normalizedFile = file.replace(/\\/g, '/').replace(/^\.\//, '')

                // Functions defined in this file
                const fileFns = Object.values(lock.functions).filter(
                    fn => fn.file === normalizedFile || fn.file.endsWith('/' + normalizedFile),
                )

                if (fileFns.length === 0) {
                    fileReports[file] = {
                        warning: 'No tracked functions found in this file. Run `mikk analyze` to update the lock, or use mikk_search_functions to verify the file path.',
                    }
                    continue
                }

                // Impact analysis
                const result = analyzer.analyze(fileFns.map(fn => fn.id))
                const impactedDetails = result.impacted.slice(0, 20).map(id => {
                    const node = graph.nodes.get(id)
                    return { function: node?.label ?? id, file: node?.file ?? '', module: node?.moduleId ?? '' }
                })

                // Exported functions being changed (callers outside this file are at risk)
                const exportedAtRisk = fileFns.filter(fn => fn.isExported).map(fn => ({
                    name: fn.name,
                    calledBy: fn.calledBy.map(id => lock.functions[id]?.name).filter(Boolean),
                }))

                // Constraints are project-wide architectural rules (plain strings)
                const constraints = contract.declared.constraints

                fileReports[file] = {
                    functionsInFile: fileFns.map(fn => fn.name),
                    exportedAtRisk,
                    impactedNodes: result.impacted.length,
                    depth: result.depth,
                    confidence: result.confidence,
                    impacted: impactedDetails,
                    truncated: result.impacted.length > 20,
                    constraints,
                }
            }

            const totalImpact = Object.values(fileReports)
                .filter(r => typeof r.impactedNodes === 'number')
                .reduce((sum, r) => sum + r.impactedNodes, 0)

            const response = {
                summary: `Editing ${filesToEdit.length} file(s). Estimated blast radius: ${totalImpact} dependent node(s) across the codebase.`,
                files: fileReports,
                warning: staleness,
                hint: 'Next: If safe, proceed with your edits. If violations appear, use mikk_get_constraints for full context on the rules.',
            }

            return { content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }] }
        },
    )

    // ─────────────────────────────────────────────────────────────────────
    // TOOL: mikk_list_modules
    // ─────────────────────────────────────────────────────────────────────
    server.tool(
        'mikk_list_modules',
        'List all declared modules with their file/function counts and descriptions',
        {},
        async () => {
            const { contract, lock, staleness } = await loadContractAndLock(projectRoot)

            const modules = contract.declared.modules.map(mod => {
                const fns = Object.values(lock.functions).filter(f => f.moduleId === mod.id)
                const files = Object.values(lock.files).filter(f => f.moduleId === mod.id)
                return {
                    id: mod.id,
                    name: mod.name,
                    description: mod.description,
                    paths: mod.paths,
                    functions: fns.length,
                    files: files.length,
                    entryFunctions: mod.entryFunctions ?? [],
                }
            })

            const response = {
                modules,
                warning: staleness,
            }

            return { content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }] }
        },
    )

    // ─────────────────────────────────────────────────────────────────────
    // TOOL: mikk_get_module_detail
    // ─────────────────────────────────────────────────────────────────────
    server.tool(
        'mikk_get_module_detail',
        'Get detailed information about a specific module: its functions, files, exported API, and internal call graph',
        {
            moduleId: z.string().describe('The module ID (e.g., "packages-core", "lib-auth")'),
        },
        async ({ moduleId }) => {
            const { contract, lock, staleness } = await loadContractAndLock(projectRoot)
            const mod = contract.declared.modules.find(m => m.id === moduleId)

            if (!mod) {
                return {
                    content: [{ type: 'text' as const, text: `Module "${moduleId}" not found. Use mikk_list_modules to see available modules.` }],
                    isError: true,
                }
            }

            const fns = Object.values(lock.functions).filter(f => f.moduleId === moduleId)
            const files = Object.values(lock.files).filter(f => f.moduleId === moduleId)

            const detail = {
                module: mod,
                files: files.map(f => ({ path: f.path, imports: f.imports })),
                functions: fns.map(f => ({
                    name: f.name,
                    file: f.file,
                    startLine: f.startLine,
                    endLine: f.endLine,
                    isExported: f.isExported,
                    isAsync: f.isAsync,
                    params: f.params,
                    returnType: f.returnType,
                    calls: f.calls.map(id => lock.functions[id]?.name).filter(Boolean),
                    calledBy: f.calledBy.map(id => lock.functions[id]?.name).filter(Boolean),
                })),
                exported: fns.filter(f => f.isExported).map(f => f.name),
                internal: fns.filter(f => !f.isExported).map(f => f.name),
                warning: staleness,
            }

            return { content: [{ type: 'text' as const, text: JSON.stringify(detail, null, 2) }] }
        },
    )

    // ─────────────────────────────────────────────────────────────────────
    // TOOL: mikk_get_function_detail
    // ─────────────────────────────────────────────────────────────────────
    server.tool(
        'mikk_get_function_detail',
        'Get detailed info about a specific function by name: params, return type, call graph, error handling, etc.',
        {
            name: z.string().describe('Function name to search for (e.g., "parseFiles", "GraphBuilder.build")'),
        },
        async ({ name }) => {
            const { lock, staleness } = await loadContractAndLock(projectRoot)

            const matches = Object.values(lock.functions).filter(
                f => f.name === name || f.name.endsWith(`.${name}`) || f.id.includes(name),
            )

            if (matches.length === 0) {
                return {
                    content: [{ type: 'text' as const, text: `No function matching "${name}" found.` }],
                    isError: true,
                }
            }

            const results = await Promise.all(matches.map(async fn => {
                let body: string | undefined
                try {
                    const absPath = path.isAbsolute(fn.file)
                        ? fn.file
                        : path.join(projectRoot, fn.file)
                    const fileContent = await fs.readFile(absPath, 'utf-8')
                    const lines = fileContent.split('\n')
                    body = lines.slice(fn.startLine - 1, fn.endLine).join('\n')
                } catch { /* non-fatal — body may not be available */ }

                return {
                    id: fn.id,
                    name: fn.name,
                    file: fn.file,
                    lines: `${fn.startLine}-${fn.endLine}`,
                    module: fn.moduleId,
                    isExported: fn.isExported,
                    isAsync: fn.isAsync,
                    params: fn.params,
                    returnType: fn.returnType,
                    purpose: fn.purpose,
                    body,
                    calls: fn.calls.map(id => lock.functions[id]?.name).filter(Boolean),
                    calledBy: fn.calledBy.map(id => lock.functions[id]?.name).filter(Boolean),
                    errorHandling: fn.errorHandling,
                    edgeCases: fn.edgeCasesHandled,
                    warning: staleness,
                }
            }))

            return { content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }] }
        },
    )

    // ─────────────────────────────────────────────────────────────────────
    // TOOL: mikk_search_functions
    // ─────────────────────────────────────────────────────────────────────
    server.tool(
        'mikk_search_functions',
        'Search for functions by name pattern (substring match). Returns matching function names, files, and modules.',
        {
            query: z.string().describe('Search query — matched against function names (case-insensitive)'),
            limit: z.number().optional().default(20).describe('Max results to return (default: 20)'),
        },
        async ({ query, limit }) => {
            const { lock, staleness } = await loadContractAndLock(projectRoot)
            const queryLower = query.toLowerCase()

            const matches = Object.values(lock.functions)
                .filter(fn => fn.name.toLowerCase().includes(queryLower) || fn.id.toLowerCase().includes(queryLower))
                .slice(0, limit)
                .map(fn => ({
                    name: fn.name,
                    file: fn.file,
                    module: fn.moduleId,
                    exported: fn.isExported,
                    lines: `${fn.startLine}-${fn.endLine}`,
                }))

            if (matches.length === 0) {
                return { content: [{ type: 'text' as const, text: `No functions matching "${query}" found.` }] }
            }

            const response = {
                matches,
                warning: staleness,
            }

            return { content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }] }
        },
    )

    // ─────────────────────────────────────────────────────────────────────
    // TOOL: mikk_semantic_search
    // ─────────────────────────────────────────────────────────────────────
    server.tool(
        'mikk_semantic_search',
        'Find functions by meaning, not by name. Uses local vector embeddings (Xenova/all-MiniLM-L6-v2) to rank functions by semantic similarity to a natural-language query. Requires @xenova/transformers to be installed.',
        {
            query: z.string().describe('Natural-language description of what you are looking for (e.g. "validate a JWT token", "send an email notification")'),
            topK: z.number().optional().default(10).describe('Number of results to return (default: 10)'),
        },
        async ({ query, topK }) => {
            // Fail fast if @xenova/transformers is not installed
            const available = await SemanticSearcher.isAvailable()
            if (!available) {
                return {
                    content: [{
                        type: 'text' as const,
                        text: [
                            '❌ Semantic search requires @xenova/transformers.',
                            '',
                            'Install it in your project root:',
                            '  npm install @xenova/transformers',
                            '  # or: pnpm add @xenova/transformers',
                            '',
                            'Tip: mikk_search_functions works right now for exact keyword search.',
                        ].join('\n'),
                    }],
                    isError: true,
                }
            }

            const { lock, staleness } = await loadContractAndLock(projectRoot)
            const searcher = getSemanticSearcher(projectRoot)

            // index() is cheap on cache hit (~1ms disk read)
            await searcher.index(lock)
            const matches = await searcher.search(query, lock, topK)

            const response = {
                query,
                method: 'semantic (vector similarity)',
                model: SemanticSearcher.MODEL,
                matches,
                tip: 'Use mikk_search_functions for exact substring search instead.',
                warning: staleness,
            }

            return { content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }] }
        },
    )

    // ─────────────────────────────────────────────────────────────────────
    // TOOL: mikk_get_constraints
    // ─────────────────────────────────────────────────────────────────────
    server.tool(
        'mikk_get_constraints',
        'Get all declared architectural constraints and design decisions for this project',
        {},
        async () => {
            const { contract, staleness } = await loadContractAndLock(projectRoot)

            const result = {
                constraints: contract.declared.constraints,
                decisions: contract.declared.decisions,
                overwrite: contract.overwrite,
                warning: staleness,
            }

            return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
        },
    )

    // ─────────────────────────────────────────────────────────────────────
    // TOOL: mikk_get_file
    // ─────────────────────────────────────────────────────────────────────
    server.tool(
        'mikk_get_file',
        'Read the raw source content of any file in the project. Use this to see the actual code before editing.',
        {
            file: z.string().describe('File path relative to project root (e.g., "src/auth/verify.ts")'),
        },
        async ({ file }) => {
            try {
                const absPath = path.isAbsolute(file) ? file : path.join(projectRoot, file)

                // Guard against path traversal (e.g. ../../etc/passwd)
                const resolved = path.resolve(absPath)
                const rootResolved = path.resolve(projectRoot)
                if (!resolved.startsWith(rootResolved + path.sep) && resolved !== rootResolved) {
                    return {
                        content: [{ type: 'text' as const, text: `Access denied: "${file}" is outside the project root.` }],
                        isError: true,
                    }
                }

                const content = await fs.readFile(resolved, 'utf-8')
                const lineCount = content.split('\n').length
                return {
                    content: [{
                        type: 'text' as const,
                        text: `// ${file} (${lineCount} lines)\n${content}`,
                    }],
                }
            } catch (err: any) {
                return {
                    content: [{ type: 'text' as const, text: `Cannot read "${file}": ${err.message}. Use mikk_search_functions to find the correct path.` }],
                    isError: true,
                }
            }
        },
    )

    // ─────────────────────────────────────────────────────────────────────
    // TOOL: mikk_find_usages
    // ─────────────────────────────────────────────────────────────────────
    server.tool(
        'mikk_find_usages',
        'Find everything that calls a specific function. Essential before renaming or changing a function signature.',
        {
            name: z.string().describe('Function name to find callers of'),
        },
        async ({ name }) => {
            const { lock, staleness } = await loadContractAndLock(projectRoot)

            const fn = Object.values(lock.functions).find(
                f => f.name === name || f.name.endsWith(`.${name}`) || f.id.includes(name),
            )

            if (!fn) {
                return {
                    content: [{ type: 'text' as const, text: `Function "${name}" not found. Use mikk_search_functions to verify the name.` }],
                    isError: true,
                }
            }

            const usages = fn.calledBy
                .map(id => lock.functions[id])
                .filter(Boolean)
                .map(caller => ({
                    name: caller.name,
                    file: caller.file,
                    module: caller.moduleId,
                    line: caller.startLine,
                }))

            const response = {
                function: fn.name,
                file: fn.file,
                module: fn.moduleId,
                usageCount: usages.length,
                usages,
                warning: staleness,
            }

            return { content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }] }
        },
    )

    // ─────────────────────────────────────────────────────────────────────
    // TOOL: mikk_get_routes
    // ─────────────────────────────────────────────────────────────────────
    server.tool(
        'mikk_get_routes',
        'Get all detected HTTP routes (Express/Koa/Hono style) with their methods, paths, handlers, and middlewares',
        {},
        async () => {
            const { lock, staleness } = await loadContractAndLock(projectRoot)
            const routes = lock.routes ?? []

            if (routes.length === 0) {
                return { content: [{ type: 'text' as const, text: 'No HTTP routes detected in this project.' }] }
            }

            const response = {
                routes,
                warning: staleness,
            }

            return { content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }] }
        },
    )

    // ─────────────────────────────────────────────────────────────────────
    // TOOL: mikk_dead_code
    // ─────────────────────────────────────────────────────────────────────
    server.tool(
        'mikk_dead_code',
        'Detect dead code — functions with zero callers after exempting exports, entry points, route handlers, tests, and constructors. Use this before refactoring or cleanup.',
        {
            moduleId: z.string().optional().describe('Filter results to a specific module ID'),
        },
        async ({ moduleId }) => {
            const { lock, staleness } = await loadContractAndLock(projectRoot)
            const graph = buildGraphFromLock(lock)
            const detector = new DeadCodeDetector(graph, lock)
            const result = detector.detect()

            const filtered = moduleId
                ? {
                    ...result,
                    deadFunctions: result.deadFunctions.filter(f => f.moduleId === moduleId),
                    deadCount: result.deadFunctions.filter(f => f.moduleId === moduleId).length,
                    byModule: { [moduleId]: result.byModule[moduleId] ?? { dead: 0, total: 0, items: [] } },
                }
                : result

            const response = {
                ...filtered,
                warning: staleness,
                hint: 'Next: Review dead functions and consider removing them. Use mikk_get_function_detail on any function to see its full context before removing.',
            }

            return { content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }] }
        },
    )

    // ─────────────────────────────────────────────────────────────────────
    // TOOL: mikk_manage_adr
    // ─────────────────────────────────────────────────────────────────────
    server.tool(
        'mikk_manage_adr',
        'Manage Architectural Decision Records (ADRs) in mikk.json. Actions: list, get, add, update, remove. ADRs document WHY architectural constraints exist.',
        {
            action: z.enum(['list', 'get', 'add', 'update', 'remove']).describe('The CRUD action to perform'),
            id: z.string().optional().describe('ADR id (required for get, update, remove)'),
            title: z.string().optional().describe('ADR title (required for add)'),
            reason: z.string().optional().describe('ADR reason/description (required for add)'),
            date: z.string().optional().describe('ADR date string (defaults to today for add)'),
        },
        async ({ action, id, title, reason, date }) => {
            const contractPath = path.join(projectRoot, 'mikk.json')
            const manager = new AdrManager(contractPath)

            try {
                switch (action) {
                    case 'list': {
                        const decisions = await manager.list()
                        return {
                            content: [{
                                type: 'text' as const, text: JSON.stringify({
                                    decisions,
                                    count: decisions.length,
                                    hint: 'Next: Use "get" with an ADR id for details, or "add" to create a new decision.',
                                }, null, 2)
                            }],
                        }
                    }
                    case 'get': {
                        if (!id) return { content: [{ type: 'text' as const, text: 'Error: "id" is required for get action.' }], isError: true }
                        const decision = await manager.get(id)
                        if (!decision) return { content: [{ type: 'text' as const, text: `ADR "${id}" not found.` }], isError: true }
                        return { content: [{ type: 'text' as const, text: JSON.stringify(decision, null, 2) }] }
                    }
                    case 'add': {
                        if (!id || !title || !reason) {
                            return { content: [{ type: 'text' as const, text: 'Error: "id", "title", and "reason" are required for add action.' }], isError: true }
                        }
                        await manager.add({ id, title, reason, date: date ?? new Date().toISOString().split('T')[0] })
                        return { content: [{ type: 'text' as const, text: `ADR "${id}" added to mikk.json. This decision will now surface in all AI context queries.` }] }
                    }
                    case 'update': {
                        if (!id) return { content: [{ type: 'text' as const, text: 'Error: "id" is required for update action.' }], isError: true }
                        await manager.update(id, { ...(title ? { title } : {}), ...(reason ? { reason } : {}), ...(date ? { date } : {}) })
                        return { content: [{ type: 'text' as const, text: `ADR "${id}" updated.` }] }
                    }
                    case 'remove': {
                        if (!id) return { content: [{ type: 'text' as const, text: 'Error: "id" is required for remove action.' }], isError: true }
                        const removed = await manager.remove(id)
                        return { content: [{ type: 'text' as const, text: removed ? `ADR "${id}" removed.` : `ADR "${id}" not found.` }] }
                    }
                }
            } catch (err: any) {
                return { content: [{ type: 'text' as const, text: `ADR operation failed: ${err.message}` }], isError: true }
            }
        },
    )
}

/** Helper — read contract + lock from disk, and surface staleness warning if lock is drifted/conflicted */
async function loadContractAndLock(projectRoot: string) {
    const contractReader = new ContractReader()
    const lockReader = new LockReader()
    const contract = await contractReader.read(path.join(projectRoot, 'mikk.json'))
    const lock = await lockReader.read(path.join(projectRoot, 'mikk.lock.json'))
    const syncStatus = lock.syncState?.status ?? 'unknown'
    const isStale = syncStatus === 'drifted' || syncStatus === 'conflict'
    const staleness = isStale
        ? `⚠️ Lock file is ${syncStatus}. Run \`mikk analyze\` for accurate results.`
        : null
    return { contract, lock, staleness }
}

/**
 * Build a DependencyGraph from the lock file in O(n) time.
 * This is used by mikk_impact_analysis and mikk_before_edit instead of the
 * expensive discoverFiles + parseFiles + GraphBuilder.build pipeline (4-8s).
 * The lock already has fn.calls and fn.calledBy arrays — we just wire them up.
 */
function buildGraphFromLock(lock: MikkLock): DependencyGraph {
    const nodes = new Map<string, GraphNode>()
    const edges: GraphEdge[] = []
    const outEdges = new Map<string, GraphEdge[]>()
    const inEdges = new Map<string, GraphEdge[]>()

    // Add function nodes
    for (const fn of Object.values(lock.functions)) {
        nodes.set(fn.id, {
            id: fn.id,
            type: 'function',
            label: fn.name,
            file: fn.file,
            moduleId: fn.moduleId,
            metadata: {
                startLine: fn.startLine,
                endLine: fn.endLine,
                isExported: fn.isExported,
                isAsync: fn.isAsync,
                hash: fn.hash,
                purpose: fn.purpose,
                params: fn.params,
                returnType: fn.returnType,
                edgeCasesHandled: fn.edgeCasesHandled,
                errorHandling: fn.errorHandling,
            },
        })
    }

    // Add file nodes
    for (const file of Object.values(lock.files)) {
        nodes.set(file.path, {
            id: file.path,
            type: 'file',
            label: path.basename(file.path),
            file: file.path,
            moduleId: file.moduleId,
            metadata: {},
        })
    }

    // Build edges from fn.calls (caller → callee, type: 'calls')
    for (const fn of Object.values(lock.functions)) {
        for (const calleeId of fn.calls) {
            if (!nodes.has(calleeId)) continue
            const edge: GraphEdge = { source: fn.id, target: calleeId, type: 'calls' }
            edges.push(edge)

            const out = outEdges.get(fn.id) ?? []
            out.push(edge)
            outEdges.set(fn.id, out)

            const inE = inEdges.get(calleeId) ?? []
            inE.push(edge)
            inEdges.set(calleeId, inE)
        }
    }

    return { nodes, edges, outEdges, inEdges }
}
