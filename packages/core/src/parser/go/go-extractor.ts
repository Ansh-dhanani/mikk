/* eslint-disable @typescript-eslint/no-explicit-any */
import { LanguageRegistry } from '../language-registry.js';
import { BaseExtractor } from '../base-extractor.js';
import { hashContent } from '../../hash/file-hasher.js';
import type {
    ParsedFile,
    ParsedFunction,
    ParsedClass,
    ParsedImport,
    ParsedExport,
    ParsedParam,
    ParsedGeneric,
    ParsedRoute,
    CallExpression,
    ParsedVariable
} from '../types.js';

/**
 * GoExtractor: robust regex-based extractor for Go source.
 * Handles structs, interfaces, functions, and common routing patterns.
 */
export class GoExtractor extends BaseExtractor {
    async extract(filePath: string, content: string): Promise<ParsedFile> {
        const normalizedPath = filePath.replace(/\\/g, '/');
        const worker = new GoExtractorWorker(normalizedPath, content);
        
        return {
            path: normalizedPath,
            language: 'go',
            functions: worker.extractFunctions(),
            classes: worker.extractClasses(),
            variables: worker.extractVariables(),
            generics: worker.extractGenerics(),
            imports: worker.extractImports(),
            exports: worker.extractExports(),
            routes: worker.extractRoutes(),
            calls: worker.extractModuleCalls(),
            hash: hashContent(content),
            parsedAt: Date.now()
        };
    }

    async resolveImports(files: ParsedFile[], _projectRoot: string): Promise<ParsedFile[]> {
        // Go import resolution is usually handled by the Resolver
        return files;
    }
}

class GoExtractorWorker {
    private nameCounter = new Map<string, number>();

    constructor(
        private readonly filePath: string,
        private readonly content: string
    ) {}

    private allocateId(prefix: string, name: string): string {
        const count = (this.nameCounter.get(name) ?? 0) + 1;
        this.nameCounter.set(name, count);
        const suffix = count === 1 ? '' : `#${count}`;
        return `${prefix}:${this.filePath}:${name}${suffix}`.toLowerCase();
    }

