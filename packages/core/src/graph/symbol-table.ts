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
    private importAliases: ImportAlias[] = []
    private reexportsByFile = new Map<string, Map<string, string>>()
    private resolveCache = new Map<string, string | null>()
    private resolveCacheOrder: string[] = []
    private importsByFile = new Map<string, ParsedImport[]>()

    private static readonly MAX_RESOLVE_CACHE_SIZE = 10000

    private cacheResolve(key: string, value: string | null): void {
        if (this.resolveCache.size >= GlobalSymbolTable.MAX_RESOLVE_CACHE_SIZE) {
            const oldestKey = this.resolveCacheOrder.shift()
            if (oldestKey) this.resolveCache.delete(oldestKey)
        }
        this.resolveCache.set(key, value)
        this.resolveCacheOrder.push(key)
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

        for (const re of file.reexports ?? []) {
            if (re.sourceResolved) {
                fileReexports.set(re.name, normalizePathQuiet(re.sourceResolved))
            }
        }

        this.exportsByFile.set(filePath, fileExports)
        if (fileReexports.size > 0) {
            this.reexportsByFile.set(filePath, fileReexports)
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

        for (const imp of importsToUse) {
            if (!imp.resolvedPath) continue
            const resolvedPath = normalizePathQuiet(imp.resolvedPath)

            if (imp.isDynamic) continue

            if (hasDot && receiver) {
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

        if (!result) {
            const localTarget = this.getExport(normalizedContextFile, callName)
            if (localTarget) { result = localTarget.id }
        }

        if (!result) {
            const globalMatches = this.symbolsByName.get(callName) ?? this.symbolsByName.get(simpleName)
            if (globalMatches?.length === 1) {
                result = globalMatches[0].id
            }
        }

        if (!result) {
            const lowerCallName = callName.toLowerCase()
            const lowerSimpleName = simpleName.toLowerCase()
            const lowerGlobalMatches = this.symbolsByName.get(lowerCallName) ?? this.symbolsByName.get(lowerSimpleName)
            if (lowerGlobalMatches?.length === 1) {
                result = lowerGlobalMatches[0].id
            }
        }

        if (!result && hasDot && receiver) {
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

        const reexports = this.reexportsByFile.get(filePath)
        if (reexports) {
            const reexportPath = reexports.get(name) ?? reexports.get(name.toLowerCase())
            if (reexportPath) {
                return this.getExport(reexportPath, name, visited)
            }
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
