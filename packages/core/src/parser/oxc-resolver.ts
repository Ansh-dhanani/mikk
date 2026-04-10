/* eslint-disable @typescript-eslint/no-explicit-any */

import path from 'node:path';
import fs from 'node:fs';
import type { ParsedFile } from './types.js';


/**
 * OxcResolver — Rust-backed compiler-grade module resolution.
 *
 * Resolution strategy:
 *  1. If the resolved path is inside projectRoot → return project-relative posix path
 *  2. If the resolved path is in a monorepo workspace → return full path
 *  3. If the resolved path is outside projectRoot (node_modules) → return ''
 *     (external deps produce no graph edges; they're not in our file set)
 *  4. On any error → return '' (unresolved, no false edges)
 *
 * All returned paths use forward slashes and are ABSOLUTE, matching what
 * parseFiles passes to parse().  graph-builder only creates import edges when
 * the target path exists as a file node — so no path format inconsistency can
 * create false positive edges.
 */
export class OxcResolver {
    private resolver: any;
    private readonly normalizedRoot: string;
    private workspaceRoots: string[] | null = null;


    constructor(private readonly projectRoot: string) {
        this.normalizedRoot = path.resolve(projectRoot).replace(/\\/g, '/');
    }

    /**
     * Detect all workspace roots in a monorepo setup.
     * Supports: npm workspaces, pnpm workspaces, Turborepo
     */
    private detectWorkspaceRoots(): string[] {
        if (this.workspaceRoots !== null) {
            return this.workspaceRoots;
        }

        const roots: Set<string> = new Set([this.normalizedRoot]);
        const projectDir = path.dirname(this.normalizedRoot);

        // Check for pnpm-workspace.yaml (pnpm workspaces)
        const pnpmWorkspace = path.join(projectDir, 'pnpm-workspace.yaml');
        if (fs.existsSync(pnpmWorkspace)) {
            try {
                const content = fs.readFileSync(pnpmWorkspace, 'utf-8');
                const packageMatch = content.match(/packages:\s*\n([\s\S]*?)(?:\n\n|\n[^ ]|$)/);
                if (packageMatch) {
                    const packagesPattern = packageMatch[1];
                    for (const line of packagesPattern.split('\n')) {
                        const trimmed = line.trim().replace(/^-\s*/, '').replace(/^'\s*/, '').replace(/^\s*/, '');
                        if (trimmed && !trimmed.startsWith('#')) {
                            const wsPath = path.resolve(projectDir, trimmed.replace(/\/\*$/, '')).replace(/\\/g, '/');
                            roots.add(wsPath);
                        }
                    }
                }
            } catch { /* ignore */ }
        }

        // Check for package.json with workspaces field (npm/yarn workspaces)
        const pkgJson = path.join(projectDir, 'package.json');
        if (fs.existsSync(pkgJson)) {
            try {
                const content = fs.readFileSync(pkgJson, 'utf-8');
                const pkg = JSON.parse(content);
                const workspaces = pkg.workspaces;
                if (workspaces) {
                    const patterns = Array.isArray(workspaces) ? workspaces : (workspaces.packages || []);
                    for (const pattern of patterns) {
                        if (typeof pattern === 'string' && !pattern.includes('*')) {
                            const wsPath = path.resolve(projectDir, pattern).replace(/\\/g, '/');
                            roots.add(wsPath);
                        } else if (typeof pattern === 'string') {
                            // Glob pattern - find matching directories
                            const basePattern = pattern.replace(/\/\*$/, '');
                            const basePath = path.resolve(projectDir, basePattern);
                            if (fs.existsSync(basePath)) {
                                try {
                                    const entries = fs.readdirSync(basePath);
                                    for (const entry of entries) {
                                        const entryPath = path.join(basePath, entry);
                                        const stat = fs.statSync(entryPath);
                                        if (stat.isDirectory()) {
                                            const pkgJsonPath = path.join(entryPath, 'package.json');
                                            if (fs.existsSync(pkgJsonPath)) {
                                                roots.add(entryPath.replace(/\\/g, '/'));
                                            }
                                        }
                                    }
                                } catch { /* ignore */ }
                            }
                        }
                    }
                }
            } catch { /* ignore */ }
        }

        // Check for turbo.json (Turborepo)
        const turboJson = path.join(projectDir, 'turbo.json');
        if (fs.existsSync(turboJson)) {
            try {
                const content = fs.readFileSync(turboJson, 'utf-8');
                const turbo = JSON.parse(content);
                if (turbo.pipeline) {
                    for (const task of Object.keys(turbo.pipeline)) {
                        const pipeline = turbo.pipeline[task];
                        if (pipeline?.dependsOn) {
                            for (const dep of pipeline.dependsOn) {
                                if (typeof dep === 'string' && dep.startsWith('^')) {
                                    // Workspace dependency
                                    const wsName = dep.slice(1).replace(/^.*:/, '');
                                    roots.add(path.resolve(projectDir, 'apps', wsName).replace(/\\/g, '/'));
                                    roots.add(path.resolve(projectDir, 'packages', wsName).replace(/\\/g, '/'));
                                }
                            }
                        }
                    }
                }
            } catch { /* ignore */ }
        }

        this.workspaceRoots = [...roots];
        return this.workspaceRoots;
    }

    /**
     * Check if a resolved path is within an accepted workspace root.
     */
    private isInAcceptedWorkspace(resolvedPath: string): boolean {
        if (resolvedPath.startsWith(this.normalizedRoot + '/') || resolvedPath === this.normalizedRoot) {
            return true;
        }

        // Check workspace roots for monorepo packages
        const workspaces = this.detectWorkspaceRoots();
        for (const wsRoot of workspaces) {
            if (resolvedPath.startsWith(wsRoot + '/')) {
                return true;
            }
        }

        // Accept node_modules within workspace packages (but not external)
        const nodeModulesIdx = resolvedPath.indexOf('/node_modules/');
        if (nodeModulesIdx > 0) {
            const prefix = resolvedPath.slice(0, nodeModulesIdx);
            for (const wsRoot of workspaces) {
                if (prefix.startsWith(wsRoot)) {
                    return true;
                }
            }
        }

        return false;
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

            if (!this.isInAcceptedWorkspace(resolved)) {
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
                if (this.isInAcceptedWorkspace(resolved)) {
                    return resolved;
                }
            }
        }
        
        return '';
    }


