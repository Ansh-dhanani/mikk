import type { DependencyGraph } from './types.js'
import type { MikkLock, MikkLockFunction } from '../contract/schema.js'

export interface RichFunction {
    id: string
    name: string
    file: string
    moduleId: string
    startLine: number
    endLine: number
    params: RichParam[]
    returnType: string
    isExported: boolean
    isAsync: boolean
    isGenerator: boolean
    typeParameters: string[]
    body: string
    purpose: string
    docComment: string
    decorators: string[]
    calls: RichCall[]
    calledBy: string[]
    edgeCasesHandled: string[]
    errorHandling: RichErrorHandling[]
    complexity: number
    cyclomaticComplexity: number
    cognitiveComplexity: number
    dependencies: string[]
    affectedBy: string[]
    keywords: string[]
    signature: string
    fullSignature: string
    contentHash?: string
    signatureHash?: string
    paramHashes?: string[]
}

export interface RichParam {
    name: string
    type: string
    optional: boolean
    defaultValue?: string
    destructured?: boolean
    rest?: boolean
}

export interface RichCall {
    name: string
    line: number
    column: number
    type: 'function' | 'method' | 'property' | 'new' | 'await' | 'yield'
    targetId?: string
    arguments: string[]
}

export interface RichErrorHandling {
    line: number
    endLine: number
    type: 'try-catch' | 'throw' | 'return-error' | 'if-error'
    detail: string
    caughtTypes: string[]
    handled: boolean
}

export interface SearchQuery {
    text?: string
    name?: string
    file?: string
    moduleId?: string
    exactName?: string
    nameContains?: string
    nameStartsWith?: string
    namePattern?: RegExp
    returnType?: string
    returnTypeContains?: string
    paramTypes?: string[]
    hasParam?: string
    hasDecorator?: string
    isExported?: boolean
    isAsync?: boolean
    isGenerator?: boolean
    minParams?: number
    maxParams?: number
    keyword?: string
    calls?: string
    calledBy?: string
    inFile?: string
    inModule?: string
    exportedFrom?: string
    limit?: number
    offset?: number
}

export interface SearchResult {
    function: RichFunction
    score: number
    matchReasons: string[]
}

export interface ContextRequest {
    functionId: string
    include?: 'signature' | 'full' | 'body' | 'calls' | 'calledBy' | 'all'
    maxBodyLines?: number
}

export interface FunctionContext {
    signature: string
    fullSignature: string
    body?: string
    purpose?: string
    docComment?: string
    params: RichParam[]
    returnType: string
    calls: RichCall[]
    calledBy: string[]
    decorators: string[]
    file: string
    startLine: number
    endLine: number
    errorHandling?: RichErrorHandling[]
    edgeCases?: string[]
    keywords: string[]
}

export class RichFunctionIndex {
    private functions: Map<string, RichFunction> = new Map()
    private byName: Map<string, string[]> = new Map()
    private byFile: Map<string, string[]> = new Map()
    private byModule: Map<string, string[]> = new Map()
    private byExport: Map<boolean, string[]> = new Map()
    private byReturnType: Map<string, string[]> = new Map()
    private byParamType: Map<string, Set<string>> = new Map()
    private byDecorator: Map<string, string[]> = new Map()
    private byKeyword: Map<string, Set<string>> = new Map()
    private byCall: Map<string, Set<string>> = new Map()
    private byCalledBy: Map<string, Set<string>> = new Map()
    private nameIndex: Map<string, string> = new Map()
    private textIndex: Map<string, Set<string>> = new Map()
    private allKeywords: Set<string> = new Set()

    private bySignatureHash: Map<string, string> = new Map()
    private byContentHash: Map<string, string> = new Map()
    private byParamHash: Map<string, string[]> = new Map()

    constructor() { }

    index(lock: MikkLock, graph?: DependencyGraph): void {
        this.clear()

        for (const [id, fn] of Object.entries(lock.functions)) {
            const rich = this.enrichFunction(fn, lock, graph)
            this.addFunction(rich)
        }
    }

