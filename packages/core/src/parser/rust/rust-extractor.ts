/* eslint-disable @typescript-eslint/no-explicit-any */
import { hashContent } from '../../hash/file-hasher.js'
import { BaseExtractor } from '../base-extractor.js'
import { LanguageRegistry } from '../language-registry.js'
import type { ParsedFile, ParsedFunction, ParsedClass, ParsedImport, ParsedExport } from '../types.js'

export class RustExtractor extends BaseExtractor {
    constructor() {
        super();
    }

    async extract(filePath: string, content: string): Promise<ParsedFile> {
        const lines = content.split('\n');
        const functions: ParsedFunction[] = [];
        const classes: ParsedClass[] = []; // Structs/Enums
        const imports: ParsedImport[] = [];
        const exports: ParsedExport[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Minimal Function Detection: pub fn name(...)
            const fnMatch = /^(?:pub(?:\([^)]+\))?\s+)?fn\s+([a-z_][a-z0-9_]*)/.exec(line);
            if (fnMatch) {
                const name = fnMatch[1];
                functions.push({
                    id: `fn:${filePath}:${name}`,
                    name,
                    file: filePath,
                    startLine: i + 1,
                    endLine: i + 1, // Placeholder
                    params: [],
                    returnType: 'unknown',
                    isExported: line.startsWith('pub'),
                    isAsync: line.includes('async fn'),
                    calls: [],
                    hash: hashContent(line),
                    purpose: '',
                    edgeCasesHandled: [],
                    errorHandling: [],
                    detailedLines: []
                });
                if (line.startsWith('pub')) {
                    exports.push({ name, type: 'function', file: filePath });
                }
            }

            // Minimal Import Detection: use path::to::pkg;
            const useMatch = /^use\s+([^;]+);/.exec(line);
            if (useMatch) {
                const path = useMatch[1].trim();
                const parts = path.split('::');
                imports.push({
                    source: path,
                    resolvedPath: '',
                    names: [parts[parts.length - 1]],
                    isDefault: false,
                    isDynamic: false
                });
            }

            // Minimal Struct Detection: pub struct Name { ... }
            const structMatch = /^(?:pub(?:\([^)]+\))?\s+)?(?:struct|enum|trait)\s+([A-Z][A-Za-z0-9_]*)/.exec(line);
            if (structMatch) {
                const name = structMatch[1];
                classes.push({
                    id: `cls:${filePath}:${name}`,
                    name,
                    file: filePath,
                    startLine: i + 1,
                    endLine: i + 1, // Placeholder
                    isExported: line.startsWith('pub'),
                    methods: [],
                    properties: [],
                    hash: hashContent(line),
                    purpose: ''
                });
                if (line.startsWith('pub')) {
                    const type = line.includes('struct') ? 'class' : 'interface';
                    exports.push({ name, type, file: filePath });
                }
            }
        }

        return {
            path: filePath.replace(/\\/g, '/'),
            language: 'rust' as any,
            functions,
            classes,
            variables: [],
            generics: [],
            imports,
            exports,
            routes: [],
            calls: [],
            hash: hashContent(content),
            parsedAt: Date.now()
        };
    }
}

// Automatically register with the LanguageRegistry
LanguageRegistry.getInstance().register({
    name: 'rust',
    extensions: ['.rs'],
    treeSitterGrammar: '',
    extractor: new RustExtractor(),
    semanticFeatures: { hasTypeSystem: true, hasGenerics: true, hasMacros: true, hasAnnotations: false, hasPatternMatching: true }
});
