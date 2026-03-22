import * as path from 'node:path'
import type { ParsedImport } from '../types.js'

/**
 * JavaScriptResolver — resolves JS/JSX/CJS import paths to project-relative files.
 *
 * Handles:
 *   - Relative ESM imports:  import './utils'  →  ./utils.js / ./utils/index.js / ...
 *   - CommonJS require():    require('./db')    →  same resolution order
 *   - Path aliases from jsconfig.json / tsconfig.json (all targets tried, not just first)
 *   - Mixed TS/JS projects: falls back to .ts/.tsx if no JS file matched
 *
 * Extension probe order: .js → .jsx → .mjs → .cjs → index.js → index.jsx →
 *                         .ts → .tsx → index.ts → index.tsx
 *
 * Performance: allProjectFiles is converted to a Set internally for O(1) membership
 * checks. Pass the same array every call — the Set is built per-call and is cheap
 * for the sizes we deal with, or cache the Set externally and pass it directly.
 */
export class JavaScriptResolver {
    constructor(
        private readonly projectRoot: string,
        private readonly aliases: Record<string, string[]> = {},
    ) {}

    resolve(imp: ParsedImport, fromFile: string, allProjectFiles: string[] = []): ParsedImport {
        // External packages (no ./  /  alias prefix) — leave unresolved
        if (
            !imp.source.startsWith('.') &&
            !imp.source.startsWith('/') &&
            !this.matchesAlias(imp.source)
        ) {
            return { ...imp, resolvedPath: '' }
        }
        // Build Set once per resolve call. For large repos callers should cache this.
        const fileSet = allProjectFiles.length > 0 ? new Set(allProjectFiles) : null
        return { ...imp, resolvedPath: this.resolvePath(imp.source, fromFile, fileSet) }
    }

    resolveAll(imports: ParsedImport[], fromFile: string, allProjectFiles: string[] = []): ParsedImport[] {
        // Build Set once for the entire batch — O(n) instead of O(n * imports * probes)
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
                for (const target of targets) {
                    const substituted = target.replace('/*', '') + source.slice(prefix.length)
                    const resolved = this.normalizePath(substituted, fromFile)
                    const found = this.probeExtensions(resolved, fileSet)
                    if (found) return found
                }
                // All alias targets failed — fall through to return unresolved indicator
                // rather than silently returning a path that doesn't exist
                return ''
            }
        }

        // 2. Build absolute-like posix path from relative source
        const resolved = this.normalizePath(source, fromFile)

        // 3. Already has a concrete extension — validate existence and return
        const knownExts = ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx']
        if (knownExts.some(e => resolved.endsWith(e))) {
            // If we have a file list, validate the path exists in it
            if (fileSet && !fileSet.has(resolved)) return ''
            return resolved
        }

        // 4. Probe extensions in priority order
        return this.probeExtensions(resolved, fileSet) ?? ''
    }

    /** Normalize a source path to a posix-style project-relative path */
    private normalizePath(source: string, fromFile: string): string {
        let resolved: string
        if (source.startsWith('.')) {
            resolved = path.posix.normalize(
                path.posix.join(path.dirname(fromFile.replace(/\\/g, '/')), source)
            )
        } else {
            resolved = source
        }
        return resolved.replace(/\\/g, '/')
    }

    /**
     * Probe file extensions in priority order.
     * Returns the first candidate that exists in the file set,
     * or the first candidate if no file set is provided (legacy behaviour).
     */
    private probeExtensions(resolved: string, fileSet: Set<string> | null): string | null {
        const probeOrder = [
            '.js', '.jsx', '.mjs', '.cjs',
            '/index.js', '/index.jsx', '/index.mjs',
            '.ts', '.tsx',
            '/index.ts', '/index.tsx',
        ]
        for (const ext of probeOrder) {
            const candidate = resolved + ext
            if (fileSet === null || fileSet.has(candidate)) {
                return candidate
            }
        }
        return null
    }

    private matchesAlias(source: string): boolean {
        return Object.keys(this.aliases).some(a => source.startsWith(a.replace('/*', '')))
    }
}
