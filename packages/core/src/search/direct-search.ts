import type { RichFunction, RichParam, RichCall, SearchQuery, SearchResult, ContextRequest, FunctionContext } from '../graph/rich-function-index.js'
import { RichFunctionIndex } from '../graph/rich-function-index.js'
import type { MikkLock } from '../contract/schema.js'
import type { DependencyGraph } from '../graph/types.js'

export interface DirectQuery {
    find?: string
    name?: string
    text?: string   // Full-text search across name + purpose
    exact?: string
    startsWith?: string
    contains?: string
    file?: string
    module?: string
    type?: 'function' | 'method' | 'class' | 'all'
    exported?: boolean
    async?: boolean
    returns?: string
    param?: string
    paramType?: string
    decorator?: string
    keyword?: string
    calls?: string
    calledBy?: string
    usage?: string
}

export interface DirectContext {
    signature?: string
    params?: string
    returnType?: string
    purpose?: string
    body?: boolean | number
    calls?: boolean
    callers?: boolean
    related?: boolean | number
    full?: boolean
}

export class DirectSearchEngine {
    private index: RichFunctionIndex
    private lock: MikkLock
    private graph?: DependencyGraph

    constructor(lock: MikkLock, graph?: DependencyGraph) {
        this.lock = lock
        this.graph = graph
        this.index = new RichFunctionIndex()
        this.index.index(lock, graph)
    }

    reindex(lock: MikkLock, graph?: DependencyGraph): void {
        this.lock = lock
        this.graph = graph
        this.index.index(lock, graph)
    }

    find(query: string): RichFunction | undefined {
        const exact = this.index.getByExactName(query)
        if (exact) return exact

        const results = this.index.searchByName(query, 1)
        if (results.length > 0) return results[0].function

        return undefined
    }

    findBySignature(signature: string): RichFunction | undefined {
        return this.index.findBySignature(signature)
    }

    findBySignatureAndParams(signature: string, paramTypes?: string[]): RichFunction | undefined {
        return this.index.findBySignatureAndParams(signature, paramTypes)
    }

    findByLocation(file: string, line: number): RichFunction | undefined {
        return this.index.findByLocation(file, line)
    }

    findAll(query: string): RichFunction[] {
        return this.index.searchByName(query, 100).map((r: SearchResult) => r.function)
    }

    search(query: DirectQuery): RichFunction[] {
        const searchQuery: SearchQuery = {}

        if (query.name) searchQuery.name = query.name  // Use 'name' field directly
        if (query.text) searchQuery.text = query.text
        if (query.exact) searchQuery.exactName = query.exact
        if (query.startsWith) searchQuery.nameStartsWith = query.startsWith
        if (query.contains) searchQuery.nameContains = query.contains
        if (query.file) searchQuery.inFile = query.file
        if (query.module) searchQuery.moduleId = query.module
        if (query.exported !== undefined) searchQuery.isExported = query.exported
        if (query.async !== undefined) searchQuery.isAsync = query.async
        if (query.returns) searchQuery.returnTypeContains = query.returns
        if (query.param) searchQuery.hasParam = query.param
        if (query.paramType) searchQuery.paramTypes = [query.paramType]
        if (query.decorator) searchQuery.hasDecorator = query.decorator
        if (query.keyword) searchQuery.keyword = query.keyword
        if (query.calls) searchQuery.calls = query.calls
        if (query.calledBy) searchQuery.calledBy = query.calledBy

        return this.index.search(searchQuery).map((r: SearchResult) => r.function)
    }

    findInFile(file: string): RichFunction[] {
        return this.index.getByFile(file)
    }

    findInModule(moduleId: string): RichFunction[] {
        return this.index.getByModule(moduleId)
    }

    findExport(pattern?: string): RichFunction[] {
        const exported = this.index.getExported()
        if (!pattern) return exported

        const lower = pattern.toLowerCase()
        return exported.filter((f: RichFunction) =>
            f.name.toLowerCase().includes(lower) ||
            f.purpose.toLowerCase().includes(lower)
        )
    }

    findAsync(pattern?: string): RichFunction[] {
        const asyncFns = this.index.search({ isAsync: true, limit: 1000 })
            .map((r: SearchResult) => r.function)

        if (!pattern) return asyncFns

        const lower = pattern.toLowerCase()
        return asyncFns.filter((f: RichFunction) =>
            f.name.toLowerCase().includes(lower) ||
            f.purpose.toLowerCase().includes(lower)
        )
    }

    findByReturnType(returnType: string): RichFunction[] {
        return this.index.search({ returnTypeContains: returnType, limit: 100 })
            .map((r: SearchResult) => r.function)
    }

