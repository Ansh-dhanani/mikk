import type { MikkContract } from './schema.js'
import type { ModuleCluster } from '../graph/types.js'
import type { ParsedFile } from '../parser/types.js'
import { minimatch } from '../utils/minimatch.js'

/** Common vendor directories to exclude from contract generation */
const VENDOR_PATTERNS = [
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

/** Check if a path is from a vendor directory */
function isVendorPath(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/')
    return VENDOR_PATTERNS.some(pattern => minimatch(normalized, pattern))
}

/** Common entry point filenames across ecosystems (without extensions) */
const ENTRY_BASENAMES = ['index', 'main', 'app', 'server', 'mod', 'lib', '__init__', 'manage', 'program', 'startup']

/** Infer the project language from the file extensions present */
function inferLanguageFromFiles(parsedFiles: ParsedFile[]): string {
    const extCounts = new Map<string, number>()
    for (const f of parsedFiles) {
        const ext = f.path.split('.').pop()?.toLowerCase() || ''
        extCounts.set(ext, (extCounts.get(ext) || 0) + 1)
    }
    const extToFamily: Record<string, string> = {
        ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
        mjs: 'javascript', cjs: 'javascript', py: 'python', go: 'go',
        rs: 'rust', java: 'java', kt: 'kotlin', rb: 'ruby', php: 'php',
        cs: 'csharp', swift: 'swift', dart: 'dart', ex: 'elixir', exs: 'elixir',
    }
    const familyToProjectLanguage: Record<string, string> = {
        javascript: 'javascript',
        typescript: 'typescript',
        python: 'python',
        go: 'go',
        rust: 'rust',
        java: 'java',
        kotlin: 'kotlin',
        ruby: 'ruby',
        php: 'php',
        csharp: 'csharp',
        swift: 'swift',
        dart: 'dart',
        elixir: 'elixir',
    }
    const familyGroups: Record<string, string> = {
        javascript: 'js-family',
        typescript: 'js-family',
        python: 'python-family',
        go: 'go-family',
        rust: 'rust-family',
        java: 'jvm-family',
        kotlin: 'jvm-family',
        ruby: 'ruby-family',
        php: 'php-family',
        csharp: 'dotnet-family',
        swift: 'swift-family',
        dart: 'dart-family',
        elixir: 'beam-family',
    }
    const languageFamilies = new Set<string>()
    for (const [ext, count] of extCounts) {
        if (count <= 0) continue
        const family = extToFamily[ext]
        if (!family) continue
        languageFamilies.add(familyGroups[family] || family)
    }
    if (languageFamilies.size > 1) return 'polyglot'

    // Determine dominant extension
    let maxExt = 'ts'
    let maxCount = 0
    for (const [ext, count] of extCounts) {
        if (count > maxCount) { maxExt = ext; maxCount = count }
    }
    const dominantFamily = extToFamily[maxExt]
    return dominantFamily ? (familyToProjectLanguage[dominantFamily] || dominantFamily) : 'unknown'
}

/**
 * ContractGenerator — generates a mikk.json skeleton from graph analysis.
 * Takes detected module clusters and produces a human-refinable contract.
 */
export class ContractGenerator {
    /** Generate a full mikk.json contract from detected clusters */
    generateFromClusters(
        clusters: ModuleCluster[],
        parsedFiles: ParsedFile[],
        projectName: string,
        packageJsonDescription?: string,
        projectRoot?: string
    ): MikkContract {
        // Filter out vendor files from clusters
        const filteredClusters = clusters.map(cluster => ({
            ...cluster,
            files: cluster.files.filter(f => !isVendorPath(f)),
        })).filter(cluster => cluster.files.length > 0)

        const rawModules = filteredClusters.map(cluster => ({
            id: cluster.id,
            name: cluster.suggestedName,
            description: this.inferModuleDescription(cluster, parsedFiles),
            intent: '',
            paths: this.inferPaths(cluster.files, projectRoot),
            entryFunctions: this.inferEntryFunctions(cluster, parsedFiles),
            files: cluster.files,
        }))

        // Deduplicate modules that share the same canonical package root.
        // When ClusterDetector creates two clusters both covering e.g. "packages/cli",
        // merge them into one module rather than emitting packages-cli and packages-cli-2.
        // Merging: union paths, union entryFunctions, keep the larger cluster's name/description.
        const pkgRootOf = (paths: string[]) => {
            if (!paths.length) return null
            const first = paths[0].replace(/\*\*$/, '').replace(/\/$/, '')
            const parts = first.split('/')
            if (parts.length >= 2 && (parts[0] === 'packages' || parts[0] === 'apps')) {
                return parts[0] + '/' + parts[1]
            }
            return parts[0] || null
        }
        const seen = new Map<string, typeof rawModules[0]>()
        for (const mod of rawModules) {
            const root = pkgRootOf(mod.paths)
            const key = root || mod.id
            const existing = seen.get(key)
            if (!existing) {
                seen.set(key, { ...mod })
            } else {
                // Merge: union paths (dedup), union entryFunctions, keep larger name/desc
                const allPaths = [...new Set([...existing.paths, ...mod.paths])]
                existing.paths = allPaths
                existing.entryFunctions = [...new Set([...existing.entryFunctions, ...mod.entryFunctions])]
                if (mod.entryFunctions.length > existing.entryFunctions.length) {
                    existing.name = mod.name
                    existing.description = mod.description
                }
            }
        }
        const modules = this.normalizePortableModules([...seen.values()], parsedFiles, projectRoot)

        // Detect entry points — language-agnostic basename matching
        const entryPoints = parsedFiles
            .filter(f => !isVendorPath(f.path))
            .filter(f => {
                const basename = (f.path.split('/').pop() || '').replace(/\.[^.]+$/, '')
                return ENTRY_BASENAMES.includes(basename)
            })
            .map(f => f.path)

        const filteredParsedFiles = parsedFiles.filter(f => !isVendorPath(f.path))
        const detectedLanguage = inferLanguageFromFiles(filteredParsedFiles)
        const fallbackEntry = filteredParsedFiles[0]?.path ?? 'src/index'

        return {
            version: '1.0.0',
            project: {
                name: projectName,
                description: packageJsonDescription || '',
                language: detectedLanguage,
                entryPoints: entryPoints.length > 0 ? entryPoints : [fallbackEntry],
            },
            declared: {
                modules: modules.map(m => ({
                    id: m.id,
                    name: m.name,
                    description: m.description,
                    intent: m.intent,
                    paths: m.paths,
                    entryFunctions: m.entryFunctions,
                })),
                constraints: [],
                decisions: [],
            },
            overwrite: {
                mode: 'never',
                requireConfirmation: true,
            },
            policies: {
                maxRiskScore: 70,
                maxImpactNodes: 10,
                protectedModules: ['auth', 'security', 'billing'],
                enforceStrictBoundaries: true,
                requireReasoningForCritical: true,
            },
        }
    }

    private normalizePortableModules(
        modules: Array<{
            id: string
            name: string
            description: string
            intent: string
            paths: string[]
            entryFunctions: string[]
            files: string[]
        }>,
        parsedFiles: ParsedFile[],
        projectRoot?: string
    ): Array<{
        id: string
        name: string
        description: string
        intent: string
        paths: string[]
        entryFunctions: string[]
    }> {
        const buckets = new Map<string, Set<string>>()
        for (const mod of modules) {
            for (const filePath of mod.files) {
                const rootKey = this.inferPortableRoot(filePath, projectRoot)
                if (!buckets.has(rootKey)) buckets.set(rootKey, new Set<string>())
                buckets.get(rootKey)!.add(filePath)
            }
        }

        const usedIds = new Map<string, number>()
        const out: Array<{
            id: string
            name: string
            description: string
            intent: string
            paths: string[]
            entryFunctions: string[]
        }> = []

        for (const [rootKey, files] of buckets.entries()) {
            const fileList = [...files]
            const baseId = rootKey.replace(/[\\/]+/g, '-').replace(/[^a-zA-Z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'root'
            const idCount = (usedIds.get(baseId) ?? 0) + 1
            usedIds.set(baseId, idCount)
            const moduleId = idCount > 1 ? `${baseId}-${idCount}` : baseId

            const name = rootKey.split('/').map(seg => seg.charAt(0).toUpperCase() + seg.slice(1)).join(' ')
            const paths = this.inferPaths(fileList, projectRoot)
            const entryFunctions = this.inferEntryFunctionsForFiles(fileList, parsedFiles)
            const description = `${fileList.length} files, ${entryFunctions.length} exported entry functions`

            out.push({
                id: moduleId,
                name,
                description,
                intent: '',
                paths,
                entryFunctions,
            })
        }

        return out.sort((a, b) => a.id.localeCompare(b.id))
    }

    private inferPortableRoot(filePath: string, projectRoot?: string): string {
        const normFile = filePath.replace(/\\/g, '/')
        const normRoot = projectRoot ? projectRoot.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase() + '/' : null
        const rel = normRoot && normFile.toLowerCase().startsWith(normRoot)
            ? normFile.slice(normRoot.length)
            : normFile.replace(/^[a-zA-Z]:\//, '').replace(/^\/+/, '')
        const parts = rel.split('/').filter(Boolean)
        if (parts.length === 0) return 'root'
        if ((parts[0] === 'packages' || parts[0] === 'apps') && parts.length >= 2) {
            return `${parts[0]}/${parts[1]}`
        }
        if ((parts[0] === 'src' || parts[0] === 'lib' || parts[0] === 'app') && parts.length >= 2) {
            return parts[1]
        }
        return parts[0]
    }

    private inferEntryFunctionsForFiles(files: string[], parsedFiles: ParsedFile[]): string[] {
        const fileSet = new Set(files)
        const entries: string[] = []
        for (const file of parsedFiles) {
            if (!fileSet.has(file.path)) continue
            for (const fn of file.functions) {
                if (fn.isExported) entries.push(fn.name)
            }
        }
        return [...new Set(entries)]
    }

    /**
     * Infer a meaningful description for a module from its functions.
     * Analyses function names, purposes, and patterns to produce
     * something like "Handles user authentication and JWT verification"
     * instead of "Contains 4 files with 12 functions".
     */
    private inferModuleDescription(cluster: ModuleCluster, parsedFiles: ParsedFile[]): string {
        const clusterFileSet = new Set(cluster.files)
        const purposes: string[] = []
        const fnNames: string[] = []
        let totalFunctions = 0

        for (const file of parsedFiles) {
            if (!clusterFileSet.has(file.path)) continue
            for (const fn of file.functions) {
                totalFunctions++
                fnNames.push(fn.name)
                if (fn.purpose) purposes.push(fn.purpose)
            }
        }

        // If we have good JSDoc purposes, summarise the top ones
        if (purposes.length > 0) {
            // Deduplicate and pick up to 3 unique purpose summaries
            const unique = [...new Set(purposes)]
            const short = unique.slice(0, 3).map(p => {
                // Take first sentence, max 60 chars
                const first = p.split(/[.!?]/)[0].trim()
                return first.length > 60 ? first.slice(0, 57) + '...' : first
            })
            return short.join('; ')
        }

        // Fallback: describe by dominant verb patterns
        const verbs = new Map<string, number>()
        for (const name of fnNames) {
            const first = name.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[\s_-]/)[0].toLowerCase()
            verbs.set(first, (verbs.get(first) || 0) + 1)
        }
        const sorted = [...verbs.entries()].sort((a, b) => b[1] - a[1])
        if (sorted.length > 0) {
            const top = sorted.slice(0, 3).map(([v]) => v)
            return `primarily ${top.join(', ')} operations across ${cluster.files.length} files`
        }

        return `${cluster.files.length} files, ${totalFunctions} functions`
    }

    /** Infer RELATIVE path patterns from a list of absolute file paths.
     *  Strips projectRoot so patterns like "packages/core/src/**" work portably.
     *  Rules:
     *  - Paths are always relative (never absolute, never start with /)
     *  - Never emit bare /** (would match entire project)
     *  - For monorepo layouts, group by top-level package so cross-package
     *    clusters don't bleed into each other
     *  - Deduplicate: drop child dirs already covered by a parent glob
     */
    /**
     * Infer RELATIVE path patterns from a list of absolute file paths.
     *
     * Key rules:
     * 1. Always relative — never absolute, never starting with /.
     * 2. Never emit bare /**  (would match the entire project).
     * 3. MONOREPO BOUNDARY RULE: Each top-level package (packages/<n>, apps/<n>)
     *    is a hard boundary. A cluster that spans multiple packages emits one
     *    scoped pattern per package it actually has files in.
     *    This prevents cross-package contamination where one big cluster
     *    accidentally claims paths belonging to other, smaller modules.
     * 4. Within a package, deduplicate so child dirs covered by a parent glob
     *    are dropped.
     */
    private inferPaths(files: string[], projectRoot?: string): string[] {
        if (files.length === 0) return []

        const normRoot = projectRoot
            ? projectRoot.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase() + '/'
            : null

        // Step 1: normalise every file to a relative forward-slash lowercase path
        const relPaths: string[] = []
        for (const file of files) {
            let normalized = file.replace(/\\/g, '/').toLowerCase()
            if (normRoot && normalized.startsWith(normRoot)) {
                normalized = normalized.slice(normRoot.length)
            }
            // Strip drive letters or stray leading slashes after root stripping
            normalized = normalized.replace(/^[a-z]:[/\\]/, '').replace(/^\/+/, '')
            if (normalized) relPaths.push(normalized)
        }

        // Step 2: group file directories by their monorepo package root.
        // Package root = first two path segments when top-level is "packages" or "apps",
        // e.g. "packages/core" or "apps/web".  Everything else uses just the first segment.
        const MONO_ROOTS = new Set(['packages', 'apps'])
        const pkgGroups = new Map<string, string[]>()   // pkgRoot -> [dir, ...]

        for (const rel of relPaths) {
            const parts = rel.split('/')
            if (parts.length === 0) continue
            const dirParts = parts.slice(0, -1)         // drop filename

            let pkgRoot: string
            if (dirParts.length >= 2 && MONO_ROOTS.has(dirParts[0])) {
                pkgRoot = dirParts[0] + '/' + dirParts[1]   // "packages/core"
            } else if (dirParts.length >= 1) {
                pkgRoot = dirParts[0]                        // "scripts", top-level apps
            } else {
                continue                                     // file sits at project root — skip
            }

            const dir = dirParts.join('/')
            if (!pkgGroups.has(pkgRoot)) pkgGroups.set(pkgRoot, [])
            pkgGroups.get(pkgRoot)!.push(dir)
        }

        // Step 3: for each package emit the minimal covering set of globs
        const result: string[] = []
        for (const [, dirs] of pkgGroups) {
            const unique = [...new Set(dirs)].filter(d => d.length > 0)
            if (unique.length === 0) continue
            unique.sort((a, b) => a.length - b.length)

            const kept: string[] = []
            for (const dir of unique) {
                const covered = kept.some(k => dir === k || dir.startsWith(k + '/'))
                if (!covered) kept.push(dir)
            }
            for (const dir of kept) result.push(`${dir}/**`)
        }

        return result
    }

    /** Find exported functions in a cluster — these are likely entry points */
    private inferEntryFunctions(cluster: ModuleCluster, parsedFiles: ParsedFile[]): string[] {
        const clusterFileSet = new Set(cluster.files)
        const entryFunctions: string[] = []

        for (const file of parsedFiles) {
            if (!clusterFileSet.has(file.path)) continue
            for (const fn of file.functions) {
                if (fn.isExported) {
                    entryFunctions.push(fn.name)
                }
            }
        }

        return entryFunctions
    }
}
