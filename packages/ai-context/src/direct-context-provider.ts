import type { MikkLock } from '@getmikk/core'
import { DirectSearchEngine, createDirectSearch, formatFunctionList } from '@getmikk/core'
import type { DependencyGraph } from '@getmikk/core'
import type { RichFunction } from '@getmikk/core'

export interface DirectQuery {
    find?: string
    name?: string
    exact?: string
    startsWith?: string
    contains?: string
    file?: string
    module?: string
    exported?: boolean
    async?: boolean
    returns?: string
    param?: string
    paramType?: string
    decorator?: string
    keyword?: string
    calls?: string
    calledBy?: string
    limit?: number
}

export interface DirectContextOptions {
    includeBodies?: boolean
    maxBodyLines?: number
    includeCallers?: boolean
    includeCallees?: boolean
    includePurpose?: boolean
    includeKeywords?: boolean
}

export interface FunctionLookupResult {
    id: string
    name: string
    signature: string
    fullSignature: string
    file: string
    moduleId: string
    startLine: number
    endLine: number
    returnType: string
    params: Array<{ name: string; type: string; optional: boolean }>
    purpose: string
    keywords: string[]
    isExported: boolean
    isAsync: boolean
    calls: Array<{ name: string; type: string }>
    calledBy: Array<{ id: string; name: string; signature: string }>
    body?: string
}

export class DirectContextProvider {
    private search: DirectSearchEngine

    constructor(lock: MikkLock, graph?: DependencyGraph) {
        this.search = createDirectSearch(lock, graph)
    }

    reindex(lock: MikkLock, graph?: DependencyGraph): void {
        this.search.reindex(lock, graph)
    }

    find(query: string): FunctionLookupResult | null {
        const fn = this.search.find(query)
        if (!fn) return null
        return this.toLookupResult(fn)
    }

    findAll(query: DirectQuery): FunctionLookupResult[] {
        const results = this.search.search(query)
        return results.map(fn => this.toLookupResult(fn))
    }

    findByName(name: string, exact: boolean = false): FunctionLookupResult[] {
        if (exact) {
            const fn = this.search.getExactMatch(name)
            return fn ? [this.toLookupResult(fn)] : []
        }
        return this.search.findAll(name).map(fn => this.toLookupResult(fn))
    }

    findInFile(file: string): FunctionLookupResult[] {
        return this.search.findInFile(file).map(fn => this.toLookupResult(fn))
    }

    findInModule(moduleId: string): FunctionLookupResult[] {
        return this.search.findInModule(moduleId).map(fn => this.toLookupResult(fn))
    }

    findExport(pattern?: string): FunctionLookupResult[] {
        return this.search.findExport(pattern).map(fn => this.toLookupResult(fn))
    }

    findAsync(pattern?: string): FunctionLookupResult[] {
        return this.search.findAsync(pattern).map(fn => this.toLookupResult(fn))
    }

    findByKeyword(keyword: string): FunctionLookupResult[] {
        return this.search.findByKeyword(keyword).map(fn => this.toLookupResult(fn))
    }

    findCallers(functionId: string): FunctionLookupResult[] {
        return this.search.findCallers(functionId).map(fn => this.toLookupResult(fn))
    }

    findCallees(functionId: string): FunctionLookupResult[] {
        return this.search.findCallees(functionId).map(fn => this.toLookupResult(fn))
    }

    findRelated(functionId: string, depth: number = 1): FunctionLookupResult[] {
        return this.search.findRelated(functionId, depth).map(fn => this.toLookupResult(fn))
    }

    getContext(functionId: string, options: DirectContextOptions = {}): FunctionLookupResult | null {
        const fn = this.search.getById(functionId)
        if (!fn) return null
        
        const result = this.toLookupResult(fn)
        
        if (options.includeCallers) {
            result.calledBy = this.search.findCallers(functionId).map(caller => ({
                id: caller.id,
                name: caller.name,
                signature: caller.fullSignature,
            }))
        }
        
        if (options.includeCallees) {
            result.calls = fn.calls.map(c => ({
                name: c.name,
                type: c.type,
            }))
        }
        
        return result
    }

