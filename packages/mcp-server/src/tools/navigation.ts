import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { DirectSearchEngine } from '@getmikk/core'
import { loadContractAndLock, sanitizeMermaidId, isTrackedByLock, MAX_SOURCE_FILE_BYTES } from './shared.js'

export function registerNavigationTools(server: McpServer, projectRoot: string) {

    server.tool(
        'mikk_list_modules',
        'List all declared modules with file counts, function counts, entry points, and descriptions. Good starting point after mikk_get_session_context. AFTER THIS: Use mikk_get_module_detail with a moduleId.',
        {},
        async () => {
            const { contract, lock, staleness } = await loadContractAndLock(projectRoot)
            const modules = contract.declared.modules.map(mod => {
                const fns = Object.values(lock.functions).filter(f => f.moduleId === mod.id)
                const files = Object.values(lock.files).filter(f => f.moduleId === mod.id)
                return { id: mod.id, name: mod.name, description: mod.description, paths: mod.paths, functions: fns.length, files: files.length, entryFunctions: mod.entryFunctions ?? [] }
            })
            return { content: [{ type: 'text' as const, text: JSON.stringify({ modules, warning: staleness }, null, 2) }] }
        },
    )

    ;(server as any).tool(
        'mikk_get_module_detail',
        'Deep dive into a single module: all functions, files, exported API surface, internal call graph. AFTER THIS: Use mikk_get_function_detail for specific functions.',
        { moduleId: z.string().describe('The module ID (e.g., "packages-core", "lib-auth")') },
        async (args: any): Promise<any> => {
            const { moduleId } = args as any
            const { contract, lock, staleness } = await loadContractAndLock(projectRoot)
            const mod = contract.declared.modules.find(m => m.id === moduleId)
            if (!mod) return { content: [{ type: 'text' as const, text: `Module "${moduleId}" not found. Use mikk_list_modules.` }], isError: true }
            const fns = Object.values(lock.functions).filter(f => f.moduleId === moduleId)
            const files = Object.values(lock.files).filter(f => f.moduleId === moduleId)
            const detail = {
                module: mod,
                files: files.map(f => ({ path: f.path, imports: f.imports })),
                functions: fns.map(f => ({
                    name: f.name, file: f.file, startLine: f.startLine, endLine: f.endLine,
                    isExported: f.isExported, isAsync: f.isAsync, params: f.params, returnType: f.returnType,
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

    server.tool(
        'mikk_get_function_detail',
        '360-degree view of a function: params, return type, source body, call graph (who calls it + what it calls). AFTER THIS: Use mikk_find_usages to see all callers.',
        { name: z.string().describe('Function name (e.g., "parseFiles", "GraphBuilder.build")') },
        async (args: any): Promise<any> => {
            const { name } = args as any
            const { lock, staleness } = await loadContractAndLock(projectRoot)
            const matches = Object.values(lock.functions).filter(f => f.name === name || f.name.endsWith(`.${name}`) || (f.id ?? '').includes(name))
            if (matches.length === 0) return { content: [{ type: 'text' as const, text: `No function matching "${name}" found.` }], isError: true }
            const results = await Promise.all(matches.map(async fn => {
                let body: string | undefined
                try {
                    const absPath = path.isAbsolute(fn.file) ? fn.file : path.join(projectRoot, fn.file)
                    const resolved = path.resolve(absPath)
                    const rootResolved = path.resolve(projectRoot)
                    if (!resolved.startsWith(rootResolved + path.sep) && resolved !== rootResolved) throw new Error('Access denied')
                    const rel = path.relative(rootResolved, resolved).replace(/\\/g, '/')
                    const allowlisted = new Set(['mikk.json', 'mikk.lock.json', 'package.json', 'tsconfig.json'])
                    if (!isTrackedByLock(lock, projectRoot, resolved) && !allowlisted.has(rel)) throw new Error('Access denied')
                    const stat = await fs.stat(resolved)
                    if (stat.size > MAX_SOURCE_FILE_BYTES) throw new Error('File too large')
                    const fileContent = await fs.readFile(resolved, 'utf-8')
                    body = fileContent.split('\n').slice(fn.startLine - 1, fn.endLine).join('\n')
                } catch { /* non-fatal */ }
                return {
                    id: fn.id, name: fn.name, file: fn.file, lines: `${fn.startLine}-${fn.endLine}`, module: fn.moduleId,
                    isExported: fn.isExported, isAsync: fn.isAsync, params: fn.params, returnType: fn.returnType,
                    purpose: fn.purpose, body,
                    calls: fn.calls.map(id => lock.functions[id]?.name).filter(Boolean),
                    calledBy: fn.calledBy.map(id => lock.functions[id]?.name).filter(Boolean),
                    errorHandling: fn.errorHandling, edgeCases: fn.edgeCasesHandled, warning: staleness,
                }
            }))
            return { content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }] }
        },
    )

    // mikk_get_class_detail — previously commented out, now enabled
    ;(server as any).tool(
        'mikk_get_class_detail',
        'Get detailed info about a class: methods, properties, inheritance, decorators. WHEN TO USE: When working with classes or OOP structure.',
        { name: z.string().describe('Class name to search for (e.g., "GraphBuilder", "AuthService")') },
        async (args: any): Promise<any> => {
            const { name } = args as any
            const { lock, staleness } = await loadContractAndLock(projectRoot)
            const searchLower = name.toLowerCase()
            let clsId: string | null = null; let cls: any = null
            for (const [id, c] of Object.entries((lock as any).classes || {})) {
                if (id.toLowerCase().includes(searchLower) || (c as any).purpose?.toLowerCase().includes(searchLower)) { clsId = id; cls = c; break }
            }
            if (!cls) {
                const available = Object.keys((lock as any).classes || {}).slice(0, 8).join(', ')
                return { content: [{ type: 'text' as const, text: `Class "${name}" not found. Available: ${available || 'none'}. Use mikk_get_function_detail for methods.` }], isError: true }
            }
            return { content: [{ type: 'text' as const, text: JSON.stringify({
                class: {
                    id: clsId, name: clsId?.split(':').pop() || clsId,
                    file: cls.file, module: cls.moduleId, lines: cls.lines,
                    isExported: cls.isExported, extends: cls.extends, implements: cls.implements,
                    typeParameters: cls.typeParameters, purpose: cls.purpose,
                },
                methodCount: cls.methods?.length || 0, warning: staleness,
            }, null, 2) }] }
        },
    )

    // mikk_get_generic_detail — previously commented out, now enabled
    ;(server as any).tool(
        'mikk_get_generic_detail',
        'Get detailed info about a TypeScript type/interface/generic. WHEN TO USE: When working with TypeScript types or interfaces.',
        { name: z.string().describe('Generic/type name (e.g., "Result", "UserConfig")') },
        async (args: any): Promise<any> => {
            const { name } = args as any
            const { lock, staleness } = await loadContractAndLock(projectRoot)
            const searchLower = name.toLowerCase()
            let genId: string | null = null; let gen: any = null
            for (const [id, g] of Object.entries((lock as any).generics || {})) {
                if (id.toLowerCase().includes(searchLower) || (g as any).purpose?.toLowerCase().includes(searchLower)) { genId = id; gen = g; break }
            }
            if (!gen) return { content: [{ type: 'text' as const, text: `Generic/type "${name}" not found.` }], isError: true }
            return { content: [{ type: 'text' as const, text: JSON.stringify({
                generic: {
                    id: genId, name: genId?.split(':').pop() || genId,
                    type: gen.type, file: gen.file, module: gen.moduleId, lines: gen.lines,
                    isExported: gen.isExported, typeParameters: gen.typeParameters, extends: gen.extends, purpose: gen.purpose,
                },
                warning: staleness,
            }, null, 2) }] }
        },
    )

    server.tool(
        'mikk_get_routes',
        'Get all detected HTTP routes with methods, paths, handlers, and middleware chains. AFTER THIS: Use mikk_get_function_detail on a handler to see its implementation.',
        {},
        async () => {
            const { lock, staleness } = await loadContractAndLock(projectRoot)
            const routes = lock.routes ?? []
            if (routes.length === 0) return { content: [{ type: 'text' as const, text: 'No HTTP routes detected in this project.' }] }
            return { content: [{ type: 'text' as const, text: JSON.stringify({ routes, warning: staleness }, null, 2) }] }
        },
    )

    ;(server as any).tool(
        'mikk_list_files',
        'List all tracked files with filtering by module, language, imports, or exports.',
        {
            moduleId: z.string().optional(),
            language: z.string().optional(),
            hasImports: z.boolean().optional(),
            hasExports: z.boolean().optional(),
            limit: z.number().optional().default(50),
        },
        async (args: any): Promise<any> => {
            const { moduleId, language, hasImports, hasExports, limit } = args as any
            const { lock, staleness } = await loadContractAndLock(projectRoot)
            let files = Object.values(lock.files)
            if (moduleId) files = files.filter(f => f.moduleId === moduleId)
            if (language) files = files.filter(f => (f as any).language?.toLowerCase() === language.toLowerCase())
            if (hasImports !== undefined) files = files.filter(f => hasImports ? (f.imports?.length ?? 0) > 0 : (f.imports?.length ?? 0) === 0)
            if (hasExports !== undefined) files = files.filter(f => hasExports ? ((f as any).exports?.length ?? 0) > 0 : ((f as any).exports?.length ?? 0) === 0)
            return { content: [{ type: 'text' as const, text: JSON.stringify({
                total: files.length,
                files: files.slice(0, limit).map(f => ({
                    path: f.path, module: f.moduleId, language: (f as any).language,
                    imports: f.imports?.slice(0, 5), importCount: f.imports?.length ?? 0,
                    exportCount: (f as any).exports?.length ?? 0, lineCount: (f as any).lineCount,
                })),
                warning: staleness,
            }, null, 2) }] }
        },
    )

    ;(server as any).tool(
        'mikk_get_call_graph',
        'Generate a Mermaid call graph diagram for a function or module. WHEN TO USE: To visualize how code flows.',
        {
            target: z.string().describe('Function name or module ID'),
            type: z.enum(['function', 'module']).optional().default('function'),
            depth: z.number().optional().default(3),
            direction: z.enum(['callers', 'callees', 'both']).optional().default('both'),
        },
        async (args: any): Promise<any> => {
            const { target, type, depth, direction } = args as any
            const { lock, staleness } = await loadContractAndLock(projectRoot)
            let functionIds: string[] = []
            if (type === 'function') {
                const fn = Object.values(lock.functions).find(f => f.name === target || f.name.endsWith(`.${target}`) || (f.id ?? '').includes(target))
                if (fn) functionIds = [fn.id]
            } else {
                functionIds = Object.keys(lock.functions).filter(id => lock.functions[id].moduleId === target)
            }
            if (functionIds.length === 0) return { content: [{ type: 'text', text: `Target "${target}" not found` }], isError: true }
            const visited = new Set<string>(); const nodes = new Set<string>(); const edges: string[] = []
            const traverse = (fnId: string, currentDepth: number) => {
                if (currentDepth > depth || visited.has(fnId)) return
                visited.add(fnId)
                const fn = lock.functions[fnId]; if (!fn) return
                const label = fn.name.split(':').pop() || fnId
                nodes.add(`    ${sanitizeMermaidId(fnId)}["${label}"]`)
                if (direction === 'callees' || direction === 'both') for (const callId of fn.calls || []) { if (!visited.has(callId)) { edges.push(`    ${sanitizeMermaidId(fnId)} --> ${sanitizeMermaidId(callId)}`); traverse(callId, currentDepth + 1) } }
                if (direction === 'callers' || direction === 'both') for (const callerId of fn.calledBy || []) { if (!visited.has(callerId)) { edges.push(`    ${sanitizeMermaidId(callerId)} --> ${sanitizeMermaidId(fnId)}`); traverse(callerId, currentDepth + 1) } }
            }
            for (const fnId of functionIds) traverse(fnId, 0)
            const mermaidCode = `flowchart TD\n${[...nodes].join('\n')}\n${edges.join('\n')}`
            return { content: [{ type: 'text' as const, text: JSON.stringify({
                label: type === 'function' ? `Call Graph: ${target}` : `Module: ${target}`,
                target, type, depth, direction, mermaid: mermaidCode,
                nodeCount: nodes.size, edgeCount: edges.length,
                hint: 'Copy the mermaid code into a markdown file or Mermaid Live Editor to visualize',
                warning: staleness,
            }, null, 2) }] }
        },
    )
}
