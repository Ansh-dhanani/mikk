import { describe, it, expect, beforeEach } from 'bun:test';
import { parseFilesWithDiagnostics } from '../src/parser/index.js';
import { ErrorRecoveryEngine } from '../src/parser/error-recovery.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('Error Recovery Integration', () => {
    let tmpDir: string;
    
    beforeEach(() => {
        tmpDir = path.join(os.tmpdir(), 'mikk-error-recovery-' + Math.random().toString(36).slice(2));
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

    describe('ErrorRecoveryEngine', () => {
        it('extracts functions from malformed TypeScript', async () => {
            const content = `
                function validate(data) {
                    if (data === null) return
                    return data.trim()
                }
                
                class Handler {
                    process(x) { return x * 2 }
                }
                
                import { foo } from './utils';
            `;
            
            const engine = new ErrorRecoveryEngine();
            const result = await engine.recover('/test.ts', content, 'typescript');
            
            expect(result.success).toBe(true);
            expect(result.parsed.functions.length).toBeGreaterThan(0);
            expect(result.confidence).toBeGreaterThan(0);
            
            const fnNames = result.parsed.functions.map(f => f.name);
            expect(fnNames).toContain('validate');
        });

        it('extracts functions from malformed Python', async () => {
            const content = `
                def calculate(x, y):
                    if x is None:
                        return None
                    return x + y
                
                class DataProcessor:
                    def run(self, data):
                        return data
            `;
            
            const engine = new ErrorRecoveryEngine();
            const result = await engine.recover('/test.py', content, 'python');
            
            expect(result.success).toBe(true);
            expect(result.parsed.functions.length).toBeGreaterThanOrEqual(2);
            
            const fnNames = result.parsed.functions.map(f => f.name);
            expect(fnNames).toContain('calculate');
        });

        it('extracts imports from JavaScript', async () => {
            const content = `
                import { foo, bar } from './module';
                import defaultExport from './other';
            `;
            
            const engine = new ErrorRecoveryEngine();
            const result = await engine.recover('/test.js', content, 'javascript');
            
            expect(result.success).toBe(true);
            expect(result.parsed.imports.length).toBeGreaterThan(0);
        });

        it('returns zero confidence for completely invalid content', async () => {
            const content = `{{{{ invalid !!!`;
            
            const engine = new ErrorRecoveryEngine();
            const result = await engine.recover('/test.ts', content, 'typescript');
            
            expect(result.confidence).toBeLessThanOrEqual(0);
        });
    });

    describe('parseFilesWithDiagnostics integration', () => {
        it('handles unsupported extensions gracefully', async () => {
            const { filePaths, readFile } = await setupFiles({
                'test.xyz': `function foo() {}`
            });

            const result = await parseFilesWithDiagnostics(filePaths, tmpDir, readFile);

            expect(result.files.length).toBe(1);
            expect(result.summary.unsupportedFiles).toBe(1);
        });

        it('parses valid TypeScript successfully', async () => {
            const { filePaths, readFile } = await setupFiles({
                'valid.ts': `
                    export function processData(input: string): string {
                        return input.trim();
                    }
                    
                    export class Handler {
                        handle(data: unknown) {}
                    }
                `
            });

            const result = await parseFilesWithDiagnostics(filePaths, tmpDir, readFile);

            expect(result.files.length).toBe(1);
            const validFile = result.files[0];
            expect(validFile.functions.length).toBeGreaterThan(0);
            expect(result.diagnostics.filter(d => d.reason === 'parse-error')).toHaveLength(0);
        });

        it('handles unreadable files with diagnostic', async () => {
            const nonExistentPath = path.join(tmpDir, 'does-not-exist.ts');
            
            const result = await parseFilesWithDiagnostics(
                [nonExistentPath],
                tmpDir,
                async () => { throw new Error('File not found'); }
            );

            expect(result.summary.unreadableFiles).toBe(1);
            expect(result.diagnostics.some(d => d.reason === 'read-error')).toBe(true);
        });
    });
});