    /** Resolve all imports for a batch of files in one pass */
    public async resolveBatch(files: ParsedFile[]): Promise<ParsedFile[]> {
        const fileByPath = new Map<string, ParsedFile>();
        for (const file of files) {
            fileByPath.set(file.path, file);
        }

        const resolveWithReexports = async (source: string, fromFile: string, visited: Set<string> = new Set()): Promise<string> => {
            if (visited.has(fromFile)) return '';
            visited.add(fromFile);

            const resolved = await this.resolve(source, fromFile);
            if (!resolved) return '';

            const targetFile = fileByPath.get(resolved);
            if (!targetFile) return resolved;

            for (const re of targetFile.reexports ?? []) {
                if (re.sourceResolved) {
                    const chain = await resolveWithReexports(re.source, resolved, visited);
                    if (chain) return chain;
                }
            }

            return resolved;
        };

        const resolvedFiles: ParsedFile[] = [];
        for (const file of files) {
            const resolvedImports = await Promise.all(file.imports.map(async imp => {
                const resolvedPath = await resolveWithReexports(imp.source, file.path);
                return { ...imp, resolvedPath };
            }));

            const resolvedReexports = await Promise.all((file.reexports ?? []).map(async re => {
                const sourceResolved = await this.resolve(re.source, file.path);
                return { ...re, sourceResolved };
            }));

            resolvedFiles.push({
                ...file,
                imports: resolvedImports,
                reexports: resolvedReexports,
            });
        }

        return resolvedFiles;
    }
}