    findByParamTypes(paramTypes: string[]): RichFunction[] {
        return this.index.findByParamTypes(paramTypes)
    }

    findByKeyword(keyword: string): RichFunction[] {
        return this.index.search({ keyword, limit: 100 })
            .map((r: SearchResult) => r.function)
    }

    findCallers(functionId: string): RichFunction[] {
        return this.index.getCallers(functionId)
    }

    findCallees(functionId: string): RichFunction[] {
        return this.index.getCallees(functionId)
    }

    findRelated(functionId: string, depth: number = 1): RichFunction[] {
        return this.index.getRelated(functionId, depth)
    }

    getContext(functionId: string, options?: DirectContext): FunctionContext | null {
        const include = options?.full ? 'all' :
            options?.body ? 'body' :
                options?.calls ? 'calls' : 'full'

        return this.index.getContext({
            functionId,
            include,
            maxBodyLines: typeof options?.body === 'number' ? options.body : undefined,
        })
    }

    getSignature(functionId: string): string | undefined {
        const fn = this.index.get(functionId)
        return fn?.fullSignature
    }

    getSignatures(functionIds: string[]): Record<string, string> {
        return this.index.getSignaturesMap(functionIds)
    }

    getSummaries(functionIds: string[]): Array<{ id: string; name: string; signature: string; purpose: string; file: string }> {
        return this.index.getSummaries(functionIds)
    }

    getAllSummaries(): Array<{ id: string; name: string; signature: string; purpose: string; file: string }> {
        return this.index.getAllSummaries()
    }

    getStats() {
        return this.index.getStats()
    }

    getAllKeywords(): string[] {
        return this.index.getKeywords()
    }

    getExactMatch(name: string): RichFunction | undefined {
        return this.index.getByExactName(name)
    }

    getById(id: string): RichFunction | undefined {
        return this.index.get(id)
    }

    count(): number {
        return this.index.getCount()
    }

    quickSearch(text: string, limit: number = 10): RichFunction[] {
        return this.index.searchText(text, limit).map((r: SearchResult) => r.function)
    }

    getFunctionWithContext(functionId: string, _includeBodies: boolean = false): {
        id: string
        name: string
        signature: string
        fullSignature: string
        params: Array<{ name: string; type: string; optional: boolean }>
        returnType: string
        purpose: string
        file: string
        startLine: number
        endLine: number
        isExported: boolean
        isAsync: boolean
        calls: Array<{ name: string; type: string }>
        calledBy: string[]
        keywords: string[]
        decorators: string[]
    } | null {
        const fn = this.index.get(functionId)
        if (!fn) return null

        return {
            id: fn.id,
            name: fn.name,
            signature: fn.signature,
            fullSignature: fn.fullSignature,
            params: fn.params.map((p: RichParam) => ({ name: p.name, type: p.type, optional: p.optional })),
            returnType: fn.returnType,
            purpose: fn.purpose,
            file: fn.file,
            startLine: fn.startLine,
            endLine: fn.endLine,
            isExported: fn.isExported,
            isAsync: fn.isAsync,
            calls: fn.calls.map((c: RichCall) => ({ name: c.name, type: c.type })),
            calledBy: fn.calledBy,
            keywords: fn.keywords,
            decorators: fn.decorators,
        }
    }

    getFunctionSignatures(functionIds: string[]): Map<string, string> {
        const map = new Map<string, string>()
        for (const id of functionIds) {
            const fn = this.index.get(id)
            if (fn) {
                map.set(id, fn.fullSignature)
            }
        }
        return map
    }

    exportAll(): Array<{
        id: string
        name: string
        signature: string
        fullSignature: string
        file: string
        moduleId: string
        returnType: string
        isExported: boolean
        isAsync: boolean
        paramCount: number
        purpose: string
        keywords: string[]
    }> {
        return this.index.getAll().map((fn: RichFunction) => ({
            id: fn.id,
            name: fn.name,
            signature: fn.signature,
            fullSignature: fn.fullSignature,
            file: fn.file,
            moduleId: fn.moduleId,
            returnType: fn.returnType,
            isExported: fn.isExported,
            isAsync: fn.isAsync,
            paramCount: fn.params.length,
            purpose: fn.purpose,
            keywords: fn.keywords,
        }))
    }

    searchByPattern(pattern: string): RichFunction[] {
        const regex = new RegExp(pattern, 'i')
        return [...this.index.getAll()].filter((fn: RichFunction) => {
            if (regex.test(fn.name)) return true
            if (regex.test(fn.purpose)) return true
            if (regex.test(fn.file)) return true
            if (regex.test(fn.returnType)) return true
            return false
        })
    }

    getByParamType(type: string): RichFunction[] {
        return this.index.search({ paramTypes: [type], limit: 100 })
            .map((r: SearchResult) => r.function)
    }

