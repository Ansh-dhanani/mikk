/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * RustExtractor — DEPRECATED.
 *
 * Rust parsing is now handled by the tree-sitter parser using RUST_QUERIES
 * defined in tree-sitter/queries.ts (which correctly captures impl methods).
 *
 * The LanguageRegistry registration has been REMOVED.
 * tree-sitter/parser.ts already registers 'rust' with the correct grammar.
 *
 * This file is retained only to avoid breaking any external imports.
 */

import { hashContent } from '../../hash/file-hasher.js'
import { BaseExtractor, ExtractOptions } from '../base-extractor.js'
import { makeIdAllocator, toPosixPath } from '../../utils/id.js'
import type { ParsedFile, ParsedFunction, ParsedClass, ParsedImport, ParsedExport } from '../types.js'

export class RustExtractor extends BaseExtractor {
    async extract(filePath: string, content: string, _options?: ExtractOptions): Promise<ParsedFile> {
        const displayPath = toPosixPath(filePath)
        const allocateId = makeIdAllocator(filePath)
        const lines = content.split('\n')
        const functions: ParsedFunction[] = []
        const classes: ParsedClass[] = []
        const imports: ParsedImport[] = []
        const exports: ParsedExport[] = []

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim()

            // Top-level and impl-method functions
            const fnMatch = /^(?:pub(?:\([^)]+\))?\s+)?(?:async\s+)?fn\s+([a-z_][a-z0-9_]*)/.exec(line)
            if (fnMatch) {
                const name = fnMatch[1]
                const isExported = line.startsWith('pub')
                functions.push({
                    id: allocateId('fn', name),
                    name,
                    file: displayPath,
                    startLine: i + 1,
                    endLine: i + 1,
                    params: [],
                    returnType: 'unknown',
                    isExported,
                    isAsync: line.includes('async fn'),
                    calls: [],
                    hash: hashContent(line),
                    purpose: '',
                    edgeCasesHandled: [],
                    errorHandling: [],
                    detailedLines: []
                })
                if (isExported) {
                    exports.push({ name, type: 'function', file: displayPath })
                }
            }

            const useMatch = /^(?:pub\s+)?use\s+([^;]+);/.exec(line)
            if (useMatch) {
                const src = useMatch[1].trim()
                const parts = src.split('::')
                imports.push({
                    source: src,
                    resolvedPath: '',
                    names: [parts[parts.length - 1]],
                    isDefault: false,
                    isDynamic: false
                })
            }

            const structMatch = /^(?:pub(?:\([^)]+\))?\s+)?(?:struct|enum|trait)\s+([A-Z][A-Za-z0-9_]*)/.exec(line)
            if (structMatch) {
                const name = structMatch[1]
                const isExported = line.startsWith('pub')
                classes.push({
                    id: allocateId('class', name),
                    name,
                    file: displayPath,
                    startLine: i + 1,
                    endLine: i + 1,
                    isExported,
                    methods: [],
                    properties: [],
                    hash: hashContent(line),
                    purpose: ''
                })
                if (isExported) {
                    exports.push({ name, type: line.includes('struct') ? 'class' : 'interface', file: displayPath })
                }
            }
        }

        return {
            path: displayPath,
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
        }
    }
}

// NOTE: No LanguageRegistry.register() call here.
// Rust is registered by tree-sitter/parser.ts using proper RUST_QUERIES.