    extractFunctions(): ParsedFunction[] {
        const functions: ParsedFunction[] = [];
        // Pattern: func Name(args) ret { or func (r Receiver) Name(args) ret {
        const funcRegex = /func\s+(?:\(\s*[^)]+\s*\)\s*)?(\w+)\s*\(([^)]*)\)\s*([^{]*)\{/g;
        let match;
        while ((match = funcRegex.exec(this.content)) !== null) {
            const name = match[1];
            const params = this.parseParams(match[2]);
            const returnType = match[3].trim() || 'void';
            const startLine = this.getLineNumber(match.index);
            const body = this.extractBracedContent(match.index + match[0].length - 1);
            
            functions.push({
                id: this.allocateId('fn', name),
                name,
                file: this.filePath,
                startLine,
                endLine: this.getLineNumber(match.index + match[0].length + body.length),
                params,
                returnType,
                isExported: /^[A-Z]/.test(name),
                isAsync: false, // Go uses goroutines, not async keywords
                calls: this.extractCalls(body),
                hash: hashContent(body),
                purpose: this.extractDocComment(match.index),
                edgeCasesHandled: [],
                errorHandling: [],
                detailedLines: []
            });
        }
        return functions;
    }

    extractClasses(): ParsedClass[] {
        const classes: ParsedClass[] = [];
        // Pattern: type Name struct {
        const structRegex = /type\s+(\w+)\s+struct\s+\{/g;
        let match;
        while ((match = structRegex.exec(this.content)) !== null) {
            const name = match[1];
            const startLine = this.getLineNumber(match.index);
            const body = this.extractBracedContent(match.index + match[0].length - 1);
            
            classes.push({
                id: this.allocateId('class', name),
                name,
                file: this.filePath,
                startLine,
                endLine: this.getLineNumber(match.index + match[0].length + body.length),
                methods: [], // Methods are extracted as functions in Go
                properties: this.parseStructFields(body),
                isExported: /^[A-Z]/.test(name),
                hash: hashContent(body),
                purpose: this.extractDocComment(match.index)
            });
        }
        return classes;
    }

    extractGenerics(): ParsedGeneric[] {
        const generics: ParsedGeneric[] = [];
        // Pattern: type Name interface {
        const interfaceRegex = /type\s+(\w+)\s+interface\s+\{/g;
        let match;
        while ((match = interfaceRegex.exec(this.content)) !== null) {
            const name = match[1];
            const body = this.extractBracedContent(match.index + match[0].length - 1);
            generics.push({
                id: this.allocateId('type', name),
                name,
                type: 'interface',
                file: this.filePath,
                startLine: this.getLineNumber(match.index),
                endLine: this.getLineNumber(match.index + match[0].length + body.length),
                isExported: /^[A-Z]/.test(name),
                typeParameters: [],
                hash: hashContent(body),
                purpose: this.extractDocComment(match.index)
            });
        }
        return generics;
    }

    extractImports(): ParsedImport[] {
        const imports: ParsedImport[] = [];
        const importRegex = /import\s+(?:\(\s*([^)]+)\s*\)|"([^"]+)")/g;
        let match;
        while ((match = importRegex.exec(this.content)) !== null) {
            if (match[1]) {
                const lines = match[1].split('\n');
                for (const line of lines) {
                    const parts = line.trim().match(/(?:(\w+)\s+)??"([^"]+)"/);
                    if (parts) {
                        imports.push({
                            source: parts[2],
                            resolvedPath: '',
                            names: parts[1] ? [parts[1]] : [],
                            isDefault: !parts[1],
                            isDynamic: false
                        });
                    }
                }
            } else {
                imports.push({
                    source: match[2],
                    resolvedPath: '',
                    names: [],
                    isDefault: true,
                    isDynamic: false
                });
            }
        }
        return imports;
    }

    extractExports(): ParsedExport[] {
        // In Go, any name starting with UpperCase is exported
        const exports: ParsedExport[] = [];
        return exports;
    }

    extractRoutes(): ParsedRoute[] {
        const routes: ParsedRoute[] = [];
        // Simplified route detection for common Go frameworks (Gin, Echo, Chi)
        const routeRegex = /\.(GET|POST|PUT|DELETE|PATCH)\s*\(\s*"([^"]+)"\s*,\s*([\w.]+)/g;
        let match;
        while ((match = routeRegex.exec(this.content)) !== null) {
            routes.push({
                method: match[1] as any,
                path: match[2],
                handler: match[3],
                middlewares: [],
                file: this.filePath,
                line: this.getLineNumber(match.index)
            });
        }
        return routes;
    }

    extractVariables(): ParsedVariable[] {
        return [];
    }

    extractModuleCalls(): CallExpression[] {
        return [];
    }

    private parseParams(paramsStr: string): ParsedParam[] {
        if (!paramsStr.trim()) return [];
        return paramsStr.split(',').map(p => {
            const parts = p.trim().split(/\s+/);
            return {
                name: parts[0],
                type: parts[1] || 'any',
                optional: false
            };
        });
    }

    private parseStructFields(body: string): ParsedVariable[] {
        const fields: ParsedVariable[] = [];
        const lines = body.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const parts = line.split(/\s+/);
            if (parts.length >= 2 && !line.startsWith('//')) {
                fields.push({
                    id: this.allocateId('var', parts[0]),
                    name: parts[0],
                    type: parts[1],
                    file: this.filePath,
                    line: i + 1, // Approximate
                    isExported: /^[A-Z]/.test(parts[0])
                });
            }
        }
        return fields;
    }

    private extractCalls(body: string): CallExpression[] {
        const calls: CallExpression[] = [];
        const callRegex = /([\w.]+)\s*\(/g;
        let match;
        while ((match = callRegex.exec(body)) !== null) {
            calls.push({
                name: match[1],
                line: this.getLineNumber(match.index),
                type: match[1].includes('.') ? 'method' : 'function'
            });
        }
        return calls;
    }

    private extractBracedContent(startIndex: number): string {
        let depth = 0;
        let result = '';
        for (let i = startIndex; i < this.content.length; i++) {
            const char = this.content[i];
            if (char === '{') depth++;
            if (char === '}') depth--;
            result += char;
            if (depth === 0) break;
        }
        return result;
    }

    private getLineNumber(offset: number): number {
        return this.content.substring(0, offset).split('\n').length;
    }

    private extractDocComment(offset: number): string {
        const lines = this.content.substring(0, offset).split('\n');
        const comments = [];
        for (let i = lines.length - 2; i >= 0; i--) {
            const line = lines[i].trim();
            if (line.startsWith('//')) {
                comments.unshift(line.replace('//', '').trim());
            } else if (line === '') {
                continue;
            } else {
                break;
            }
        }
        return comments.join(' ');
    }
}

// Register in the global registry
LanguageRegistry.getInstance().register({
    name: 'go',
    extensions: ['.go'],
    treeSitterGrammar: '',
    extractor: new GoExtractor(),
    semanticFeatures: {
        hasTypeSystem: true,
        hasGenerics: true,
        hasMacros: false,
        hasAnnotations: false,
        hasPatternMatching: false
    }
});