    getByDecorator(decorator: string): RichFunction[] {
        return this.index.search({ hasDecorator: decorator, limit: 100 })
            .map((r: SearchResult) => r.function)
    }

    findBySignaturePattern(pattern: string): RichFunction[] {
        const lowerPattern = pattern.toLowerCase()
        return [...this.index.getAll()].filter((fn: RichFunction) => {
            const sig = fn.fullSignature.toLowerCase()
            return sig.includes(lowerPattern)
        })
    }

    findSimilar(query: {
        name?: string
        signature?: string
        paramTypes?: string[]
        returnType?: string
        file?: string
        calls?: string[]
    }): RichFunction[] {
        const candidates = [...this.index.getAll()]
        const scored: Array<{ fn: RichFunction; score: number }> = []

        for (const fn of candidates) {
            let score = 0

            if (query.signature && fn.fullSignature === query.signature) {
                score += 100
            }

            if (query.name) {
                const similarity = this.levenshteinSimilar(fn.name, query.name)
                if (fn.name === query.name) {
                    score += 100
                } else if (similarity > 0.8) {
                    score += 50
                }
            }

            if (query.paramTypes && query.paramTypes.length > 0) {
                const fnParamTypes = fn.params.map(p => p.type)
                const matchCount = query.paramTypes.filter(pt =>
                    fnParamTypes.some(fpt => fpt.includes(pt))
                ).length
                score += (matchCount / query.paramTypes.length) * 30
            }

            if (query.returnType && fn.returnType.includes(query.returnType)) {
                score += 20
            }

            if (query.file && fn.file.includes(query.file)) {
                score += 15
            }

            if (query.calls && query.calls.length > 0) {
                const fnCalls = fn.calls.map(c => c.name)
                const matchCount = query.calls.filter(c => fnCalls.includes(c)).length
                score += (matchCount / query.calls.length) * 20
            }

            if (score > 0) {
                scored.push({ fn, score })
            }
        }

        scored.sort((a, b) => b.score - a.score)
        return scored.map(s => s.fn)
    }

    findByFileAndSimilarity(file: string, name: string, limit: number = 5): RichFunction[] {
        const fnsInFile = this.index.getByFile(file)

        const scored = fnsInFile.map(fn => {
            const similarity = this.levenshteinSimilar(fn.name, name)
            return { fn, similarity }
        })

        scored.sort((a, b) => b.similarity - a.similarity)
        return scored.slice(0, limit).map(s => s.fn)
    }

    private levenshteinSimilar(a: string, b: string): number {
        const maxLen = Math.max(a.length, b.length)
        if (maxLen === 0) return 1

        const distance = this.levenshtein(a.toLowerCase(), b.toLowerCase())
        return 1 - (distance / maxLen)
    }

    private levenshtein(a: string, b: string): number {
        if (a.length === 0) return b.length
        if (b.length === 0) return a.length

        const matrix: number[][] = []
        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i]
        }
        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j
        }

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1]
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    )
                }
            }
        }

        return matrix[b.length][a.length]
    }
}

export function createDirectSearch(lock: MikkLock, graph?: DependencyGraph): DirectSearchEngine {
    return new DirectSearchEngine(lock, graph)
}

export function extractSignatures(functions: RichFunction[]): string[] {
    return functions.map((f: RichFunction) => f.fullSignature)
}

export function extractNames(functions: RichFunction[]): string[] {
    return functions.map((f: RichFunction) => f.name)
}

export function extractSignaturesMap(functions: RichFunction[]): Record<string, string> {
    const map: Record<string, string> = {}
    for (const fn of functions) {
        map[fn.id] = fn.fullSignature
    }
    return map
}

export function summarizeFunction(fn: RichFunction): string {
    const parts = [fn.fullSignature]
    if (fn.purpose) parts.push(`- ${fn.purpose}`)
    if (fn.calls.length > 0) {
        parts.push(`- calls: ${fn.calls.slice(0, 5).map((c: RichCall) => c.name).join(', ')}${fn.calls.length > 5 ? '...' : ''}`)
    }
    if (fn.calledBy.length > 0) {
        parts.push(`- called by: ${fn.calledBy.length} function(s)`)
    }
    return parts.join('\n')
}

export function formatFunctionList(functions: RichFunction[], includePurpose: boolean = false): string {
    if (functions.length === 0) return '(none)'

    return functions.map((fn: RichFunction) => {
        const line = `${fn.fullSignature} (${fn.file.split('/').pop()})`
        if (includePurpose && fn.purpose) {
            return `${line}\n  Purpose: ${fn.purpose}`
        }
        return line
    }).join('\n')
}
