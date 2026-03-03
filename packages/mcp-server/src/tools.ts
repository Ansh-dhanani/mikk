import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
    ContractReader, LockReader, LockCompiler, GraphBuilder,
    ImpactAnalyzer, parseFiles, readFileContent, discoverFiles,
    discoverContextFiles, detectProjectLanguage, getDiscoveryPatterns,
    type MikkContract, type MikkLock,
} from '@getmikk/core'
import { ContextBuilder, ClaudeMdGenerator, getProvider } from '@getmikk/ai-context'
import type { ContextQuery } from '@getmikk/ai-context'

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
            const { contract, lock } = await loadContractAndLock(projectRoot)

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
        },
        async ({ question, maxHops, tokenBudget, focusFile, focusModule }) => {
            const { contract, lock } = await loadContractAndLock(projectRoot)

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
            const provider = getProvider('claude')
            const output = provider.formatContext(ctx)

            return {
                content: [{ type: 'text' as const, text: output }],
            }
        },
    )

    // ─────────────────────────────────────────────────────────────────────
    // TOOL: mikk_analyze
    // ─────────────────────────────────────────────────────────────────────
    server.tool(
        'mikk_analyze',
        'Re-analyze the codebase: parse all source files, rebuild the dependency graph, update the lock file, regenerate diagrams and AI context. Use after code changes.',
        {},
        async () => {
            const contractReader = new ContractReader()
            const contract = await contractReader.read(path.join(projectRoot, 'mikk.json'))

            const language = await detectProjectLanguage(projectRoot)
            const { patterns, ignore } = getDiscoveryPatterns(language)
            const files = await discoverFiles(projectRoot, patterns, ignore)

            if (files.length === 0) {
                return {
                    content: [{ type: 'text' as const, text: 'No source files found. Check .mikkignore.' }],
                    isError: true,
                }
            }

            const parsedFiles = await parseFiles(files, projectRoot, (fp: string) => readFileContent(fp))
            const graph = new GraphBuilder().build(parsedFiles)
            const contextFiles = await discoverContextFiles(projectRoot)
            const lock = new LockCompiler().compile(graph, contract, parsedFiles, contextFiles)

            const lockReader = new LockReader()
            await lockReader.write(lock, path.join(projectRoot, 'mikk.lock.json'))

            // Regenerate AI context files
            try {
                let pkgJson: any = {}
                try {
                    pkgJson = JSON.parse(await fs.readFile(path.join(projectRoot, 'package.json'), 'utf-8'))
                } catch { /* no package.json is fine */ }

                const meta = {
                    description: pkgJson.description,
                    scripts: pkgJson.scripts,
                    dependencies: pkgJson.dependencies,
                    devDependencies: pkgJson.devDependencies,
                }

                const mdGen = new ClaudeMdGenerator(contract, lock, undefined, meta)
                const claudeMd = mdGen.generate()
                await fs.writeFile(path.join(projectRoot, 'claude.md'), claudeMd, 'utf-8')
                await fs.writeFile(path.join(projectRoot, 'AGENTS.md'), claudeMd, 'utf-8')
            } catch { /* non-fatal */ }

            const fnCount = Object.keys(lock.functions).length
            return {
                content: [{
                    type: 'text' as const,
                    text: `Analysis complete: ${files.length} files, ${fnCount} functions. Lock file and AI context updated.`,
                }],
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
            const { contract, lock } = await loadContractAndLock(projectRoot)
            const files = await discoverFiles(projectRoot)
            const parsedFiles = await parseFiles(files, projectRoot, (fp: string) => readFileContent(fp))
            const graph = new GraphBuilder().build(parsedFiles)
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
                    content: [{ type: 'text' as const, text: `No functions found in "${file}". Check the file path.` }],
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
                impacted: impactedDetails,
                truncated: result.impacted.length > 30,
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
            const { contract, lock } = await loadContractAndLock(projectRoot)

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

            return { content: [{ type: 'text' as const, text: JSON.stringify(modules, null, 2) }] }
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
            const { contract, lock } = await loadContractAndLock(projectRoot)
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
            const { lock } = await loadContractAndLock(projectRoot)

            const matches = Object.values(lock.functions).filter(
                f => f.name === name || f.name.endsWith(`.${name}`) || f.id.includes(name),
            )

            if (matches.length === 0) {
                return {
                    content: [{ type: 'text' as const, text: `No function matching "${name}" found.` }],
                    isError: true,
                }
            }

            const results = matches.map(fn => ({
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
                calls: fn.calls.map(id => lock.functions[id]?.name).filter(Boolean),
                calledBy: fn.calledBy.map(id => lock.functions[id]?.name).filter(Boolean),
                errorHandling: fn.errorHandling,
                edgeCases: fn.edgeCasesHandled,
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
            const { lock } = await loadContractAndLock(projectRoot)
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

            return { content: [{ type: 'text' as const, text: JSON.stringify(matches, null, 2) }] }
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
            const { contract } = await loadContractAndLock(projectRoot)

            const result = {
                constraints: contract.declared.constraints,
                decisions: contract.declared.decisions,
                overwrite: contract.overwrite,
            }

            return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
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
            const { lock } = await loadContractAndLock(projectRoot)
            const routes = (lock as any).routes ?? []

            if (routes.length === 0) {
                return { content: [{ type: 'text' as const, text: 'No HTTP routes detected in this project.' }] }
            }

            return { content: [{ type: 'text' as const, text: JSON.stringify(routes, null, 2) }] }
        },
    )
}

/** Helper — read contract + lock from disk */
async function loadContractAndLock(projectRoot: string) {
    const contractReader = new ContractReader()
    const lockReader = new LockReader()
    const contract = await contractReader.read(path.join(projectRoot, 'mikk.json'))
    const lock = await lockReader.read(path.join(projectRoot, 'mikk.lock.json'))
    return { contract, lock }
}
