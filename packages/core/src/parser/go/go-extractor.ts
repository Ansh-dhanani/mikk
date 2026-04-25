/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GoExtractor — DEPRECATED.
 *
 * Go parsing is now handled by the tree-sitter parser using GO_QUERIES defined
 * in tree-sitter/queries.ts.  The LanguageRegistry registration at the bottom
 * of this file has been REMOVED so that tree-sitter/parser.ts (which already
 * registers 'go') takes precedence.
 *
 * This file is retained only to avoid breaking any external imports.
 * It will be deleted in a future cleanup pass.
 */

import { BaseExtractor, ExtractOptions } from '../base-extractor.js';
import { hashContent } from '../../hash/file-hasher.js';
import { makeIdAllocator } from '../../utils/id.js';
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

// ---------------------------------------------------------------------------
// Go language keywords and builtins — used to filter false-positive calls
// ---------------------------------------------------------------------------
const GO_BUILTINS = new Set([
    'if', 'for', 'switch', 'select', 'range', 'go', 'defer', 'return',
    'break', 'continue', 'goto', 'fallthrough', 'case', 'default',
    'make', 'new', 'append', 'copy', 'delete', 'len', 'cap',
    'panic', 'recover', 'print', 'println', 'close',
    'complex', 'real', 'imag',
    'string', 'int', 'int8', 'int16', 'int32', 'int64',
    'uint', 'uint8', 'uint16', 'uint32', 'uint64', 'uintptr',
    'float32', 'float64', 'complex64', 'complex128',
    'bool', 'byte', 'rune', 'error',
])

/**
 * GoExtractor — kept for reference / emergency fallback only.
 * Production parsing uses TreeSitterParser with GO_QUERIES.
 */
export class GoExtractor extends BaseExtractor {
    async extract(filePath: string, content: string, _options?: ExtractOptions): Promise<ParsedFile> {
        const displayPath = filePath.replace(/\\/g, '/');
        const worker = new GoExtractorWorker(displayPath, content);

        return {
            path: displayPath,
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
        return files;
    }
}

class GoExtractorWorker {
    private allocateId: (prefix: any, name: string) => string;

    constructor(
        private readonly filePath: string,
        private readonly content: string
    ) {
        // Use the canonical allocator — preserves original name casing, lowercases path
        this.allocateId = makeIdAllocator(filePath);
    }

    extractFunctions(): ParsedFunction[] {
        const functions: ParsedFunction[] = [];
        // Match both regular functions and methods: func (r Receiver) Name(...
        const funcRegex = /func\s+(?:\(\s*\w+\s+\*?\w+\s*\)\s+)?(\w+)\s*\(([^)]*)\)\s*([^{]*)\{/g;
        let match;
        while ((match = funcRegex.exec(this.content)) !== null) {
            const name = match[1];
            // Skip Go keywords that look like function calls
            if (GO_BUILTINS.has(name)) continue;
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
                isAsync: false,
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
                methods: [],
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
                    const parts = line.trim().match(/(?:(\w+)\s+)?"([^"]+)"/);
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
            } else if (match[2]) {
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
        return [];
    }

    extractRoutes(): ParsedRoute[] {
        const routes: ParsedRoute[] = [];
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
                name: parts[0] || '_',
                type: parts.slice(1).join(' ') || 'any',
                optional: false
            };
        }).filter(p => p.name);
    }

    private parseStructFields(body: string): ParsedVariable[] {
        const fields: ParsedVariable[] = [];
        const lines = body.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line || line.startsWith('//') || line === '{' || line === '}') continue;
            const parts = line.split(/\s+/);
            if (parts.length >= 2 && /^[A-Za-z_]/.test(parts[0])) {
                fields.push({
                    id: this.allocateId('var', parts[0]),
                    name: parts[0],
                    type: parts[1],
                    file: this.filePath,
                    line: i + 1,
                    isExported: /^[A-Z]/.test(parts[0])
                });
            }
        }
        return fields;
    }

    private extractCalls(body: string): CallExpression[] {
        const calls: CallExpression[] = [];
        // Only match identifiers followed by '(' that are NOT Go builtins or keywords
        const callRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?)\s*\(/g;
        let match;
        while ((match = callRegex.exec(body)) !== null) {
            const fullName = match[1];
            // Get just the leaf name for builtin check
            const leafName = fullName.includes('.') ? fullName.split('.').pop()! : fullName;
            if (GO_BUILTINS.has(fullName) || GO_BUILTINS.has(leafName)) continue;
            // Skip type conversions: uppercase-only names followed by ( are type casts in Go
            // (e.g. int64(x), float32(y)) — these have lowercase first letter in our filter above
            calls.push({
                name: fullName,
                line: this.getLineNumber(match.index),
                type: fullName.includes('.') ? 'method' : 'function'
            });
        }
        return calls;
    }

    private extractBracedContent(startIndex: number): string {
        let depth = 0;
        let result = '';
        let inString = false;
        let stringChar = '';
        for (let i = startIndex; i < this.content.length; i++) {
            const char = this.content[i];
            // Track string literals so we don't count braces inside them
            if (!inString && (char === '"' || char === '`' || char === '\'')) {
                inString = true;
                stringChar = char;
            } else if (inString && char === stringChar && this.content[i - 1] !== '\\') {
                inString = false;
            }
            if (!inString) {
                if (char === '{') depth++;
                if (char === '}') depth--;
            }
            result += char;
            if (!inString && depth === 0 && result.length > 1) break;
        }
        return result;
    }

    private getLineNumber(offset: number): number {
        return this.content.substring(0, offset).split('\n').length;
    }

    private extractDocComment(offset: number): string {
        const lines = this.content.substring(0, offset).split('\n');
        const comments: string[] = [];
        for (let i = lines.length - 2; i >= 0; i--) {
            const line = lines[i].trim();
            if (line.startsWith('//')) {
                comments.unshift(line.replace(/^\/\/\s?/, '').trim());
            } else if (line === '') {
                continue;
            } else {
                break;
            }
        }
        return comments.join(' ');
    }
}

// NOTE: No LanguageRegistry.register() call here.
// Go is registered by tree-sitter/parser.ts using proper GO_QUERIES.
// This extractor is kept as an emergency fallback only.
