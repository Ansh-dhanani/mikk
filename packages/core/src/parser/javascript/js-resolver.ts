import * as path from 'node:path'
import type { ParsedImport } from '../types.js'

/**
 * JavaScriptResolver — resolves JS/JSX/CJS import paths to project-relative files.
 *
 * Handles:
 *   - Relative ESM imports:  import './utils'  →  ./utils.js / ./utils/index.js / ...
 *   - CommonJS require():    require('./db')    →  same resolution order
 *   - Path aliases from jsconfig.json / tsconfig.json
 *   - Mixed TS/JS projects: falls back to .ts/.tsx if no JS file matched
 *
 * Extension probe order: .js → .jsx → .mjs → .cjs → index.js → index.jsx →
 *                         .ts → .tsx → index.ts → index.tsx
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
        return { ...imp, resolvedPath: this.resolvePath(imp.source, fromFile, allProjectFiles) }
    }

    resolveAll(imports: ParsedImport[], fromFile: string, allProjectFiles: string[] = []): ParsedImport[] {
        return imports.map(imp => this.resolve(imp, fromFile, allProjectFiles))
    }

    private resolvePath(source: string, fromFile: string, allProjectFiles: string[]): string {
        let resolvedSource = source

        // 1. Alias substitution
        for (const [alias, targets] of Object.entries(this.aliases)) {
            const prefix = alias.replace('/*', '')
            if (source.startsWith(prefix)) {
                resolvedSource = targets[0].replace('/*', '') + source.slice(prefix.length)
                break
            }
        }

        // 2. Build absolute-like posix path
        let resolved: string
        if (resolvedSource.startsWith('.')) {
            resolved = path.posix.normalize(path.posix.join(path.dirname(fromFile), resolvedSource))
        } else {
            resolved = resolvedSource
        }
        resolved = resolved.replace(/\\/g, '/')

        // 3. Already has a concrete extension — return as-is
        const knownExts = ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx']
        if (knownExts.some(e => resolved.endsWith(e))) return resolved

        // 4. Probe extensions: prefer JS-family first, fall back to TS for mixed projects
        const probeOrder = [
            '.js', '.jsx', '.mjs', '.cjs',
            '/index.js', '/index.jsx', '/index.mjs',
            '.ts', '.tsx',
            '/index.ts', '/index.tsx',
        ]
        for (const ext of probeOrder) {
            const candidate = resolved + ext
            if (allProjectFiles.length === 0 || allProjectFiles.includes(candidate)) {
                return candidate
            }
        }

        return resolved + '.js'
    }

    private matchesAlias(source: string): boolean {
        return Object.keys(this.aliases).some(a => source.startsWith(a.replace('/*', '')))
    }
}
