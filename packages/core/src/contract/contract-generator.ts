import type { MikkContract } from './schema.js'
import type { ModuleCluster } from '../graph/types.js'
import type { ParsedFile } from '../parser/types.js'

/**
 * ContractGenerator — generates a mikk.json skeleton from graph analysis.
 * Takes detected module clusters and produces a human-refinable contract.
 */
export class ContractGenerator {
    /** Generate a full mikk.json contract from detected clusters */
    generateFromClusters(
        clusters: ModuleCluster[],
        parsedFiles: ParsedFile[],
        projectName: string
    ): MikkContract {
        const modules = clusters.map(cluster => ({
            id: cluster.id,
            name: cluster.suggestedName,
            description: `Contains ${cluster.files.length} files with ${cluster.functions.length} functions`,
            intent: '',
            paths: this.inferPaths(cluster.files),
            entryFunctions: this.inferEntryFunctions(cluster, parsedFiles),
        }))

        // Detect entry points (files with no importedBy)
        const entryPoints = parsedFiles
            .filter(f => {
                const basename = f.path.split('/').pop() || ''
                return basename === 'index.ts' || basename === 'server.ts' || basename === 'main.ts' || basename === 'app.ts'
            })
            .map(f => f.path)

        return {
            version: '1.0.0',
            project: {
                name: projectName,
                description: '',
                language: 'typescript',
                entryPoints: entryPoints.length > 0 ? entryPoints : [parsedFiles[0]?.path ?? 'src/index.ts'],
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
