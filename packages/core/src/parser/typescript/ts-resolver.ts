import * as path from 'node:path'
import type { ParsedImport, ParsedFile } from '../types.js'

interface TSConfigPaths {
    [alias: string]: string[]
}

/**
 * TypeScriptResolver — resolves TS/TSX import paths to project-relative files.
 *
 * Handles:
 *   - Relative ESM imports: import './utils' → ./utils.ts / ./utils/index.ts / ...
 *   - Path aliases from tsconfig.json compilerOptions.paths
 *   - Mixed TS/JS projects: probes .ts, .tsx, .js, .jsx in that order
 *
 * Performance: allProjectFiles is converted to a Set internally for O(1) checks.
 * All alias targets are tried in order (not just targets[0]).
 */
export class TypeScriptResolver {
    private aliases: TSConfigPaths

    constructor(
        private projectRoot: string,
        tsConfigPaths?: TSConfigPaths
    ) {
        this.aliases = tsConfigPaths ?? {}
    }

    /** Resolve all imports for a batch of files */
    public resolveBatch(files: ParsedFile[]): ParsedFile[] {
        const allFilePaths = files.map(f => f.path)
        return files.map(file => ({
            ...file,
            imports: this.resolveAll(file.imports, file.path, allFilePaths)
        }))
    }


    /** Resolve a single import relative to the importing file */
    resolve(imp: ParsedImport, fromFile: string, allProjectFiles: string[] = []): ParsedImport {
        if (
            !imp.source.startsWith('.') &&
            !imp.source.startsWith('/') &&
            !this.matchesAlias(imp.source)
        ) {
            return { ...imp, resolvedPath: '' }
        }
        const fileSet = allProjectFiles.length > 0 ? new Set(allProjectFiles) : null
        return { ...imp, resolvedPath: this.resolvePath(imp.source, fromFile, fileSet) }
    }

    resolveAll(imports: ParsedImport[], fromFile: string, allProjectFiles: string[] = []): ParsedImport[] {
        const fileSet = allProjectFiles.length > 0 ? new Set(allProjectFiles) : null
        return imports.map(imp => {
            if (
                !imp.source.startsWith('.') &&
                !imp.source.startsWith('/') &&
                !this.matchesAlias(imp.source)
            ) {
                return { ...imp, resolvedPath: '' }
            }
            return { ...imp, resolvedPath: this.resolvePath(imp.source, fromFile, fileSet) }
        })
    }

    private resolvePath(source: string, fromFile: string, fileSet: Set<string> | null): string {
        // 1. Alias substitution — try ALL targets in order, not just targets[0]
        for (const [alias, targets] of Object.entries(this.aliases)) {
            const prefix = alias.replace('/*', '')
            if (source.startsWith(prefix)) {
                const suffix = source.slice(prefix.length)
                for (const target of targets) {
                    const substituted = target.replace('/*', '') + suffix
                    const resolved = this.normalizePath(substituted, fromFile)
                    const found = this.probeExtensions(resolved, fileSet)
                    if (found) return found
                }
                // All alias targets exhausted — unresolved
                return ''
            }
        }

        // 2. Build normalized posix path from relative source
        const resolved = this.normalizePath(source, fromFile)

        // 3. Already has a concrete TS/JS extension — validate and return
        const concreteExts = ['.ts', '.tsx', '.js', '.jsx', '.mjs']
        if (concreteExts.some(e => resolved.endsWith(e))) {
            if (fileSet && !fileSet.has(resolved)) return ''
            return resolved
        }

        // 4. Probe extensions
        return this.probeExtensions(resolved, fileSet) ?? resolved + '.ts'
    }

    private normalizePath(source: string, fromFile: string): string {
        let resolved: string
        if (source.startsWith('.')) {
            const fromDir = path.dirname(fromFile.replace(/\\/g, '/'))
            resolved = path.posix.normalize(path.posix.join(fromDir, source))
        } else {
            resolved = source
        }
        return resolved.replace(/\\/g, '/')
    }

    /**
     * Probe extensions in priority order.
     * TS-first since this is a TypeScript resolver; JS fallback for mixed projects.
     */
    private probeExtensions(resolved: string, fileSet: Set<string> | null): string | null {
        const probeOrder = [
            '.ts', '.tsx',
            '/index.ts', '/index.tsx',
            '.js', '.jsx', '.mjs',
            '/index.js', '/index.jsx',
        ]
        for (const ext of probeOrder) {
            const candidate = resolved + ext
            if (fileSet === null || fileSet.has(candidate)) return candidate
        }
        return null
    }

    private matchesAlias(source: string): boolean {
        return Object.keys(this.aliases).some(a => source.startsWith(a.replace('/*', '')))
    }
}
