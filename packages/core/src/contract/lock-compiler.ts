import * as path from 'node:path'
import { createHash } from 'node:crypto'
import type { MikkContract, MikkLock } from './schema.js'
import type { DependencyGraph } from '../graph/types.js'
import type { ParsedFile } from '../parser/types.js'
import type { ContextFile } from '../utils/fs.js'
import { hashContent } from '../hash/file-hasher.js'
import { computeModuleHash, computeRootHash } from '../hash/tree-hasher.js'
import { minimatch } from '../utils/minimatch.js'

const VERSION = '@getmikk/cli@1.2.1'

// ─── Heuristic purpose inference ────────────────────────────────────
// When JSDoc is missing we derive a short purpose string from:
//   1. camelCase / PascalCase function name → natural language
//   2. parameter names (context clue)
//   3. return type (if present)
//
// Examples:
//   "getUserProjectRole" + params:["userId","projectId"] → "Get user project role (userId, projectId)"
//   "DashboardPage"      + returnType:"JSX.Element"       → "Dashboard page component"
// ────────────────────────────────────────────────────────────────────

/** Split camelCase/PascalCase identifier into lowercase words */
function splitIdentifier(name: string): string[] {
    return name
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')  // camelCase boundary
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2') // ABCDef → ABC Def
        .split(/[\s_-]+/)
        .map(w => w.toLowerCase())
        .filter(Boolean)
}

const JSX_RETURN_TYPES = new Set([
    'jsx.element', 'react.reactnode', 'reactnode', 'react.jsx.element',
    'react.fc', 'reactelement',
])

const HOOK_PREFIXES = ['use']
const HANDLER_PREFIXES = ['handle', 'on']
const GETTER_PREFIXES = ['get', 'fetch', 'load', 'find', 'query', 'retrieve', 'read']
const SETTER_PREFIXES = ['set', 'update', 'save', 'write', 'put', 'patch', 'create', 'delete', 'remove']
const CHECKER_PREFIXES = ['is', 'has', 'can', 'should', 'check', 'validate']

/** Infer a short purpose string from function metadata when JSDoc is missing */
function inferPurpose(
    name: string,
    params?: { name: string; type?: string }[],
    returnType?: string,
    isAsync?: boolean,
): string | undefined {
    if (!name) return undefined

    const words = splitIdentifier(name)
    if (words.length === 0) return undefined
    const firstWord = words[0]

    // Check if it's a React component (PascalCase + JSX return)
    const isComponent = /^[A-Z]/.test(name) &&
        returnType && JSX_RETURN_TYPES.has(returnType.toLowerCase())

    if (isComponent) {
        const readable = words.join(' ')
        return capitalise(`${readable} component`)
    }

    // Check if it's a hook (React, Vue composables, etc.)
    if (HOOK_PREFIXES.includes(firstWord) && words.length > 1) {
        const subject = words.slice(1).join(' ')
        return capitalise(`Hook for ${subject}`)
    }

    // Build base description from name words
    let base: string
    if (HANDLER_PREFIXES.includes(firstWord)) {
        const event = words.slice(1).join(' ')
        base = `Handle ${event}`
    } else if (GETTER_PREFIXES.includes(firstWord)) {
        const subject = words.slice(1).join(' ')
        base = `${capitalise(firstWord)} ${subject}`
    } else if (SETTER_PREFIXES.includes(firstWord)) {
        const subject = words.slice(1).join(' ')
        base = `${capitalise(firstWord)} ${subject}`
    } else if (CHECKER_PREFIXES.includes(firstWord)) {
        const subject = words.slice(1).join(' ')
        base = `Check ${firstWord === 'is' || firstWord === 'has' || firstWord === 'can' ? 'if' : ''} ${subject}`.replace(/  +/g, ' ')
    } else {
        // Generic — just humanise the name
        base = capitalise(words.join(' '))
    }

    // Append param hint if ≤3 params and they have meaningful names
    if (params && params.length > 0 && params.length <= 3) {
        const meaningful = params
            .map(p => p.name)
            .filter(n => !['e', 'event', 'ctx', 'props', 'args', '_'].includes(n))
        if (meaningful.length > 0) {
            base += ` (${meaningful.join(', ')})`
        }
    }

    return base.trim() || undefined
}

