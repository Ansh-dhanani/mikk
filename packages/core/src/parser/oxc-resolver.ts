
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
    }

    private async ensureResolver() {
        if (this.resolver) return;
        const { ResolverFactory } = await import('oxc-resolver');
        const tsconfigPath = path.resolve(this.projectRoot, 'tsconfig.json');
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
    public async resolve(source: string, fromFile: string): Promise<string> {
        try {
            await this.ensureResolver();
            const absFrom = path.isAbsolute(fromFile)
                ? fromFile
                : path.resolve(this.projectRoot, fromFile);
            const dir = path.dirname(absFrom);

            const result = this.resolver.sync(dir, source);

            if (!result?.path) {
                return this.fallbackResolve(source, absFrom);
            }

            const resolved = result.path.replace(/\\/g, '/');

            if (!resolved.startsWith(this.normalizedRoot + '/') && resolved !== this.normalizedRoot) {
                return '';
            }

            return resolved;
        } catch {
            return this.fallbackResolve(source, fromFile);
        }
    }

    /**
     * Fallback resolution when oxc-resolver fails.
     * Tries common patterns: ./file, ../file, index files, etc.
     */
    private fallbackResolve(source: string, fromFile: string): string {
        if (!source || source.startsWith('node:') || source.startsWith('@')) {
            return '';
        }

        const absFrom = path.isAbsolute(fromFile) ? fromFile : path.resolve(this.projectRoot, fromFile);
        const baseDir = path.dirname(absFrom);
        
        const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
        
        for (const ext of extensions) {
            const candidate = source.endsWith(ext) ? source : source + ext;
            const resolved = path.resolve(baseDir, candidate).replace(/\\/g, '/');
            
            if (fs.existsSync(resolved)) {
                if (resolved.startsWith(this.normalizedRoot + '/') || resolved === this.normalizedRoot) {
                    return resolved;
                }
            }
        }
        
        return '';
    }


    /** Resolve all imports for a batch of files in one pass */
    public async resolveBatch(files: ParsedFile[]): Promise<ParsedFile[]> {
        return Promise.all(files.map(async file => ({
            ...file,
            imports: await Promise.all(file.imports.map(async imp => ({
                ...imp,
                resolvedPath: await this.resolve(imp.source, file.path),
            }))),
        })));
    }
}

