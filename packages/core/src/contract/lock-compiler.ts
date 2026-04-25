import type { MikkContract, MikkLock } from './schema.js'
import type { DependencyGraph } from '../graph/types.js'
import type { ParsedFile } from '../parser/types.js'
import type { ContextFile } from '../utils/fs.js'
import * as nodePath from 'node:path'
import { hashContent } from '../hash/file-hasher.js'
import { computeModuleHash, computeRootHash } from '../hash/tree-hasher.js'
import { minimatch } from '../utils/minimatch.js'
import { randomUUID } from 'node:crypto'
import { ClusterDetector } from '../graph/cluster-detector.js'
import { RouteHarvester } from '../parser/internal/route-harvester.js'
import { SemanticRoleClassifier } from '../graph/semantic-role-classifier.js'
import { getPathKey } from '../utils/path.js'

const VERSION = '@getmikk/cli@1.2.1'

//  Heuristic purpose inference 
// When JSDoc is missing we derive a short purpose string from:
//   1. camelCase / PascalCase function name -> natural language
//   2. parameter names (context clue)
//   3. return type (if present)
//
// Examples:
//   "getUserProjectRole" + params:["userId","projectId"] -> "Get user project role (userId, projectId)"
//   "DashboardPage"      + returnType:"JSX.Element"       -> "Dashboard page component"
// 

/** Split camelCase/PascalCase identifier into lowercase words */
function splitIdentifier(name: string): string[] {
    return name
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')  // camelCase boundary
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2') // ABCDef -> ABC Def
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

function getModuleMatchPath(filePath: string, projectRootPath: string | null): string {
    const normalized = filePath.replace(/\\/g, '/')
    if (!projectRootPath) return normalized
    const relative = nodePath.relative(projectRootPath, filePath)
    if (relative === '') return normalized
    if (!relative.startsWith('..')) {
        return relative.replace(/\\/g, '/')
    }
    return normalized
}

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
        // Generic  just humanise the name
        base = capitalise(words.join(' '))
    }

    // Append param hint if <=3 params and they have meaningful names
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
 * LockCompiler -- takes a DependencyGraph and a MikkContract
 * and compiles the complete mikk.lock.json.
 */
export class LockCompiler {
    private projectRootPath: string | null = null

