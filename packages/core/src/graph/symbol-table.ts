import type { ParsedFile, ParsedImport } from '../parser/types.js'
import { normalizePathQuiet } from '../utils/path.js'

export interface SymbolDefinition {
    id: string
    name: string
    type: 'function' | 'class' | 'variable' | 'interface' | 'type' | 'enum'
    file: string
    isExported: boolean
}

export interface ImportAlias {
    localName: string
    exportedName: string
    sourcePath: string
}

/**
 * GlobalSymbolTable — The brain of Mikk's semantic reasoning.
 * Indexes all exported symbols and provides resolution logic for calls.
 * Supports: named imports, default imports, aliased imports, local symbols, and fuzzy matching.
 * 
 * Case sensitivity: Symbol names are case-sensitive for accurate resolution.
 * Fallback to case-insensitive matching only when no exact match exists.
 */
export class GlobalSymbolTable {
    private exportsByFile = new Map<string, Map<string, SymbolDefinition>>()
    private symbolsByName = new Map<string, SymbolDefinition[]>()
    /** Secondary lowercase index — enables O(1) case-insensitive Strategy 6 lookup */
    private symbolsByNameLower = new Map<string, SymbolDefinition[]>()
    private importAliases: ImportAlias[] = []
    private reexportsByFile = new Map<string, { named: Map<string, string>, wildcards: string[] }>()
    private resolveCache = new Map<string, string | null>()
    private wildcardResolveCache = new Map<string, Map<string, SymbolDefinition | undefined>>()
    private importsByFile = new Map<string, ParsedImport[]>()

    private static readonly MAX_RESOLVE_CACHE_SIZE = 10000

    private cacheResolve(key: string, value: string | null): void {
        if (this.resolveCache.size >= GlobalSymbolTable.MAX_RESOLVE_CACHE_SIZE) {
            // Map preserves insertion order — first key is oldest. O(1) eviction.
            const oldestKey = this.resolveCache.keys().next().value
            if (oldestKey !== undefined) this.resolveCache.delete(oldestKey)
        }
        this.resolveCache.set(key, value)
    }

    register(file: ParsedFile): void {
        const fileExports = new Map<string, SymbolDefinition>()
        const filePath = normalizePathQuiet(file.path)
        const fileReexports = new Map<string, string>()

        const registerSymbol = (name: string, type: SymbolDefinition['type'], id: string, isExported: boolean) => {
            const def: SymbolDefinition = { id, name, type, file: filePath, isExported }

            if (isExported) {
                fileExports.set(name, def)
            }

            const byName = this.symbolsByName.get(name) ?? []
            byName.push(def)
            this.symbolsByName.set(name, byName)

            // Populate lowercase index for Strategy 6 case-insensitive resolution
            const nameLower = name.toLowerCase()
            if (nameLower !== name) {
                const byNameLower = this.symbolsByNameLower.get(nameLower) ?? []
                byNameLower.push(def)
                this.symbolsByNameLower.set(nameLower, byNameLower)
            }
        }

        for (const fn of file.functions) registerSymbol(fn.name, 'function', fn.id, fn.isExported)
        for (const cls of file.classes ?? []) {
            registerSymbol(cls.name, 'class', cls.id, cls.isExported)
            for (const m of cls.methods) {
                const fullName = `${cls.name}.${m.name}`
                registerSymbol(fullName, 'function', m.id, false)
                const byName = this.symbolsByName.get(m.name) ?? []
                byName.push({ id: m.id, name: m.name, type: 'function', file: filePath, isExported: false })
                this.symbolsByName.set(m.name, byName)
            }
        }
        for (const gen of file.generics ?? []) {
            const validType = gen.type === 'interface' || gen.type === 'type' ? gen.type : 'type'
            registerSymbol(gen.name, validType, gen.id, gen.isExported)
        }
        for (const v of file.variables ?? []) registerSymbol(v.name, 'variable', v.id, v.isExported)

        for (const imp of file.imports) {
            if (!imp.resolvedPath || imp.isDynamic) continue
            const resolvedPath = normalizePathQuiet(imp.resolvedPath)
            for (const spec of imp.specifiers ?? []) {
                if (spec.imported && spec.local && spec.imported !== spec.local) {
                    this.importAliases.push({
                        localName: spec.local,
                        exportedName: spec.imported,
                        sourcePath: resolvedPath,
                    })
                }
            }
        }

        this.exportsByFile.set(filePath, fileExports)

        const named = new Map<string, string>()
        const wildcards: string[] = []
        for (const re of file.reexports ?? []) {
            if (!re.sourceResolved) continue
            const resolved = normalizePathQuiet(re.sourceResolved)
            if (re.name === '*') wildcards.push(resolved)
            else named.set(re.name, resolved)
        }
        if (named.size > 0 || wildcards.length > 0) {
            this.reexportsByFile.set(filePath, { named, wildcards })
        }
        const fileImports = file.imports.filter(i => i.resolvedPath && !i.isDynamic)
        this.importsByFile.set(filePath, fileImports)
    }