    private simpleHash(str: string): string {
        let hash = 0
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i)
            hash = ((hash << 5) - hash) + char
            hash = hash & hash
        }
        return Math.abs(hash).toString(36)
    }

    private enrichFunction(fn: MikkLockFunction, lock: MikkLock, graph?: DependencyGraph): RichFunction {
        const id = fn.id
        const name = fn.name || this.parseNameFromId(id)
        const file = fn.file || this.parseFileFromId(id)

        const calls = this.extractCalls(fn, lock)
        const calledBy = this.extractCalledBy(fn, lock)
        const keywords = this.extractKeywords(fn, calls)
        const signature = this.buildSignature(fn)
        const fullSignature = this.buildFullSignature(fn)

        const richParams: RichParam[] = (fn.params || []).map(p => ({
            name: p.name,
            type: p.type,
            optional: p.optional ?? false,
            defaultValue: undefined,
            destructured: false,
            rest: false,
        }))

        const richErrors: RichErrorHandling[] = (fn.errorHandling || []).map(e => ({
            line: e.line,
            endLine: e.line,
            type: e.type,
            detail: e.detail,
            caughtTypes: [],
            handled: true,
        }))

        const signatureHash = this.simpleHash(fullSignature)
        const contentHash = fn.hash || this.simpleHash(`${file}:${name}:${signatureHash}`)
        const paramHashes = richParams.map(p => this.simpleHash(`${p.name}:${p.type}`))

        return {
            id,
            name,
            file,
            moduleId: fn.moduleId || 'unknown',
            startLine: fn.startLine || 0,
            endLine: fn.endLine || 0,
            params: richParams,
            returnType: fn.returnType || 'void',
            isExported: fn.isExported || false,
            isAsync: fn.isAsync || false,
            isGenerator: false,
            typeParameters: [],
            body: '',
            purpose: fn.purpose || this.inferPurpose(name, fn),
            docComment: '',
            decorators: [],
            calls,
            calledBy,
            edgeCasesHandled: fn.edgeCasesHandled || [],
            errorHandling: richErrors,
            complexity: this.calculateComplexity(fn),
            cyclomaticComplexity: this.calculateCyclomaticComplexity(fn),
            cognitiveComplexity: 0,
            dependencies: calls.map(c => c.name),
            affectedBy: calledBy,
            keywords,
            signature,
            fullSignature,
            contentHash,
            signatureHash,
            paramHashes,
        }
    }

    private extractCalls(fn: MikkLockFunction, lock: MikkLock): RichCall[] {
        const calls: RichCall[] = []

        for (const calleeId of fn.calls || []) {
            const callee = lock.functions[calleeId]
            if (callee) {
                calls.push({
                    name: callee.name || this.parseNameFromId(calleeId),
                    line: 0,
                    column: 0,
                    type: 'function',
                    targetId: calleeId,
                    arguments: [],
                })
            }
        }

        return calls
    }

    private extractCalledBy(fn: MikkLockFunction, lock: MikkLock): string[] {
        const calledBy: string[] = []

        for (const callerId of fn.calledBy || []) {
            const caller = lock.functions[callerId]
            if (caller) {
                calledBy.push(callerId)
            }
        }

        return calledBy
    }

    private extractKeywords(fn: MikkLockFunction, calls: RichCall[]): string[] {
        const keywords = new Set<string>()

        const name = fn.name || ''
        const words = name.match(/[A-Z][a-z]+|[a-z]+/g) || []
        words.forEach(w => keywords.add(w.toLowerCase()))

        if (fn.purpose) {
            const purposeWords = fn.purpose.match(/[a-z]{3,}/g) || []
            purposeWords.forEach(w => keywords.add(w.toLowerCase()))
        }

        const returnType = fn.returnType || ''
        if (returnType.includes('Promise')) keywords.add('async')
        if (returnType.includes('Error') || returnType.includes('Result')) keywords.add('error-handling')
        if (returnType !== 'void' && returnType !== 'never') keywords.add('returns-value')

        if (fn.isAsync) keywords.add('async')

        for (const call of calls) {
            keywords.add(call.name.toLowerCase())
        }

        return [...keywords]
    }

    private buildSignature(fn: MikkLockFunction): string {
        const params = (fn.params || [])
            .map(p => `${p.name}${p.optional ? '?' : ''}: ${p.type}`)
            .join(', ')
        return `${fn.name || 'anonymous'}(${params})`
    }

    private buildFullSignature(fn: MikkLockFunction): string {
        const asyncPrefix = fn.isAsync ? 'async ' : ''
        const params = (fn.params || [])
            .map(p => {
                let str = p.name
                if (p.optional) str += '?'
                str += `: ${p.type}`
                return str
            })
            .join(', ')
        const returnType = fn.returnType || 'void'
        return `${asyncPrefix}${fn.name || 'anonymous'}(${params}): ${returnType}`
    }

    private parseNameFromId(id: string): string {
        const parts = id.split(':')
        return parts[parts.length - 1] || 'anonymous'
    }

    private parseFileFromId(id: string): string {
        const withoutPrefix = id.replace(/^(fn|class|type|intf|enum):/, '')
        const parts = withoutPrefix.split(':')
        return parts.slice(0, -1).join(':')
    }

    private inferPurpose(name: string, fn: MikkLockFunction): string {
        const lower = name.toLowerCase()

        if (lower.startsWith('get') || lower.startsWith('fetch') || lower.startsWith('load')) {
            return `Retrieves data`
        }
        if (lower.startsWith('set') || lower.startsWith('update') || lower.startsWith('save')) {
            return `Modifies or persists data`
        }
        if (lower.startsWith('create') || lower.startsWith('add') || lower.startsWith('new')) {
            return `Creates a new entity`
        }
        if (lower.startsWith('delete') || lower.startsWith('remove') || lower.startsWith('destroy')) {
            return `Removes an entity`
        }
        if (lower.startsWith('is') || lower.startsWith('has') || lower.startsWith('can')) {
            return `Checks a condition`
        }
        if (lower.startsWith('validate') || lower.startsWith('check')) {
            return `Validates input`
        }
        if (lower.startsWith('parse') || lower.startsWith('transform') || lower.startsWith('convert')) {
            return `Transforms data format`
        }
        if (lower.startsWith('handle') || lower.startsWith('process')) {
            return `Handles processing logic`
        }
        if (lower.startsWith('render') || lower.startsWith('display')) {
            return `Renders output`
        }
        if (lower.startsWith('init') || lower.startsWith('setup') || lower.startsWith('configure')) {
            return `Initializes configuration`
        }

        return ''
    }

    private calculateComplexity(fn: MikkLockFunction): number {
        let score = 1
        if (fn.params && fn.params.length > 3) score += 1
        if (fn.isAsync) score += 1
        if ((fn.calls || []).length > 10) score += Math.floor((fn.calls || []).length / 10)
        return score
    }

    private calculateCyclomaticComplexity(fn: MikkLockFunction): number {
        let complexity = 1
        if ((fn.errorHandling || []).length > 0) {
            complexity += (fn.errorHandling || []).filter(e => e.type === 'try-catch').length
        }
        return complexity
    }

    private addFunction(rich: RichFunction): void {
        this.functions.set(rich.id, rich)

        const nameLower = rich.name.toLowerCase()

        const nameSet = this.byName.get(nameLower) || []
        nameSet.push(rich.id)
        this.byName.set(nameLower, nameSet)

        const fileSet = this.byFile.get(rich.file) || []
        fileSet.push(rich.id)
        this.byFile.set(rich.file, fileSet)

        const moduleSet = this.byModule.get(rich.moduleId) || []
        moduleSet.push(rich.id)
        this.byModule.set(rich.moduleId, moduleSet)

        const exportedSet = this.byExport.get(rich.isExported) || []
        exportedSet.push(rich.id)
        this.byExport.set(rich.isExported, exportedSet)

        const returnTypeLower = rich.returnType.toLowerCase()
        const returnSet = this.byReturnType.get(returnTypeLower) || []
        returnSet.push(rich.id)
        this.byReturnType.set(returnTypeLower, returnSet)

        for (const param of rich.params) {
            const typeLower = param.type.toLowerCase()
            if (!this.byParamType.has(typeLower)) {
                this.byParamType.set(typeLower, new Set())
            }
            this.byParamType.get(typeLower)!.add(rich.id)
        }

        for (const decorator of rich.decorators) {
            const decLower = decorator.toLowerCase()
            const decSet = this.byDecorator.get(decLower) || []
            decSet.push(rich.id)
            this.byDecorator.set(decLower, decSet)
        }

        for (const keyword of rich.keywords) {
            if (!this.byKeyword.has(keyword)) {
                this.byKeyword.set(keyword, new Set())
            }
            this.byKeyword.get(keyword)!.add(rich.id)
            this.allKeywords.add(keyword)
        }

        for (const call of rich.calls) {
            if (!this.byCall.has(call.name)) {
                this.byCall.set(call.name, new Set())
            }
            this.byCall.get(call.name)!.add(rich.id)
        }

        for (const callerId of rich.calledBy) {
            if (!this.byCalledBy.has(callerId)) {
                this.byCalledBy.set(callerId, new Set())
            }
            this.byCalledBy.get(callerId)!.add(rich.id)
        }

        this.nameIndex.set(rich.name, rich.id)

        if (rich.signatureHash) {
            this.bySignatureHash.set(rich.signatureHash, rich.id)
        }
        if (rich.contentHash) {
            this.byContentHash.set(rich.contentHash, rich.id)
        }
        for (const paramHash of rich.paramHashes || []) {
            const existing = this.byParamHash.get(paramHash) || []
            existing.push(rich.id)
            this.byParamHash.set(paramHash, existing)
        }

        const fullText = [
            rich.name,
            rich.file,
            rich.purpose,
            rich.returnType,
            ...rich.params.map(p => p.name + ' ' + p.type),
            ...rich.keywords,
        ].join(' ').toLowerCase()

        const tokens = fullText.split(/\s+/)
        for (const token of tokens) {
            if (token.length >= 2) {
                if (!this.textIndex.has(token)) {
                    this.textIndex.set(token, new Set())
                }
                this.textIndex.get(token)!.add(rich.id)
            }
        }
    }

    private clear(): void {
        this.functions.clear()
        this.byName.clear()
        this.byFile.clear()
        this.byModule.clear()
        this.byExport.clear()
        this.byReturnType.clear()
        this.byParamType.clear()
        this.byDecorator.clear()
        this.byKeyword.clear()
        this.byCall.clear()
        this.byCalledBy.clear()
        this.nameIndex.clear()
        this.textIndex.clear()
        this.allKeywords.clear()
        this.bySignatureHash.clear()
        this.byContentHash.clear()
        this.byParamHash.clear()
    }

    getBySignatureHash(hash: string): RichFunction | undefined {
        const id = this.bySignatureHash.get(hash)
        return id ? this.functions.get(id) : undefined
    }

    getByContentHash(hash: string): RichFunction | undefined {
        const id = this.byContentHash.get(hash)
        return id ? this.functions.get(id) : undefined
    }

    findBySignature(signature: string): RichFunction | undefined {
        const hash = this.simpleHash(signature)
        return this.getBySignatureHash(hash)
    }

    findByParamTypes(paramTypes: string[]): RichFunction[] {
        if (paramTypes.length === 0) return []

        const paramHashes = paramTypes.map(pt => this.simpleHash(pt))
        const candidates = this.byParamHash.get(paramHashes[0]) || []

        if (paramTypes.length === 1) {
            return candidates.map(id => this.functions.get(id)).filter(Boolean) as RichFunction[]
        }

        return candidates
            .map(id => this.functions.get(id))
            .filter((fn): fn is RichFunction => {
                if (!fn) return false
                const fnParamHashes = fn.paramHashes || []
                return paramHashes.every(ph => fnParamHashes.includes(ph))
            })
    }

    findByLocation(file: string, line: number): RichFunction | undefined {
        const fnsInFile = this.byFile.get(file)
        if (!fnsInFile) return undefined

        for (const id of fnsInFile) {
            const fn = this.functions.get(id)
            if (fn && line >= fn.startLine && line <= fn.endLine) {
                return fn
            }
        }
        return undefined
    }

    findBySignatureAndParams(signature: string, paramTypes?: string[]): RichFunction | undefined {
        const fn = this.findBySignature(signature)
        if (!fn) return undefined

        if (paramTypes && paramTypes.length > 0) {
            const fnParamTypes = fn.params.map(p => p.type)
            const matches = paramTypes.every(pt => fnParamTypes.some(fpt => fpt.includes(pt)))
            if (!matches) return undefined
        }

        return fn
    }

    get(id: string): RichFunction | undefined {
        return this.functions.get(id)
    }

    getByName(name: string): RichFunction | undefined {
        const id = this.nameIndex.get(name)
        return id ? this.functions.get(id) : undefined
    }

    getByExactName(name: string): RichFunction | undefined {
        const ids = this.byName.get(name.toLowerCase())
        if (ids && ids.length > 0) {
            return this.functions.get(ids[0])
        }
        return undefined
    }

    getByFile(file: string): RichFunction[] {
        const ids = this.byFile.get(file) || []
        return ids.map(id => this.functions.get(id)).filter(Boolean) as RichFunction[]
    }

    getByModule(moduleId: string): RichFunction[] {
        const ids = this.byModule.get(moduleId) || []
        return ids.map(id => this.functions.get(id)).filter(Boolean) as RichFunction[]
    }

    getExported(): RichFunction[] {
        const ids = this.byExport.get(true) || []
        return ids.map(id => this.functions.get(id)).filter(Boolean) as RichFunction[]
    }

    getAll(): RichFunction[] {
        return [...this.functions.values()]
    }

    getCount(): number {
        return this.functions.size
    }

    search(query: SearchQuery): SearchResult[] {
        let candidateIds: Set<string> | null = null
        const matchReasons: string[] = []

        // Handle name query - split into words and search each
        if (query.name || query.nameContains) {
            const nameQuery = (query.name || query.nameContains!).toLowerCase()
            const words = nameQuery.split(/\s+/).filter(w => w.length > 0)

            // Require ALL words to match in function name (strict AND logic)
            const allMatchIds: string[] = []

            for (const fn of this.functions.values()) {
                const fnNameLower = fn.name.toLowerCase()
                let allWordsMatch = true

                for (const word of words) {
                    if (!fnNameLower.includes(word)) {
                        allWordsMatch = false
                        break
                    }
                }

                if (allWordsMatch) {
                    allMatchIds.push(fn.id)
                }
            }

            // Only return results if ALL words match
            if (allMatchIds.length > 0) {
                candidateIds = new Set(allMatchIds)
                matchReasons.push(`name: ${nameQuery}`)
            }
            // If no matches, don't fall back - return empty
        }

        if (query.exactName) {
            const fn = this.getByExactName(query.exactName)
            if (fn) {
                candidateIds = new Set([fn.id])
                matchReasons.push(`exact name: ${query.exactName}`)
            } else {
                return []
            }
        }

        if (query.nameContains) {
            const lower = query.nameContains.toLowerCase()
            const matching = [...this.byName.entries()]
                .filter(([name]) => name.includes(lower))
                .flatMap(([, ids]) => ids)

            if (candidateIds) {
                candidateIds = new Set([...candidateIds].filter(id => matching.includes(id)))
            } else {
                candidateIds = new Set(matching)
            }
            matchReasons.push(`name contains: ${query.nameContains}`)
        }

        if (query.nameStartsWith) {
            const lower = query.nameStartsWith.toLowerCase()
            const matching = [...this.byName.entries()]
                .filter(([name]) => name.startsWith(lower))
                .flatMap(([, ids]) => ids)

            if (candidateIds) {
                candidateIds = new Set([...candidateIds].filter(id => matching.includes(id)))
            } else {
                candidateIds = new Set(matching)
            }
            matchReasons.push(`name starts with: ${query.nameStartsWith}`)
        }

        if (query.file) {
            const ids = this.byFile.get(query.file) || []
            if (candidateIds) {
                candidateIds = new Set([...candidateIds].filter(id => ids.includes(id)))
            } else {
                candidateIds = new Set(ids)
            }
            matchReasons.push(`file: ${query.file}`)
        }

        if (query.inFile) {
            const lower = query.inFile.toLowerCase()
            const matching = [...this.byFile.entries()]
                .filter(([file]) => file.toLowerCase().includes(lower))
                .flatMap(([, ids]) => ids)

            if (candidateIds) {
                candidateIds = new Set([...candidateIds].filter(id => matching.includes(id)))
            } else {
                candidateIds = new Set(matching)
            }
            matchReasons.push(`in file containing: ${query.inFile}`)
        }

        if (query.moduleId) {
            const ids = this.byModule.get(query.moduleId) || []
            if (candidateIds) {
                candidateIds = new Set([...candidateIds].filter(id => ids.includes(id)))
            } else {
                candidateIds = new Set(ids)
            }
            matchReasons.push(`module: ${query.moduleId}`)
        }

        if (query.isExported !== undefined) {
            const ids = this.byExport.get(query.isExported) || []
            if (candidateIds) {
                candidateIds = new Set([...candidateIds].filter(id => ids.includes(id)))
            } else {
                candidateIds = new Set(ids)
            }
            matchReasons.push(`isExported: ${query.isExported}`)
        }

        if (query.isAsync !== undefined && query.isAsync) {
            const asyncFns = [...this.functions.values()].filter(f => f.isAsync).map(f => f.id)
            if (candidateIds) {
                candidateIds = new Set([...candidateIds].filter(id => asyncFns.includes(id)))
            } else {
                candidateIds = new Set(asyncFns)
            }
            matchReasons.push('isAsync: true')
        }

        if (query.returnType) {
            const ids = this.byReturnType.get(query.returnType.toLowerCase()) || []
            if (candidateIds) {
                candidateIds = new Set([...candidateIds].filter(id => ids.includes(id)))
            } else {
                candidateIds = new Set(ids)
            }
            matchReasons.push(`returnType: ${query.returnType}`)
        }

        if (query.returnTypeContains) {
            const lower = query.returnTypeContains.toLowerCase()
            const matching = [...this.functions.values()]
                .filter(f => f.returnType.toLowerCase().includes(lower))
                .map(f => f.id)

            if (candidateIds) {
                candidateIds = new Set([...candidateIds].filter(id => matching.includes(id)))
            } else {
                candidateIds = new Set(matching)
            }
            matchReasons.push(`returnType contains: ${query.returnTypeContains}`)
        }

        if (query.hasParam) {
            const matching = [...this.functions.values()]
                .filter(f => f.params.some(p => p.name.toLowerCase() === query.hasParam!.toLowerCase()))
                .map(f => f.id)

            if (candidateIds) {
                candidateIds = new Set([...candidateIds].filter(id => matching.includes(id)))
            } else {
                candidateIds = new Set(matching)
            }
            matchReasons.push(`has param: ${query.hasParam}`)
        }

        if (query.paramTypes && query.paramTypes.length > 0) {
            const matching = [...this.functions.values()]
                .filter(f => {
                    const paramTypeStr = f.params.map(p => p.type.toLowerCase()).join(',')
                    return query.paramTypes!.every(t => paramTypeStr.includes(t.toLowerCase()))
                })
                .map(f => f.id)

            if (candidateIds) {
                candidateIds = new Set([...candidateIds].filter(id => matching.includes(id)))
            } else {
                candidateIds = new Set(matching)
            }
            matchReasons.push(`param types: ${query.paramTypes.join(', ')}`)
        }

        if (query.hasDecorator) {
            const lower = query.hasDecorator.toLowerCase()
            const ids = this.byDecorator.get(lower) || []
            if (candidateIds) {
                candidateIds = new Set([...candidateIds].filter(id => ids.includes(id)))
            } else {
                candidateIds = new Set(ids)
            }
            matchReasons.push(`decorator: ${query.hasDecorator}`)
        }

        if (query.keyword) {
            const lower = query.keyword.toLowerCase()
            const ids = this.byKeyword.get(lower)
            if (ids && ids.size > 0) {
                if (candidateIds) {
                    candidateIds = new Set([...candidateIds].filter(id => ids.has(id)))
                } else {
                    candidateIds = new Set(ids)
                }
                matchReasons.push(`keyword: ${query.keyword}`)
            } else if (!candidateIds) {
                candidateIds = new Set()
            }
        }

        if (query.text) {
            const tokens = query.text.toLowerCase().split(/\s+/).filter(t => t.length >= 2)

            if (tokens.length > 0) {
                // Get name-based matches (from byName index)
                const nameMatches = new Set<string>()
                for (const token of tokens) {
                    // Exact name match
                    const exactIds = this.byName.get(token)
                    if (exactIds) exactIds.forEach(id => nameMatches.add(id))
                    // Partial name match (contains)
                    for (const [name, ids] of this.byName.entries()) {
                        if (name.includes(token)) ids.forEach(id => nameMatches.add(id))
                    }
                }

                // Get text-based matches (from textIndex) - use OR logic
                const textMatches = new Set<string>()
                for (const token of tokens) {
                    const tokenMatch = this.textIndex.get(token)
                    if (tokenMatch) tokenMatch.forEach(id => textMatches.add(id))
                    // Also partial match
                    for (const [indexedToken, ids] of this.textIndex.entries()) {
                        if (indexedToken.includes(token) || token.includes(indexedToken)) {
                            ids.forEach(id => textMatches.add(id))
                        }
                    }
                }

                // Combine name + text matches (OR logic)
                let matchingIds: string[] = []
                const allMatches = new Set<string>([...nameMatches, ...textMatches])

                // If we have matches, score them by how many query tokens they match
                if (allMatches.size > 0) {
                    const matchScores = new Map<string, number>()
                    for (const id of allMatches) {
                        const fn = this.functions.get(id)
                        if (!fn) continue
                        let score = 0
                        const fnText = (fn.name + ' ' + (fn.purpose || '')).toLowerCase()
                        for (const token of tokens) {
                            if (fn.name.toLowerCase().includes(token)) score += 2
                            if (fnText.includes(token)) score += 1
                        }
                        matchScores.set(id, score)
                    }
                    matchingIds = [...matchScores.entries()]
                        .sort((a, b) => b[1] - a[1])
                        .map(([id]) => id)
                }

                if (matchingIds.length > 0) {
                    if (candidateIds) {
                        candidateIds = new Set([...candidateIds].filter(id => matchingIds.includes(id)))
                    } else {
                        candidateIds = new Set(matchingIds)
                    }
                    matchReasons.push(`text search: ${query.text} (${matchingIds.length} matches)`)
                }
            }
        }

        if (query.calls) {
            const lower = query.calls.toLowerCase()
            const ids = this.byCall.get(lower)
            if (ids && ids.size > 0) {
                if (candidateIds) {
                    candidateIds = new Set([...candidateIds].filter(id => ids.has(id)))
                } else {
                    candidateIds = new Set(ids)
                }
                matchReasons.push(`calls: ${query.calls}`)
            } else if (!candidateIds) {
                candidateIds = new Set()
            }
        }

        if (query.calledBy) {
            const ids = this.byCalledBy.get(query.calledBy)
            if (ids && ids.size > 0) {
                if (candidateIds) {
                    candidateIds = new Set([...candidateIds].filter(id => ids.has(id)))
                } else {
                    candidateIds = new Set(ids)
                }
                matchReasons.push(`calledBy: ${query.calledBy}`)
            } else if (!candidateIds) {
                candidateIds = new Set()
            }
        }

        if (query.minParams !== undefined) {
            const matching = [...this.functions.values()]
                .filter(f => f.params.length >= query.minParams!)
                .map(f => f.id)

            if (candidateIds) {
                candidateIds = new Set([...candidateIds].filter(id => matching.includes(id)))
            } else {
                candidateIds = new Set(matching)
            }
            matchReasons.push(`minParams: ${query.minParams}`)
        }

        if (query.maxParams !== undefined) {
            const matching = [...this.functions.values()]
                .filter(f => f.params.length <= query.maxParams!)
                .map(f => f.id)

            if (candidateIds) {
                candidateIds = new Set([...candidateIds].filter(id => matching.includes(id)))
            } else {
                candidateIds = new Set(matching)
            }
            matchReasons.push(`maxParams: ${query.maxParams}`)
        }

        // Only return results if we actually matched something
        // Do NOT fallback to returning all functions
        if (!candidateIds || candidateIds.size === 0) {
            return []
        }

        const results: SearchResult[] = []

        // For text search, track match quality for scoring
        let textMatchQuality: Map<string, number> | undefined
        if (query.text) {
            textMatchQuality = new Map()
            const tokens = query.text.toLowerCase().split(/\s+/).filter(t => t.length >= 2)
            for (const fn of this.functions.values()) {
                let matchCount = 0
                const fnText = (fn.name + ' ' + fn.purpose).toLowerCase()
                for (const token of tokens) {
                    if (fnText.includes(token)) matchCount++
                }
                if (matchCount > 0) {
                    textMatchQuality.set(fn.id, matchCount / tokens.length)
                }
            }
        }

        for (const id of candidateIds) {
            const fn = this.functions.get(id)
            if (!fn) continue

            let score = 1.0

            // Exact name match gets highest score
            if (query.name && fn.name.toLowerCase() === query.name.toLowerCase()) {
                score *= 3.0
            }
            // Name contains query gets boost
            else if (query.name && fn.name.toLowerCase().includes(query.name.toLowerCase())) {
                score *= 2.0
            }
            // Text search match quality
            if (textMatchQuality && textMatchQuality.has(fn.id)) {
                score *= (1 + textMatchQuality.get(fn.id)!)
            }
            if (query.isExported !== undefined && fn.isExported === query.isExported) {
                score *= 1.5
            }
            if (query.keyword) {
                const kw = query.keyword.toLowerCase()
                if (fn.keywords.includes(kw)) score *= 1.5
            }

            results.push({
                function: fn,
                score,
                matchReasons,
            })
        }

        results.sort((a, b) => b.score - a.score)

        const offset = query.offset || 0
        const limit = query.limit || 100

        return results.slice(offset, offset + limit)
    }

    searchText(text: string, limit: number = 20): SearchResult[] {
        return this.search({ text, limit })
    }

    searchByName(name: string, limit: number = 20): SearchResult[] {
        return this.search({ nameContains: name, limit })
    }

    getCallers(functionId: string): RichFunction[] {
        const fn = this.functions.get(functionId)
        if (!fn) return []
        return fn.calledBy
            .map(id => this.functions.get(id))
            .filter(Boolean) as RichFunction[]
    }

    getCallees(functionId: string): RichFunction[] {
        const fn = this.functions.get(functionId)
        if (!fn) return []
        return fn.calls
            .map(c => c.targetId)
            .filter(Boolean)
            .map(id => this.functions.get(id!))
            .filter(Boolean) as RichFunction[]
    }

    getRelated(functionId: string, depth: number = 1): RichFunction[] {
        const related = new Set<string>()
        const queue: { id: string; d: number }[] = [{ id: functionId, d: 0 }]
        let head = 0

        while (head < queue.length) {
            const { id, d } = queue[head++]
            if (d >= depth) continue

            const fn = this.functions.get(id)
            if (!fn) continue

            for (const callerId of fn.calledBy) {
                if (!related.has(callerId)) {
                    related.add(callerId)
                    queue.push({ id: callerId, d: d + 1 })
                }
            }

            for (const callee of fn.calls) {
                if (callee.targetId && !related.has(callee.targetId)) {
                    related.add(callee.targetId)
                    queue.push({ id: callee.targetId, d: d + 1 })
                }
            }
        }

        return [...related]
            .map(id => this.functions.get(id))
            .filter(Boolean) as RichFunction[]
    }

    getContext(request: ContextRequest): FunctionContext | null {
        const fn = this.functions.get(request.functionId)
        if (!fn) return null

        const include = request.include || 'full'

        const context: FunctionContext = {
            signature: fn.signature,
            fullSignature: fn.fullSignature,
            params: fn.params,
            returnType: fn.returnType,
            calls: include === 'signature' ? [] : fn.calls,
            calledBy: include === 'signature' ? [] : fn.calledBy,
            decorators: include === 'signature' ? [] : fn.decorators,
            file: fn.file,
            startLine: fn.startLine,
            endLine: fn.endLine,
            keywords: fn.keywords,
        }

        if (include === 'full' || include === 'body' || include === 'all') {
            context.purpose = fn.purpose
            context.docComment = fn.docComment
            context.errorHandling = fn.errorHandling
            context.edgeCases = fn.edgeCasesHandled
        }

        if (fn.body && (include === 'body' || include === 'all')) {
            if (request.maxBodyLines && request.maxBodyLines > 0) {
                const lines = fn.body.split('\n')
                context.body = lines.slice(0, request.maxBodyLines).join('\n')
                if (lines.length > request.maxBodyLines) {
                    context.body += `\n... ${lines.length - request.maxBodyLines} more lines`
                }
            } else {
                context.body = fn.body
            }
        }

        return context
    }

    getSignatures(functionIds: string[]): string[] {
        return functionIds
            .map(id => this.functions.get(id))
            .filter(Boolean)
            .map(fn => fn!.fullSignature)
    }

    getSignaturesMap(functionIds: string[]): Record<string, string> {
        const map: Record<string, string> = {}
        for (const id of functionIds) {
            const fn = this.functions.get(id)
            if (fn) {
                map[id] = fn.fullSignature
            }
        }
        return map
    }

    getSummaries(functionIds: string[]): Array<{ id: string; name: string; signature: string; purpose: string; file: string }> {
        return functionIds
            .map(id => {
                const fn = this.functions.get(id)
                if (!fn) return null
                return {
                    id: fn.id,
                    name: fn.name,
                    signature: fn.fullSignature,
                    purpose: fn.purpose,
                    file: fn.file,
                }
            })
            .filter(Boolean) as any
    }

    getAllSignatures(): Map<string, string> {
        const map = new Map<string, string>()
        for (const [id, fn] of this.functions) {
            map.set(id, fn.fullSignature)
        }
        return map
    }

    getAllSummaries(): Array<{ id: string; name: string; signature: string; purpose: string; file: string }> {
        return [...this.functions.values()].map(fn => ({
            id: fn.id,
            name: fn.name,
            signature: fn.fullSignature,
            purpose: fn.purpose,
            file: fn.file,
        }))
    }

    getKeywords(): string[] {
        return [...this.allKeywords]
    }

    getStats(): {
        totalFunctions: number
        exportedCount: number
        asyncCount: number
        byModule: Record<string, number>
        byReturnType: Record<string, number>
        byFile: Record<string, number>
    } {
        const functions = [...this.functions.values()]

        const byModule: Record<string, number> = {}
        const byReturnType: Record<string, number> = {}
        const byFile: Record<string, number> = {}

        let exportedCount = 0
        let asyncCount = 0

        for (const fn of functions) {
            if (fn.isExported) exportedCount++
            if (fn.isAsync) asyncCount++

            byModule[fn.moduleId] = (byModule[fn.moduleId] || 0) + 1

            const returnType = fn.returnType || 'unknown'
            byReturnType[returnType] = (byReturnType[returnType] || 0) + 1

            const fileName = fn.file.split('/').pop() || fn.file
            byFile[fileName] = (byFile[fileName] || 0) + 1
        }

        return {
            totalFunctions: functions.length,
            exportedCount,
            asyncCount,
            byModule,
            byReturnType,
            byFile,
        }
    }
}