function capitalise(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * LockCompiler — takes a DependencyGraph and a MikkContract
 * and compiles the complete mikk.lock.json.
 */
export class LockCompiler {
    /** Main entry — compile full lock from graph + contract + parsed files */
    compile(
        graph: DependencyGraph,
        contract: MikkContract,
        parsedFiles: ParsedFile[],
        contextFiles?: ContextFile[]
    ): MikkLock {
        const functions = this.compileFunctions(graph, contract)
        const classes = this.compileClasses(graph, contract)
        const generics = this.compileGenerics(graph, contract)
        const modules = this.compileModules(contract, parsedFiles)
        const files = this.compileFiles(parsedFiles, contract, graph)
        const routes = this.compileRoutes(parsedFiles)

        const moduleHashes: Record<string, string> = {}
        for (const [id, mod] of Object.entries(modules)) {
            moduleHashes[id] = mod.hash
        }

        const lockData: MikkLock = {
            version: '1.7.0',
            generatedAt: new Date().toISOString(),
            generatorVersion: VERSION,
            projectRoot: contract.project.name,
            syncState: {
                status: 'clean',
                lastSyncAt: new Date().toISOString(),
                lockHash: '',
                contractHash: hashContent(JSON.stringify(contract)),
            },
            modules,
            functions,
            classes: Object.keys(classes).length > 0 ? classes : undefined,
            generics: Object.keys(generics).length > 0 ? generics : undefined,
            files,
            contextFiles: contextFiles && contextFiles.length > 0
                ? contextFiles.map(({ path, type, size }) => ({ path, type, size }))
                : undefined,
            routes: routes.length > 0 ? routes : undefined,
            graph: {
                nodes: graph.nodes.size,
                edges: graph.edges.length,
                rootHash: computeRootHash(moduleHashes),
            },
        }

        // Compute overall lock hash from the compiled data
        lockData.syncState.lockHash = hashContent(JSON.stringify({
            functions: lockData.functions,
            classes: lockData.classes,
            generics: lockData.generics,
            modules: lockData.modules,
            files: lockData.files,
        }))

        return lockData
    }

    /** Compile function entries, assigning each to its module */
    private compileFunctions(
        graph: DependencyGraph,
        contract: MikkContract
    ): Record<string, MikkLock['functions'][string]> {
        const result: Record<string, MikkLock['functions'][string]> = {}

        for (const [id, node] of graph.nodes) {
            if (node.type !== 'function') continue

            const moduleId = this.findModule(node.file, contract.declared.modules)
            const inEdges = graph.inEdges.get(id) || []
            const outEdges = graph.outEdges.get(id) || []

            result[id] = {
                id,
                name: node.label,
                file: node.file,
                startLine: node.metadata.startLine ?? 0,
                endLine: node.metadata.endLine ?? 0,
                hash: node.metadata.hash ?? '',
                calls: outEdges.filter(e => e.type === 'calls').map(e => e.target),
                calledBy: inEdges.filter(e => e.type === 'calls').map(e => e.source),
                moduleId: moduleId || 'unknown',
                ...(node.metadata.params && node.metadata.params.length > 0
                    ? { params: node.metadata.params }
                    : {}),
                ...(node.metadata.returnType ? { returnType: node.metadata.returnType } : {}),
                ...(node.metadata.isAsync ? { isAsync: true } : {}),
                ...(node.metadata.isExported ? { isExported: true } : {}),
                purpose: node.metadata.purpose || inferPurpose(
                    node.label,
                    node.metadata.params,
                    node.metadata.returnType,
                    node.metadata.isAsync,
                ),
                edgeCasesHandled: node.metadata.edgeCasesHandled,
                errorHandling: node.metadata.errorHandling,
            }
        }

        return result
    }

    private compileClasses(
        graph: DependencyGraph,
        contract: MikkContract
    ): Record<string, any> {
        const result: Record<string, any> = {}
        for (const [id, node] of graph.nodes) {
            if (node.type !== 'class') continue
            const moduleId = this.findModule(node.file, contract.declared.modules)
            result[id] = {
                id,
                name: node.label,
                file: node.file,
                startLine: node.metadata.startLine ?? 0,
                endLine: node.metadata.endLine ?? 0,
                moduleId: moduleId || 'unknown',
                isExported: node.metadata.isExported ?? false,
                purpose: node.metadata.purpose || inferPurpose(node.label),
                edgeCasesHandled: node.metadata.edgeCasesHandled,
                errorHandling: node.metadata.errorHandling,
            }
        }
        return result
    }

    private compileGenerics(
        graph: DependencyGraph,
        contract: MikkContract
    ): Record<string, any> {
        const raw: Record<string, any> = {}
        for (const [id, node] of graph.nodes) {
            if (node.type !== 'generic') continue
            // Only include exported generics — non-exported types/interfaces are
            // internal implementation details that add noise without value.
            if (!node.metadata.isExported) continue
            const moduleId = this.findModule(node.file, contract.declared.modules)
            raw[id] = {
                id,
                name: node.label,
                type: node.metadata.hash ?? 'generic', // we stored type name in hash
                file: node.file,
                startLine: node.metadata.startLine ?? 0,
                endLine: node.metadata.endLine ?? 0,
                moduleId: moduleId || 'unknown',
                isExported: node.metadata.isExported ?? false,
                purpose: node.metadata.purpose || inferPurpose(node.label),
            }
        }

        // Dedup: group generics with the same name + type that appear in multiple files.
        // Keep the first occurrence and add an `alsoIn` array for the duplicate files.
        const byNameType = new Map<string, { key: string; entry: any; others: string[] }>()
        for (const [key, entry] of Object.entries(raw)) {
            const dedup = `${entry.name}::${entry.type}`
            const existing = byNameType.get(dedup)
            if (existing) {
                existing.others.push(entry.file)
            } else {
                byNameType.set(dedup, { key, entry, others: [] })
            }
        }

        const result: Record<string, any> = {}
        for (const { key, entry, others } of byNameType.values()) {
            if (others.length > 0) {
                entry.alsoIn = others
            }
            result[key] = entry
        }

        return result
    }

    /** Compile module entries from contract definitions */
    private compileModules(
        contract: MikkContract,
        parsedFiles: ParsedFile[]
    ): Record<string, MikkLock['modules'][string]> {
        const result: Record<string, MikkLock['modules'][string]> = {}

        for (const module of contract.declared.modules) {
            const moduleFiles = parsedFiles
                .filter(f => this.fileMatchesModule(f.path, module.paths))
                .map(f => f.path)

            const fileHashes = moduleFiles.map(f => {
                const parsed = parsedFiles.find(pf => pf.path === f)
                return parsed?.hash ?? ''
            })

            result[module.id] = {
                id: module.id,
                files: moduleFiles,
                hash: computeModuleHash(fileHashes),
                fragmentPath: `.mikk/fragments/${module.id}.lock`,
            }
        }

        return result
    }

    /** Compile file entries */
    private compileFiles(
        parsedFiles: ParsedFile[],
        contract: MikkContract,
        graph: DependencyGraph
    ): Record<string, MikkLock['files'][string]> {
        const result: Record<string, MikkLock['files'][string]> = {}

        for (const file of parsedFiles) {
            const moduleId = this.findModule(file.path, contract.declared.modules)

            // Collect file-level imports from the graph's import edges
            const outEdges = graph.outEdges.get(file.path) || []
            const importedFiles = outEdges
                .filter(e => e.type === 'imports')
                .map(e => e.target)

            result[file.path] = {
                path: file.path,
                hash: file.hash,
                moduleId: moduleId || 'unknown',
                lastModified: new Date(file.parsedAt).toISOString(),
                ...(importedFiles.length > 0 ? { imports: importedFiles } : {}),
            }
        }

        return result
    }

    /** Compile route registrations from all parsed files */
    private compileRoutes(parsedFiles: ParsedFile[]): MikkLock['routes'] & any[] {
        const routes: any[] = []
        for (const file of parsedFiles) {
            if (file.routes && file.routes.length > 0) {
                for (const route of file.routes) {
                    routes.push({
                        method: route.method,
                        path: route.path,
                        handler: route.handler,
                        middlewares: route.middlewares,
                        file: route.file,
                        line: route.line,
                    })
                }
            }
        }
        return routes
    }

    /** Find which module a file belongs to based on path patterns */
    private findModule(
        filePath: string,
        modules: MikkContract['declared']['modules']
    ): string | null {
        for (const module of modules) {
            if (this.fileMatchesModule(filePath, module.paths)) {
                return module.id
            }
        }
        return null
    }

    /** Check if a file path matches any of the module's path patterns */
    private fileMatchesModule(filePath: string, patterns: string[]): boolean {
        const normalized = filePath.replace(/\\/g, '/')
        for (const pattern of patterns) {
            if (minimatch(normalized, pattern)) {
                return true
            }
        }
        return false
    }
}
