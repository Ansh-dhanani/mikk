import { ResolverFactory } from 'oxc-resolver';
import path from 'node:path';
import fs from 'node:fs';
import type { ParsedFile } from './types.js';

/**
 * OxcResolver — Rust-backed compiler-grade module resolution.
 *
 * Resolution strategy:
 *  1. If the resolved path is inside projectRoot → return project-relative posix path
 *  2. If the resolved path is outside projectRoot (node_modules, monorepo peer) → return ''
 *     (external deps produce no graph edges; they're not in our file set)
 *  3. On any error → return '' (unresolved, no false edges)
 *
 * All returned paths use forward slashes and are ABSOLUTE, matching what
 * parseFiles passes to parse().  graph-builder only creates import edges when
 * the target path exists as a file node — so no path format inconsistency can
 * create false positive edges.
 */
export class OxcResolver {
    private resolver: any;
    private readonly normalizedRoot: string;

    constructor(private readonly projectRoot: string) {
        this.normalizedRoot = path.resolve(projectRoot).replace(/\\/g, '/');

        const tsconfigPath = path.resolve(projectRoot, 'tsconfig.json');
        const hasTsConfig = fs.existsSync(tsconfigPath);

        this.resolver = new ResolverFactory({
            extensions: ['.ts', '.tsx', '.js', '.jsx', '.json', '.mjs', '.cjs', '.mts', '.cts'],
            mainFields: ['module', 'main', 'jsnext:main'],
            mainFiles: ['index', 'main', 'app'],
            conditionNames: ['import', 'require', 'node', 'default', 'types', 'browser'],
            symlinks: true,
            modules: ['node_modules'],
            tsconfig: hasTsConfig ? {
                configFile: tsconfigPath,
                references: 'auto',
            } : undefined,
        });
    }

    /**
     * Resolve a single import source string relative to fromFile.
     * fromFile MUST be an absolute path (as produced by parseFiles).
     * Returns an absolute posix path, or '' if unresolvable/external.
     */
    public resolve(source: string, fromFile: string): string {
        try {
            const absFrom = path.isAbsolute(fromFile)
                ? fromFile
                : path.resolve(this.projectRoot, fromFile);
            const dir = path.dirname(absFrom);

            const result = this.resolver.sync(dir, source);
            if (!result?.path) return '';

            const resolved = result.path.replace(/\\/g, '/');

            // Only include files within our project root in the graph.
            // node_modules, hoisted workspace deps, etc. are external.
            if (!resolved.startsWith(this.normalizedRoot + '/') && resolved !== this.normalizedRoot) {
                return '';
            }

            return resolved;
        } catch {
            return '';
        }
    }

    /** Resolve all imports for a batch of files in one pass */
    public resolveBatch(files: ParsedFile[]): ParsedFile[] {
        return files.map(file => ({
            ...file,
            imports: file.imports.map(imp => ({
                ...imp,
                resolvedPath: this.resolve(imp.source, file.path),
            })),
        }));
    }
}
