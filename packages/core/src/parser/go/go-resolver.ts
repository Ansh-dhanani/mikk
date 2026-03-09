import * as path from 'node:path'
import * as fs from 'node:fs'
import type { ParsedImport } from '../types.js'

/**
 * GoResolver — resolves Go import paths to project-relative file paths.
 *
 * Go import paths follow the module path declared in go.mod:
 *   module github.com/user/project
 *
 * An import "github.com/user/project/internal/auth" resolves to
 * the directory internal/auth/ relative to the project root.
 *
 * Third-party imports (not matching the module path) are left unresolved.
 */
export class GoResolver {
    private modulePath: string

    constructor(private readonly projectRoot: string) {
        this.modulePath = readModulePath(projectRoot)
    }

    /** Resolve a list of imports for a single file */
    resolveAll(imports: ParsedImport[]): ParsedImport[] {
        return imports.map(imp => this.resolve(imp))
    }

    private resolve(imp: ParsedImport): ParsedImport {
        const src = imp.source

        // Third-party (doesn't start with our module path) → leave as-is
        if (this.modulePath && !src.startsWith(this.modulePath)) {
            return { ...imp, resolvedPath: '' }
        }

        // Internal import: strip module path prefix, map to relative dir
        const relPath = this.modulePath
            ? src.slice(this.modulePath.length).replace(/^\//, '')
            : src

        // Try to find the entry file in the directory
        const dirPath = relPath.replace(/\//g, path.sep)
        const candidates = [
            path.join(dirPath, path.basename(dirPath) + '.go'),
            path.join(dirPath, 'index.go'),
            dirPath + '.go',
        ]

        for (const candidate of candidates) {
            if (fs.existsSync(path.join(this.projectRoot, candidate))) {
                return { ...imp, resolvedPath: candidate.replace(/\\/g, '/') }
            }
        }

        // Fallback: point to directory (graph builder handles directories separately)
        return { ...imp, resolvedPath: relPath.replace(/\\/g, '/') }
    }
}

/** Read module path from go.mod (e.g. "module github.com/user/myapp") */
function readModulePath(projectRoot: string): string {
    const goModPath = path.join(projectRoot, 'go.mod')
    try {
        const content = fs.readFileSync(goModPath, 'utf-8')
        const m = /^module\s+(\S+)/m.exec(content)
        return m ? m[1] : ''
    } catch {
        return ''
    }
}
