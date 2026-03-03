import type { MikkContract } from './schema.js'
import type { ModuleCluster } from '../graph/types.js'
import type { ParsedFile } from '../parser/types.js'

/** Common entry point filenames across ecosystems (without extensions) */
const ENTRY_BASENAMES = ['index', 'main', 'app', 'server', 'mod', 'lib', '__init__', 'manage', 'program', 'startup']

/** Infer the project language from the file extensions present */
function inferLanguageFromFiles(parsedFiles: ParsedFile[]): string {
    const extCounts = new Map<string, number>()
    for (const f of parsedFiles) {
        const ext = f.path.split('.').pop()?.toLowerCase() || ''
        extCounts.set(ext, (extCounts.get(ext) || 0) + 1)
    }
    // Determine dominant extension
    let maxExt = 'ts'
    let maxCount = 0
    for (const [ext, count] of extCounts) {
        if (count > maxCount) { maxExt = ext; maxCount = count }
    }
    const extToLang: Record<string, string> = {
        ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
        mjs: 'javascript', cjs: 'javascript', py: 'python', go: 'go',
        rs: 'rust', java: 'java', kt: 'kotlin', rb: 'ruby', php: 'php',
        cs: 'csharp', swift: 'swift', dart: 'dart', ex: 'elixir', exs: 'elixir',
    }
    return extToLang[maxExt] || maxExt
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
        packageJsonDescription?: string
    ): MikkContract {
        const modules = clusters.map(cluster => ({
            id: cluster.id,
            name: cluster.suggestedName,
            description: this.inferModuleDescription(cluster, parsedFiles),
            intent: '',
            paths: this.inferPaths(cluster.files),
            entryFunctions: this.inferEntryFunctions(cluster, parsedFiles),
        }))

        // Detect entry points — language-agnostic basename matching
        const entryPoints = parsedFiles
            .filter(f => {
                const basename = (f.path.split('/').pop() || '').replace(/\.[^.]+$/, '')
                return ENTRY_BASENAMES.includes(basename)
            })
            .map(f => f.path)

        const detectedLanguage = inferLanguageFromFiles(parsedFiles)
        const fallbackEntry = parsedFiles[0]?.path ?? 'src/index'

        return {
            version: '1.0.0',
            project: {
                name: projectName,
                description: packageJsonDescription || '',
                language: detectedLanguage,
                entryPoints: entryPoints.length > 0 ? entryPoints : [fallbackEntry],
            },
            declared: {
                modules,
                constraints: [],
                decisions: [],
            },
            overwrite: {
                mode: 'never',
                requireConfirmation: true,
            },
        }
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
        let hasExported = 0
        let totalFunctions = 0

        for (const file of parsedFiles) {
            if (!clusterFileSet.has(file.path)) continue
            for (const fn of file.functions) {
                totalFunctions++
                fnNames.push(fn.name)
                if (fn.isExported) hasExported++
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

    /** Infer path patterns from a list of files */
    private inferPaths(files: string[]): string[] {
        // Find common directory prefix
        if (files.length === 0) return []

        const dirs = new Set<string>()
        for (const file of files) {
            const parts = file.split('/')
            parts.pop() // Remove filename
            dirs.add(parts.join('/'))
        }

        // Use glob patterns for each unique directory
        return [...dirs].map(dir => `${dir}/**`)
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
