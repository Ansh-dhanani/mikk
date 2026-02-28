import * as path from 'node:path'
import type { ParsedImport } from '../types.js'

interface TSConfigPaths {
    [alias: string]: string[]
}

/**
 * Resolves TypeScript import paths to absolute project-relative paths.
 * Handles: relative imports, path aliases, index files, extension inference.
 */
export class TypeScriptResolver {
    private aliases: TSConfigPaths

    constructor(
        private projectRoot: string,
        tsConfigPaths?: TSConfigPaths
    ) {
        this.aliases = tsConfigPaths || {}
    }

    /** Resolve a single import relative to the importing file */
    resolve(imp: ParsedImport, fromFile: string, allProjectFiles: string[] = []): ParsedImport {
        // Skip external packages (no relative path prefix, no alias match)
        if (!imp.source.startsWith('.') && !imp.source.startsWith('/') && !this.matchesAlias(imp.source)) {
            return { ...imp, resolvedPath: '' }
        }

        const resolved = this.resolvePath(imp.source, fromFile, allProjectFiles)
        return { ...imp, resolvedPath: resolved }
    }

    private resolvePath(source: string, fromFile: string, allProjectFiles: string[]): string {
        let resolvedSource = source

        // 1. Handle path aliases: @/utils/jwt → src/utils/jwt
        for (const [alias, targets] of Object.entries(this.aliases)) {
            const aliasPrefix = alias.replace('/*', '')
            if (source.startsWith(aliasPrefix)) {
                const suffix = source.slice(aliasPrefix.length)
                const target = targets[0].replace('/*', '')
                resolvedSource = target + suffix
                break
            }
        }

        // 2. Handle relative paths
        let resolved: string
        if (resolvedSource.startsWith('.')) {
            const fromDir = path.dirname(fromFile)
            resolved = path.posix.normalize(path.posix.join(fromDir, resolvedSource))
        } else {
            resolved = resolvedSource
        }

        // Normalize to posix
        resolved = resolved.replace(/\\/g, '/')

        // 3. Try to find exact match with extensions
        const extensions = ['.ts', '.tsx', '/index.ts', '/index.tsx']

        // If the path already has an extension, return it
        if (resolved.endsWith('.ts') || resolved.endsWith('.tsx')) {
            return resolved
        }

        // Try adding extensions to find matching file
        for (const ext of extensions) {
            const candidate = resolved + ext
            if (allProjectFiles.length === 0 || allProjectFiles.includes(candidate)) {
                return candidate
            }
        }

        // Fallback: just add .ts
        return resolved + '.ts'
    }

    private matchesAlias(source: string): boolean {
        for (const alias of Object.keys(this.aliases)) {
            const prefix = alias.replace('/*', '')
            if (source.startsWith(prefix)) return true
        }
        return false
    }
}