    resolve(callName: string, contextFile: string, imports: ParsedImport[]): string | null {
        const hasDot = callName.includes('.')
        const receiver = hasDot ? callName.split('.')[0] : null
        const simpleName = hasDot ? callName.split('.').pop()! : callName
        const normalizedContextFile = normalizePathQuiet(contextFile)

        const cacheKey = `${normalizedContextFile}:${callName}`
        if (this.resolveCache.has(cacheKey)) {
            return this.resolveCache.get(cacheKey)!
        }

        const importsToUse = this.importsByFile.get(normalizedContextFile) ?? imports.filter(i => i.resolvedPath && !i.isDynamic)
        let result: string | null = null

        // Strategy 1: this.method() — intra-class/intra-file call
        if (hasDot && receiver === 'this') {
            const fileSymbols = this.symbolsByName.get(simpleName)
            const localMatch = fileSymbols?.find(s => normalizePathQuiet(s.file) === normalizedContextFile)
            if (localMatch) { result = localMatch.id }
        }

        // Strategy 2: Import-based resolution (named, default, aliased)
        if (!result) {
            for (const imp of importsToUse) {
                if (!imp.resolvedPath) continue
                const resolvedPath = normalizePathQuiet(imp.resolvedPath)

                if (imp.isDynamic) continue

                if (hasDot && receiver && receiver !== 'this') {
                    if (imp.isDefault && imp.names.some(n => n === receiver || n.toLowerCase() === receiver.toLowerCase())) {
                        const target = this.getExport(resolvedPath, simpleName)
                        if (target) { result = target.id; break }
                        const methodTarget = this.getMethodByClassCaseInsensitive(resolvedPath, receiver, simpleName)
                        if (methodTarget) { result = methodTarget; break }
                    }

                    const alias = this.importAliases.find(
                        a => a.localName === receiver && a.sourcePath === resolvedPath
                    )
                    if (alias) {
                        const target = this.getExport(resolvedPath, alias.exportedName)
                        if (target) { result = target.id; break }
                    }

                    const receiverLower = receiver.toLowerCase()
                    const aliasLower = this.importAliases.find(
                        a => a.localName.toLowerCase() === receiverLower && a.sourcePath === resolvedPath
                    )
                    if (aliasLower) {
                        const target = this.getExport(resolvedPath, aliasLower.exportedName)
                        if (target) { result = target.id; break }
                    }

                    const methodTarget = this.getMethodByClassCaseInsensitive(resolvedPath, receiver, simpleName)
                    if (methodTarget) { result = methodTarget; break }
                }

                const matchedLocal = imp.names.find(n =>
                    n === callName ||
                    n === simpleName ||
                    n.toLowerCase() === callName.toLowerCase() ||
                    n.toLowerCase() === simpleName.toLowerCase() ||
                    this.importAliases.some(a => a.localName === n && (a.exportedName === callName || a.exportedName === simpleName)) ||
                    this.importAliases.some(a => a.localName.toLowerCase() === n.toLowerCase() && (a.exportedName.toLowerCase() === callName.toLowerCase() || a.exportedName.toLowerCase() === simpleName.toLowerCase()))
                )
                if (matchedLocal) {
                    const alias = this.importAliases.find(a => a.localName === matchedLocal)
                    const exportedName = alias ? alias.exportedName : simpleName
                    const target = this.getExport(resolvedPath, exportedName)
                    if (target) { result = target.id; break }
                }
            }
        }

        // Strategy 3: Same-file exported symbol
        if (!result) {
            const localTarget = this.getExport(normalizedContextFile, callName)
            if (localTarget) { result = localTarget.id }
        }

        // Strategy 4: Same-file ANY symbol (covers private helpers defined in same file)
        if (!result) {
            const fileSymbols = this.symbolsByName.get(simpleName) ?? this.symbolsByName.get(callName)
            const localMatch = fileSymbols?.find(s => normalizePathQuiet(s.file) === normalizedContextFile)
            if (localMatch) { result = localMatch.id }
        }

        // Strategy 5: Unique global match (exact)
        if (!result) {
            const globalMatches = this.symbolsByName.get(callName) ?? this.symbolsByName.get(simpleName)
            if (globalMatches?.length === 1) {
                result = globalMatches[0].id
            }
        }

        // Strategy 6: Unique global match (case-insensitive) — uses pre-built lowercase index
        if (!result) {
            const lowerCallName = callName.toLowerCase()
            const lowerSimpleName = simpleName.toLowerCase()
            // Check pre-built lowercase index first (O(1))
            const ciMatches = this.symbolsByNameLower.get(lowerSimpleName)
                ?? this.symbolsByNameLower.get(lowerCallName)
                // Fallback: scan symbolsByName for lowercase match (handles same-case names)
                ?? (this.symbolsByName.get(lowerSimpleName) || this.symbolsByName.get(lowerCallName))
            if (ciMatches?.length === 1) {
                result = ciMatches[0].id
            }
        }

        // Strategy 7: Method on any class globally
        if (!result && hasDot && receiver && receiver !== 'this') {
            const methodTarget = this.getMethodGlobally(receiver, simpleName)
            if (methodTarget) { result = methodTarget }
        }

        this.cacheResolve(cacheKey, result)
        return result
    }