    getSignature(functionId: string): string | undefined {
        return this.search.getSignature(functionId)
    }

    getSignatures(functionIds: string[]): Record<string, string> {
        return this.search.getSignatures(functionIds)
    }

    getSummaries(functionIds: string[]): Array<{ id: string; name: string; signature: string; purpose: string; file: string }> {
        return this.search.getSummaries(functionIds)
    }

    getAllSummaries(): Array<{ id: string; name: string; signature: string; purpose: string; file: string }> {
        return this.search.getAllSummaries()
    }

    getStats() {
        return this.search.getStats()
    }

    getAllKeywords(): string[] {
        return this.search.getAllKeywords()
    }

    count(): number {
        return this.search.count()
    }

    quickSearch(text: string, limit: number = 10): FunctionLookupResult[] {
        return this.search.quickSearch(text, limit).map(fn => this.toLookupResult(fn))
    }

    searchByPattern(pattern: string): FunctionLookupResult[] {
        return this.search.searchByPattern(pattern).map(fn => this.toLookupResult(fn))
    }

    getByParamType(type: string): FunctionLookupResult[] {
        return this.search.getByParamType(type).map(fn => this.toLookupResult(fn))
    }

    getByDecorator(decorator: string): FunctionLookupResult[] {
        return this.search.getByDecorator(decorator).map(fn => this.toLookupResult(fn))
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
        return this.search.exportAll()
    }

    private toLookupResult(fn: RichFunction): FunctionLookupResult {
        return {
            id: fn.id,
            name: fn.name,
            signature: fn.signature,
            fullSignature: fn.fullSignature,
            file: fn.file,
            moduleId: fn.moduleId,
            startLine: fn.startLine,
            endLine: fn.endLine,
            returnType: fn.returnType,
            params: fn.params.map(p => ({
                name: p.name,
                type: p.type,
                optional: p.optional,
            })),
            purpose: fn.purpose,
            keywords: fn.keywords,
            isExported: fn.isExported,
            isAsync: fn.isAsync,
            calls: fn.calls.map(c => ({
                name: c.name,
                type: c.type,
            })),
            calledBy: fn.calledBy.map(id => {
                const caller = this.search.getById(id)
                return {
                    id,
                    name: caller?.name || id,
                    signature: caller?.fullSignature || '',
                }
            }),
        }
    }

    formatList(results: FunctionLookupResult[], includePurpose: boolean = false): string {
        const richFunctions: RichFunction[] = results.map(r => ({
            id: r.id,
            name: r.name,
            file: r.file,
            moduleId: r.moduleId,
            startLine: r.startLine,
            endLine: r.endLine,
            params: r.params.map(p => ({ name: p.name, type: p.type, optional: p.optional, defaultValue: undefined, destructured: false, rest: false })),
            returnType: r.returnType,
            isExported: r.isExported,
            isAsync: r.isAsync,
            isGenerator: false,
            typeParameters: [],
            body: '',
            purpose: r.purpose,
            docComment: '',
            decorators: [],
            calls: r.calls.map(c => ({ name: c.name, type: c.type as 'function' | 'method' | 'property' | 'new' | 'await' | 'yield', line: 0, column: 0, targetId: undefined, arguments: [] })),
            calledBy: r.calledBy.map(c => c.id),
            edgeCasesHandled: [],
            errorHandling: [],
            complexity: 0,
            cyclomaticComplexity: 0,
            cognitiveComplexity: 0,
            dependencies: [],
            affectedBy: [],
            keywords: r.keywords,
            signature: r.signature,
            fullSignature: r.fullSignature,
        }))
        
        return formatFunctionList(richFunctions, includePurpose)
    }
}

export function createDirectContextProvider(lock: MikkLock, graph?: DependencyGraph): DirectContextProvider {
    return new DirectContextProvider(lock, graph)
}
