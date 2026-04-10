import { describe, it, expect, afterEach, beforeEach } from 'bun:test';
import { GraphBuilder } from '../src/graph/graph-builder.js';
import { parseFiles } from '../src/parser/index.js';
import { OxcResolver } from '../src/parser/oxc-resolver.js';
import '../src/parser/oxc-parser.js';
import '../src/parser/go/go-extractor.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

async function resolveImports(files: any[], projectRoot: string) {
    const resolver = new OxcResolver(projectRoot);
    return resolver.resolveBatch(files);
}

describe('🚀 Mikk Strategy Restoration Verification', () => {
    let tmpDir: string;
    
    beforeEach(() => {
        tmpDir = path.join(os.tmpdir(), 'mikk-verification-' + Math.random().toString(36).slice(2));
    });
    
    afterEach(() => {
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
            // ignore cleanup errors
        }
    });

    async function setupFiles(files: Record<string, string>) {
        for (const [name, content] of Object.entries(files)) {
            const filePath = path.join(tmpDir, name);
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, content);
        }
        const filePaths = Object.keys(files).map(f => path.join(tmpDir, f));
        const readFile = async (p: string) => fs.readFileSync(p, 'utf-8');
        return { filePaths, readFile };
    }

    it('should resolve aliased imports correctly', async () => {
        const { filePaths, readFile } = await setupFiles({
            'utils.ts': `
                export function validateInput(data) {
                    return data !== null && data !== undefined;
                }
                export function sanitize(data) {
                    return String(data).trim();
                }
            `,
            'handler.ts': `
                import { validateInput as check, sanitize as clean } from "./utils";
                
                export function process(data) {
                    if (check(data)) {
                        return clean(data);
                    }
                    return null;
                }
            `
        });

        const parsedFiles = await parseFiles(filePaths, tmpDir, readFile);
        const resolvedFiles = await resolveImports(parsedFiles, tmpDir);

        const builder = new GraphBuilder();
        const graph = builder.build(resolvedFiles);

        const processNode = Array.from(graph.nodes.values()).find(n => n.name === 'process');
        const checkNode = Array.from(graph.nodes.values()).find(n => n.name === 'validateInput');
        const cleanNode = Array.from(graph.nodes.values()).find(n => n.name === 'sanitize');

        expect(processNode).toBeDefined();
        expect(checkNode).toBeDefined();
        expect(cleanNode).toBeDefined();

        const checkEdge = graph.edges.find(e => e.from === processNode!.id && e.to === checkNode!.id);
        const cleanEdge = graph.edges.find(e => e.from === processNode!.id && e.to === cleanNode!.id);

        expect(checkEdge).toBeDefined();
        expect(cleanEdge).toBeDefined();
    });

    it('should resolve default import with method call', async () => {
        const { filePaths, readFile } = await setupFiles({
            'jwt.ts': `
                export function verifyToken(token) {
                    return token.startsWith('eyJ');
                }
                export function decodeToken(token) {
                    return JSON.parse(atob(token.split('.')[1]));
                }
            `,
            'auth.ts': `
                import jwt from "./jwt";
                
                export function validate(req) {
                    return jwt.verifyToken(req.token);
                }
            `
        });

        const parsedFiles = await parseFiles(filePaths, tmpDir, readFile);
        const resolvedFiles = await resolveImports(parsedFiles, tmpDir);

        const builder = new GraphBuilder();
        const graph = builder.build(resolvedFiles);

        const validateNode = Array.from(graph.nodes.values()).find(n => n.name === 'validate');
        const verifyNode = Array.from(graph.nodes.values()).find(n => n.name === 'verifyToken');

        expect(validateNode).toBeDefined();
        expect(verifyNode).toBeDefined();

        const edge = graph.edges.find(e => e.from === validateNode!.id && e.to === verifyNode!.id);
        expect(edge).toBeDefined();
    });

    it('should resolve cross-file calls using the GlobalSymbolTable', async () => {
        const { filePaths, readFile } = await setupFiles({
            'auth.ts': `
                import { verify } from "./crypto";
                export function login(u) { return verify(u); }
            `,
            'crypto.ts': `
                export function verify(t) { return "ok"; }
            `
        });

        const parsedFiles = await parseFiles(filePaths, tmpDir, readFile);
        const resolvedFiles = await resolveImports(parsedFiles, tmpDir);

        const builder = new GraphBuilder();
        const graph = builder.build(resolvedFiles);

        const loginNode = Array.from(graph.nodes.values()).find(n => n.name === 'login');
        const verifyNode = Array.from(graph.nodes.values()).find(n => n.name === 'verify');

        expect(loginNode).toBeDefined();
        expect(verifyNode).toBeDefined();

        const edges = graph.edges.filter(e => e.from === loginNode!.id && e.to === verifyNode!.id);
        expect(edges.length).toBeGreaterThan(0);
        expect(edges[0].type).toBe('calls');
    });

    it('should handle taint flow between files', async () => {
        const { filePaths, readFile } = await setupFiles({
            'app.ts': `
                import { DB } from "./db";
                const db = new DB();
                function handle(req) { db.query(req.input); }
            `,
            'db.ts': `
                export class DB { query(q) {} }
            `
        });

        const parsedFiles = await parseFiles(filePaths, tmpDir, readFile);
        const resolvedFiles = await resolveImports(parsedFiles, tmpDir);

        const builder = new GraphBuilder();
        const graph = builder.build(resolvedFiles);

        const handleNode = Array.from(graph.nodes.values()).find(n => n.name === 'handle');
        const queryNode = Array.from(graph.nodes.values()).find(n => n.name === 'DB.query');

        expect(handleNode).toBeDefined();
        expect(queryNode).toBeDefined();

        const edge = graph.edges.find(e => e.from === handleNode!.id && e.to === queryNode!.id);
        expect(edge).toBeDefined();
    });
});