    private getExport(filePath: string, name: string, visited: Set<string> = new Set()): SymbolDefinition | undefined {
        if (visited.has(filePath + ':' + name)) return undefined
        visited.add(filePath + ':' + name)

        const exports = this.exportsByFile.get(filePath)
        if (exports) {
            const def = exports.get(name) ?? exports.get(name.toLowerCase())
            if (def) return def
        }

        const entry = this.reexportsByFile.get(filePath)
        if (entry) {
            // Priority 1: Named re-export (export { x } from './y')
            const namedTargetFile = entry.named.get(name) ?? entry.named.get(name.toLowerCase())
            if (namedTargetFile) {
                const def = this.getExport(namedTargetFile, name, visited)
                if (def) return def
            }

            // Priority 2: Wildcard re-exports (export * from './z') with memoization
            let fileCache = this.wildcardResolveCache.get(filePath)
            if (!fileCache) { fileCache = new Map(); this.wildcardResolveCache.set(filePath, fileCache) }
            if (fileCache.has(name)) return fileCache.get(name)

            for (const wildcardSource of entry.wildcards) {
                const def = this.getExport(wildcardSource, name, visited)
                if (def) {
                    fileCache.set(name, def)
                    return def
                }
            }
            fileCache.set(name, undefined)
        }

        return undefined
    }

    private getMethodByClassCaseInsensitive(filePath: string, className: string, methodName: string): string | null {
        const exports = this.exportsByFile.get(filePath)
        if (!exports) return null

        for (const [name, def] of exports) {
            if (def.type === 'class' && name.toLowerCase() === className.toLowerCase()) {
                const methodFullName = `${name}.${methodName}`
                const method = this.symbolsByName.get(methodFullName)
                if (method?.length === 1) return method[0].id

                const methodLowerName = `${name.toLowerCase()}.${methodName.toLowerCase()}`
                const methodLower = this.symbolsByName.get(methodLowerName)
                if (methodLower?.length === 1) return methodLower[0].id
            }
        }
        return null
    }

    private getMethodGlobally(className: string, methodName: string): string | null {
        for (const [name, defs] of this.symbolsByName) {
            if (defs[0]?.type === 'class' && name.toLowerCase() === className.toLowerCase()) {
                const methodFullName = `${name}.${methodName}`
                const method = this.symbolsByName.get(methodFullName)
                if (method?.length === 1) return method[0].id
            }
        }
        return null
    }
}