    /** Main entry -- compile full lock from graph + contract + parsed files */
    async compile(
        graph: DependencyGraph,
        contract: MikkContract,
        parsedFiles: ParsedFile[],
        contextFiles?: ContextFile[],
        projectRoot?: string
    ): Promise<MikkLock> {
        this.projectRootPath = projectRoot ? nodePath.resolve(projectRoot) : null

        // Use semantic ClusterDetector for auto-modules
        const clusterDetector = new ClusterDetector(graph, 1, 0.08, null)
        const detectedClusters = clusterDetector.detect()

        const fileClusterMap = new Map<string, string>()
        const dynamicModules: Record<string, MikkLock['modules'][string]> = {}
        for (const c of detectedClusters) {
            for (const f of c.files) {
                // Store under both original and normalised (lowercase forward-slash) key
                // so findModule lookups succeed regardless of OS path casing.
                fileClusterMap.set(f, c.id)
                fileClusterMap.set(f.replace(/\\/g, '/').toLowerCase(), c.id)
            }
            const fileHashes = c.files.map(f => parsedFiles.find(pf => pf.path === f)?.hash ?? '')
            dynamicModules[c.id] = {
                id: c.id,
                files: c.files,
                hash: computeModuleHash(fileHashes),
                fragmentPath: `.mikk/fragments/${c.id}.lock`,
                parentId: c.parentId,
            }
        }

        const functions = this.compileFunctions(graph, contract, fileClusterMap)
        const classes = this.compileClasses(graph, contract, fileClusterMap)
        const generics = this.compileGenerics(graph, contract)

        // Merge contract-defined modules with auto-detected modules
        const contractModules = this.compileModules(contract, parsedFiles)
        const modules = { ...contractModules, ...dynamicModules }

        const files = this.compileFiles(parsedFiles, contract, graph, fileClusterMap)
        const routes = this.compileRoutes(parsedFiles)

        const moduleHashes: Record<string, string> = {}
        for (const [id, mod] of Object.entries(modules)) {
            moduleHashes[id] = mod.hash
        }

        const lockData: MikkLock = {
            version: '2.0.0',
            generatedAt: new Date().toISOString(),
            generatorVersion: VERSION,
            projectRoot: projectRoot ?? contract.project.name,
            syncState: {
                status: 'clean',
                lastSyncAt: new Date().toISOString(),
                lockHash: '',
                contractHash: hashContent(JSON.stringify(contract)),
                generationId: randomUUID(),
                writeVersion: 0,
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
                edges: graph.edges.map(e => ({ from: e.from, to: e.to, type: e.type, weight: e.weight })),
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
        contract: MikkContract,
        fileClusterMap?: Map<string, string>
    ): Record<string, MikkLock['functions'][string]> {
        const result: Record<string, MikkLock['functions'][string]> = {}

        // Singleton classifier — reuse across all functions
        const roleClassifier = new SemanticRoleClassifier()
        // Cache file→role results to avoid redundant classification
        const fileRoleCache = new Map<string, { role: string; framework?: string }>()

        for (const [id, node] of graph.nodes) {
            if (node.type !== 'function') continue
            if (this.isVendorPath(node.file)) continue

            const moduleId = this.findModule(node.file, contract.declared.modules, fileClusterMap)
            const displayName = node.name ?? ''
            const metadata = node.metadata ?? {}
            const inEdges = graph.inEdges.get(id) || []
            const outEdges = graph.outEdges.get(id) || []

            const params = metadata.params || []
            const returnType = metadata.returnType || 'void'
            const signatureHash = hashContent(`${displayName}(${params.map(p => p.type).join(',')}):${returnType}`)

            // Semantic role classification — cached per file
            let fileRole = fileRoleCache.get(node.file)
            if (!fileRole) {
                fileRole = roleClassifier.classifyFile(node.file)
                fileRoleCache.set(node.file, fileRole)
            }

            result[id] = {
                id,
                name: displayName,
                file: node.file,
                startLine: metadata.startLine ?? 0,
                endLine: metadata.endLine ?? 0,
                hash: metadata.hash ?? '',
                calls: outEdges.filter(e => e.type === 'calls').map(e => e.to),
                calledBy: inEdges.filter(e => e.type === 'calls').map(e => e.from),
                moduleId: moduleId || 'unknown',
                ...(params.length > 0 ? { params } : {}),
                ...(metadata.returnType ? { returnType: metadata.returnType } : {}),
                ...(metadata.isAsync ? { isAsync: true } : {}),
                ...(metadata.isExported ? { isExported: true } : {}),
                purpose: metadata.purpose || inferPurpose(
                    displayName,
                    params,
                    returnType,
                    metadata.isAsync,
                ),
                edgeCasesHandled: metadata.edgeCasesHandled,
                errorHandling: metadata.errorHandling,
                signatureHash,
                ...(fileRole.role !== 'unknown' ? { role: fileRole.role } : {}),
                ...(fileRole.framework ? { roleFramework: fileRole.framework } : {}),
            }
        }

        return result
    }

    private compileClasses(
        graph: DependencyGraph,
        contract: MikkContract,
        fileClusterMap?: Map<string, string>
    ): Record<string, any> {
        const result: Record<string, any> = {}
        for (const [id, node] of graph.nodes) {
            if (node.type !== 'class') continue
            if (this.isVendorPath(node.file)) continue

            const moduleId = this.findModule(node.file, contract.declared.modules, fileClusterMap)
            const className = node.name ?? ''
            const metadata = node.metadata ?? {}
            result[id] = {
                id,
                name: className,
                file: node.file,
                startLine: metadata.startLine ?? 0,
                endLine: metadata.endLine ?? 0,
                moduleId: moduleId || 'unknown',
                isExported: metadata.isExported ?? false,
                purpose: metadata.purpose || inferPurpose(className),
                edgeCasesHandled: metadata.edgeCasesHandled,
                errorHandling: metadata.errorHandling,
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
            // Only include exported generics  non-exported types/interfaces are
            // internal implementation details that add noise without value.
            if (!(node.metadata?.isExported)) continue
            if (this.isVendorPath(node.file)) continue

            const moduleId = this.findModule(node.file, contract.declared.modules)
            const genericName = node.name ?? ''
            const metadata = node.metadata ?? {}
            raw[id] = {
                id,
                name: genericName,
                // Fix: use genericKind (the actual type string stored by addGenericNode)
                // NOT metadata.hash (which is the SHA-256 hash of the node content)
                type: metadata.genericKind ?? 'generic',
                file: node.file,
                startLine: metadata.startLine ?? 0,
                endLine: metadata.endLine ?? 0,
                moduleId: moduleId || 'unknown',
                isExported: metadata.isExported ?? false,
                purpose: metadata.purpose || inferPurpose(genericName),
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

        // Build file hash map
        const fileHashMap = new Map<string, string>()
        for (const file of parsedFiles) {
            fileHashMap.set(file.path, file.hash)
        }

        // Pre-compute normalized paths for all files (do once)
        const filePathCache = parsedFiles.map(f => ({
            path: f.path,
            normalizedRelative: getModuleMatchPath(f.path, this.projectRootPath).replace(/\\/g, '/').toLowerCase(),
            normalizedAbsolute: f.path.replace(/\\/g, '/').toLowerCase(),
            isVendor: this.isVendorPath(f.path)
        }))

        // For each module, find matching files
        for (const module of contract.declared.modules) {
            const moduleFiles: string[] = []

            // Pre-compute normalized patterns for this module
            const normalizedProjectRoot = this.projectRootPath
                ? this.projectRootPath.replace(/\\/g, '/').toLowerCase()
                : null
            const patterns = module.paths.map(p => {
                const np = p.replace(/\\/g, '/').toLowerCase()
                return normalizedProjectRoot && np.startsWith(`${normalizedProjectRoot}/`)
                    ? np.slice(normalizedProjectRoot.length + 1)
                    : np
            })

            // Check each file against this module's patterns
            for (let i = 0; i < filePathCache.length; i++) {
                const f = filePathCache[i]
                if (f.isVendor) continue

                for (const pattern of patterns) {
                    if (minimatch(f.normalizedRelative, pattern) || minimatch(f.normalizedAbsolute, pattern)) {
                        moduleFiles.push(f.path)
                        break // found match, no need to check more patterns
                    }
                }
            }

            const fileHashes = moduleFiles.map(f => fileHashMap.get(f) ?? '')

            result[module.id] = {
                id: module.id,
                files: moduleFiles,
                hash: computeModuleHash(fileHashes),
                fragmentPath: `.mikk/fragments/${module.id}.lock`,
                ...(module.parentId ? { parentId: module.parentId } : {}),
            }
        }

        return result
    }

    /** Compile file entries */
    private compileFiles(
        parsedFiles: ParsedFile[],
        contract: MikkContract,
        _graph: DependencyGraph,
        fileClusterMap?: Map<string, string>
    ): Record<string, MikkLock['files'][string]> {
        const result: Record<string, MikkLock['files'][string]> = {}

        for (const file of parsedFiles) {
            // Skip vendor files entirely
            if (this.isVendorPath(file.path)) continue

            const moduleId = this.findModule(file.path, contract.declared.modules, fileClusterMap)

            // Collect file-level imports from the parsed file info directly
            // to include both source and resolvedPath for unresolved analysis.
            const imports = file.imports.map(imp => ({
                source: imp.source,
                resolvedPath: imp.resolvedPath || undefined,
            }))

            const reexports = (file.reexports || []).map(re => ({
                name: re.name,
                source: re.source,
                sourceResolved: re.sourceResolved,
            }))

            const fileKey = getPathKey(file.path)
            result[fileKey] = {
                path: fileKey,
                hash: file.hash,
                moduleId: moduleId || 'unknown',
                lastModified: new Date(file.parsedAt).toISOString(),
                ...(imports.length > 0 ? { imports } : {}),
                ...(reexports.length > 0 ? { reexports } : {}),
            }
        }

        return result
    }

    /** Compile route registrations from all parsed files using universal route harvester */
    private compileRoutes(parsedFiles: ParsedFile[]): MikkLock['routes'] & any[] {
        // Parser-native routes (OXC puts Express routes here directly from AST).
        // These are ground truth — use them as-is.
        const nativeRoutes: any[] = []
        const filesWithNativeRoutes = new Set<string>()

        for (const file of parsedFiles) {
            if (file.routes && file.routes.length > 0) {
                filesWithNativeRoutes.add(file.path)
                for (const route of file.routes) {
                    nativeRoutes.push({
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

        // RouteHarvester fills gaps for files the parsers did not produce native routes for
        // (e.g. non-JS/TS frameworks that land in tree-sitter without route extraction).
        const harvesterFiles = parsedFiles.filter(f => !filesWithNativeRoutes.has(f.path))
        const harvester = new RouteHarvester()
        const harvesterRoutes = harvester.harvest(harvesterFiles)

        // Merge and deduplicate by method+path+file so overlapping detectors can't create
        // the same route twice even in edge cases.
        const seen = new Set<string>()
        const all: any[] = []
        for (const r of [...nativeRoutes, ...harvesterRoutes]) {
            const key = `${r.method}:${r.path}:${r.file}`
            if (!seen.has(key)) {
                seen.add(key)
                all.push(r)
            }
        }
        return all
    }

    /** Find which module a file belongs to based on path patterns or graph clustering */
    private findModule(
        filePath: string,
        modules: MikkContract['declared']['modules'],
        fileClusterMap?: Map<string, string>
    ): string | null {
        // Priority 1: Match contract module path patterns.
        // Use MOST-SPECIFIC match (longest pattern wins) to handle overlapping
        // globs like packages/core/** vs packages/core/src/parser/**.
        // This prevents broad clusters (/**) from swallowing everything.
        let bestMatch: { id: string; patternLength: number } | null = null
        for (const module of modules) {
            const matchedPattern = this.longestMatchingPattern(filePath, module.paths)
            if (matchedPattern !== null && matchedPattern > (bestMatch?.patternLength ?? -1)) {
                bestMatch = { id: module.id, patternLength: matchedPattern }
            }
        }
        if (bestMatch) return bestMatch.id

        // Priority 2: Use the graph-cluster map built during compile().
        if (fileClusterMap) {
            const clusterId = fileClusterMap.get(filePath)
                ?? fileClusterMap.get(filePath.replace(/\\/g, '/').toLowerCase())
            if (clusterId) return clusterId
        }

        // Priority 3: Auto-derive from path — guaranteed to return something
        return this.deriveModuleIdFromPath(filePath)
    }

    /**
     * Returns the length of the longest pattern that matches filePath,
     * or null if no pattern matches. Longer pattern = more specific = wins.
     */
    private longestMatchingPattern(filePath: string, patterns: string[]): number | null {
        if (!patterns || patterns.length === 0) return null
        if (this.isVendorPath(filePath)) return null

        const relativePath = getModuleMatchPath(filePath, this.projectRootPath)
        const normalizedRelative = relativePath.replace(/\\/g, '/').toLowerCase()
        const normalizedAbsolute = filePath.replace(/\\/g, '/').toLowerCase()
        const normalizedProjectRoot = this.projectRootPath
            ? this.projectRootPath.replace(/\\/g, '/').toLowerCase()
            : null

        let longest: number | null = null
        for (const pattern of patterns) {
            const normalizedPattern = pattern.replace(/\\/g, '/').toLowerCase()
            const relativePattern = normalizedProjectRoot && normalizedPattern.startsWith(`${normalizedProjectRoot}/`)
                ? normalizedPattern.slice(normalizedProjectRoot.length + 1)
                : normalizedPattern

            // Skip the bare wildcard — it matches everything and is never "specific"
            if (relativePattern === '**' || relativePattern === '/**') continue

            if (minimatch(normalizedRelative, relativePattern) ||
                minimatch(normalizedAbsolute, normalizedPattern)) {
                const len = relativePattern.length
                if (longest === null || len > longest) longest = len
            }
        }
        return longest
    }

    /** Derive semantic module ID from file path — works for any project layout.
     *  Produces IDs in the format the ContractGenerator uses:
     *    packages/<pkg>/src/... → "packages-<pkg>"
     *    apps/<app>/...        → "apps-<app>"
     *    src/<module>/...      → "<module>"
     */
    private deriveModuleIdFromPath(filePath: string): string {
        const normalized = filePath.replace(/\\/g, '/').toLowerCase()
        const parts = normalized.split('/').filter(Boolean)

        // Monorepo: packages/<pkg>/...  or  apps/<app>/...
        const monoRoots = ['packages', 'apps']
        const monoIdx = parts.findIndex(p => monoRoots.includes(p))
        if (monoIdx >= 0 && monoIdx + 1 < parts.length) {
            const prefix = parts[monoIdx]          // "packages" | "apps"
            const pkg = parts[monoIdx + 1]       // "core" | "cli" | "web" …
            return `${prefix}-${pkg}`.replace(/[^a-z0-9-]/g, '-').replace(/-+$/, '')
        }

        // Conventional src layout: src/<module>/...
        const srcDirs = ['src', 'lib', 'app', 'pages', 'modules', 'source']
        const srcIndex = parts.findIndex(p => srcDirs.includes(p))
        if (srcIndex >= 0 && srcIndex + 1 < parts.length) {
            return parts[srcIndex + 1].replace(/[^a-z0-9-]/g, '-').replace(/-+$/, '')
        }

        // Root-level: use parent directory name
        if (parts.length >= 2) return parts[parts.length - 2].replace(/[^a-z0-9-]/g, '')
        return 'root'
    }

    /** Check if a file path matches any of the module's path patterns */
    private fileMatchesModule(filePath: string, patterns: string[]): boolean {
        // Skip vendor paths - never match them to any module
        if (this.isVendorPath(filePath)) return false

        const relativePath = getModuleMatchPath(filePath, this.projectRootPath)
        const normalizedRelative = relativePath.replace(/\\/g, '/').toLowerCase()
        const normalizedAbsolute = filePath.replace(/\\/g, '/').toLowerCase()
        const normalizedProjectRoot = this.projectRootPath
            ? this.projectRootPath.replace(/\\/g, '/').toLowerCase()
            : null

        for (const pattern of patterns) {
            const normalizedPattern = pattern.replace(/\\/g, '/').toLowerCase()
            const relativePattern = normalizedProjectRoot && normalizedPattern.startsWith(`${normalizedProjectRoot}/`)
                ? normalizedPattern.slice(normalizedProjectRoot.length + 1)
                : normalizedPattern
            if (minimatch(normalizedRelative, relativePattern) ||
                minimatch(normalizedAbsolute, normalizedPattern)) {
                return true
            }
        }
        return false
    }

    /** Check if a path is from a vendor directory */
    private isVendorPath(filePath: string): boolean {
        const normalized = filePath.replace(/\\/g, '/')
        const vendorPatterns = [
            '**/node_modules/**',
            '**/venv/**',
            '**/.venv/**',
            '**/__pycache__/**',
            '**/vendor/**',
            '**/dist/**',
            '**/build/**',
            '**/.next/**',
            '**/target/**',
        ]
        return vendorPatterns.some(pattern => minimatch(normalized, pattern))
    }
}
