import { describe, it, expect, beforeEach } from 'bun:test'
import { DirectSearchEngine, createDirectSearch } from '../src/search/direct-search'
import type { MikkLock } from '../src/contract/schema'

function createMockLock(functions: Partial<MikkLock['functions']> = {}): MikkLock {
    return {
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        generatorVersion: '1.0.0',
        projectRoot: '/test',
        syncState: {
            status: 'clean',
            lastSyncAt: new Date().toISOString(),
            lockHash: 'x',
            contractHash: 'x',
        },
        graph: { nodes: 0, edges: 0, rootHash: 'x' },
        functions: functions as MikkLock['functions'],
        classes: {},
        files: {},
        modules: {},
        routes: [],
    }
}

describe('DirectSearchEngine', () => {
    let engine: DirectSearchEngine

    function createEngineWithData() {
        const lock = createMockLock({
            'fn:src/auth.ts:login': {
                id: 'fn:src/auth.ts:login',
                name: 'login',
                file: 'src/auth.ts',
                startLine: 10,
                endLine: 30,
                hash: 'hash1',
                calls: ['fn:src/db.ts:query'],
                calledBy: [],
                moduleId: 'auth',
                params: [
                    { name: 'email', type: 'string' },
                    { name: 'password', type: 'string' },
                ],
                returnType: 'User',
                isAsync: true,
            },
            'fn:src/auth.ts:logout': {
                id: 'fn:src/auth.ts:logout',
                name: 'logout',
                file: 'src/auth.ts',
                startLine: 35,
                endLine: 45,
                hash: 'hash2',
                calls: [],
                calledBy: ['fn:src/auth.ts:login'],
                moduleId: 'auth',
                params: [],
                returnType: 'void',
                isAsync: false,
            },
            'fn:src/db.ts:query': {
                id: 'fn:src/db.ts:query',
                name: 'query',
                file: 'src/db.ts',
                startLine: 1,
                endLine: 20,
                hash: 'hash3',
                calls: [],
                calledBy: ['fn:src/auth.ts:login'],
                moduleId: 'db',
                params: [
                    { name: 'sql', type: 'string' },
                ],
                returnType: 'Result',
                isAsync: true,
            },
            'fn:src/api.ts:getUser': {
                id: 'fn:src/api.ts:getUser',
                name: 'getUser',
                file: 'src/api.ts',
                startLine: 5,
                endLine: 15,
                hash: 'hash4',
                calls: ['fn:src/auth.ts:login'],
                calledBy: [],
                moduleId: 'api',
                params: [{ name: 'id', type: 'string' }],
                returnType: 'User',
                isAsync: true,
                isExported: true,
            },
        })
        return new DirectSearchEngine(lock)
    }

    beforeEach(() => {
        engine = createEngineWithData()
    })

    describe('find', () => {
        it('finds function by exact name', () => {
            const fn = engine.find('login')
            expect(fn).toBeDefined()
            expect(fn?.name).toBe('login')
        })

        it('finds function by partial name match', () => {
            const fn = engine.find('log')
            expect(fn).toBeDefined()
            expect(fn?.name).toBe('login')
        })

        it('returns undefined for non-existent function', () => {
            const fn = engine.find('nonExistentFunction')
            expect(fn).toBeUndefined()
        })
    })

    describe('findAll', () => {
        it('finds all functions matching name pattern', () => {
            const fns = engine.findAll('log')
            expect(fns.length).toBeGreaterThanOrEqual(2)
            expect(fns.map(f => f.name).sort()).toContain('login')
            expect(fns.map(f => f.name).sort()).toContain('logout')
        })
    })

    describe('findBySignature', () => {
        it('finds function by full signature', () => {
            const fn = engine.findBySignature('async login(email: string, password: string): User')
            expect(fn?.name).toBe('login')
        })

        it('returns undefined for non-existent signature', () => {
            const fn = engine.findBySignature('nonExistent(params)')
            expect(fn).toBeUndefined()
        })
    })

    describe('findByLocation', () => {
        it('finds function by file and line', () => {
            const fn = engine.findByLocation('src/auth.ts', 15)
            expect(fn?.name).toBe('login')
        })

        it('returns undefined for line outside all functions', () => {
            const fn = engine.findByLocation('src/auth.ts', 100)
            expect(fn).toBeUndefined()
        })
    })

    describe('findInFile', () => {
        it('finds all functions in a file', () => {
            const fns = engine.findInFile('src/auth.ts')
            expect(fns).toHaveLength(2)
            expect(fns.map(f => f.name).sort()).toEqual(['login', 'logout'])
        })

        it('returns empty array for non-existent file', () => {
            const fns = engine.findInFile('nonExistent.ts')
            expect(fns).toHaveLength(0)
        })
    })

    describe('findInModule', () => {
        it('finds all functions in a module', () => {
            const fns = engine.findInModule('auth')
            expect(fns).toHaveLength(2)
        })
    })

    describe('findExport', () => {
        it('finds exported functions', () => {
            const fns = engine.findExport()
            expect(fns.some(f => f.name === 'getUser')).toBe(true)
            expect(fns.every(f => f.isExported)).toBe(true)
        })

        it('filters exported by pattern', () => {
            const fns = engine.findExport('user')
            expect(fns.some(f => f.name === 'getUser')).toBe(true)
        })
    })

    describe('findAsync', () => {
        it('finds async functions', () => {
            const fns = engine.findAsync()
            expect(fns.every(f => f.isAsync)).toBe(true)
            expect(fns.length).toBeGreaterThanOrEqual(2)
        })

        it('filters async by pattern', () => {
            const fns = engine.findAsync('log')
            expect(fns.length).toBeGreaterThanOrEqual(1)
            expect(fns.every(f => f.name.includes('log'))).toBe(true)
        })
    })

    describe('findByReturnType', () => {
        it('finds functions by return type', () => {
            const fns = engine.findByReturnType('User')
            expect(fns.length).toBeGreaterThanOrEqual(2)
            expect(fns.every(f => f.returnType === 'User')).toBe(true)
        })
    })

    describe('search', () => {
        it('searches by name', () => {
            const fns = engine.search({ name: 'log' })
            expect(fns.length).toBeGreaterThanOrEqual(2)
        })

        it('searches by exact name', () => {
            const fns = engine.search({ exact: 'login' })
            expect(fns).toHaveLength(1)
            expect(fns[0].name).toBe('login')
        })

        it('searches by starts with', () => {
            const fns = engine.search({ startsWith: 'get' })
            expect(fns.some(f => f.name === 'getUser')).toBe(true)
        })

        it('searches by file', () => {
            const fns = engine.search({ file: 'auth' })
            expect(fns.every(f => f.file.includes('auth'))).toBe(true)
        })

        it('searches by module', () => {
            const fns = engine.search({ module: 'auth' })
            expect(fns.every(f => f.moduleId === 'auth')).toBe(true)
        })

        it('searches by exported', () => {
            const fns = engine.search({ exported: true })
            expect(fns.every(f => f.isExported)).toBe(true)
        })

        it('searches by async', () => {
            const fns = engine.search({ async: true })
            expect(fns.every(f => f.isAsync)).toBe(true)
        })

        it('searches by return type', () => {
            const fns = engine.search({ returns: 'User' })
            expect(fns.every(f => f.returnType === 'User')).toBe(true)
        })

        it('searches by param name', () => {
            const fns = engine.search({ param: 'email' })
            expect(fns.some(f => f.name === 'login')).toBe(true)
        })

        it('searches by keyword', () => {
            const fns = engine.search({ keyword: 'async' })
            expect(fns.every(f => f.keywords.includes('async'))).toBe(true)
        })

        it('searches by calls', () => {
            const fns = engine.search({ calls: 'query' })
            expect(fns.some(f => f.name === 'login')).toBe(true)
        })

        it('combines multiple criteria', () => {
            const fns = engine.search({
                name: 'log',
                async: true,
                module: 'auth',
            })
            expect(fns.some(f => f.name === 'login')).toBe(true)
        })
    })

    describe('findCallers / findCallees', () => {
        it('finds callers of a function', () => {
            const callers = engine.findCallers('fn:src/db.ts:query')
            expect(callers.some(f => f.name === 'login')).toBe(true)
        })

        it('finds callees of a function', () => {
            const callees = engine.findCallees('fn:src/auth.ts:login')
            expect(callees.some(f => f.name === 'query')).toBe(true)
        })
    })

    describe('findRelated', () => {
        it('finds related functions within depth', () => {
            const related = engine.findRelated('fn:src/db.ts:query', 1)
            expect(related.length).toBeGreaterThanOrEqual(1)
        })
    })

    describe('getContext', () => {
        it('gets full context', () => {
            const ctx = engine.getContext('fn:src/auth.ts:login', { full: true })
            expect(ctx).toBeDefined()
            expect(ctx?.signature).toContain('login')
            expect(ctx?.params).toHaveLength(2)
        })

        it('returns null for non-existent function', () => {
            const ctx = engine.getContext('nonExistent', { full: true })
            expect(ctx).toBeNull()
        })
    })

    describe('getFunctionWithContext', () => {
        it('returns rich function data', () => {
            const fn = engine.getFunctionWithContext('fn:src/auth.ts:login')
            expect(fn).toBeDefined()
            expect(fn?.name).toBe('login')
            expect(fn?.isAsync).toBe(true)
            expect(fn?.params).toHaveLength(2)
        })

        it('returns null for non-existent function', () => {
            const fn = engine.getFunctionWithContext('nonExistent')
            expect(fn).toBeNull()
        })
    })

    describe('getStats', () => {
        it('returns correct statistics', () => {
            const stats = engine.getStats()
            expect(stats.totalFunctions).toBe(4)
            expect(stats.exportedCount).toBe(1)
            expect(stats.asyncCount).toBe(3)
        })
    })

    describe('getAllSummaries', () => {
        it('returns all function summaries', () => {
            const summaries = engine.getAllSummaries()
            expect(summaries).toHaveLength(4)
            expect(summaries[0]).toHaveProperty('id')
            expect(summaries[0]).toHaveProperty('name')
            expect(summaries[0]).toHaveProperty('signature')
            expect(summaries[0]).toHaveProperty('purpose')
            expect(summaries[0]).toHaveProperty('file')
        })
    })

    describe('quickSearch', () => {
        it('performs quick text search', () => {
            const fns = engine.quickSearch('login', 5)
            expect(fns.length).toBeGreaterThan(0)
            expect(fns[0].name).toBe('login')
        })
    })

    describe('findSimilar', () => {
        it('finds similar functions by name', () => {
            const fns = engine.findSimilar({ name: 'loginn' })
            expect(fns.length).toBeGreaterThan(0)
        })

        it('finds similar by param types', () => {
            const fns = engine.findSimilar({ paramTypes: ['string'] })
            expect(fns.length).toBeGreaterThan(0)
        })

        it('finds similar by return type', () => {
            const fns = engine.findSimilar({ returnType: 'User' })
            expect(fns.length).toBeGreaterThanOrEqual(2)
        })

        it('combines similarity criteria', () => {
            const fns = engine.findSimilar({
                returnType: 'User',
                isAsync: true,
            } as any)
            expect(fns.every(f => f.returnType === 'User')).toBe(true)
        })
    })

    describe('searchByPattern', () => {
        it('searches by regex pattern', () => {
            const fns = engine.searchByPattern('log')
            expect(fns.some(f => f.name === 'login')).toBe(true)
            expect(fns.some(f => f.name === 'logout')).toBe(true)
        })
    })

    describe('exportAll', () => {
        it('exports all function data', () => {
            const exported = engine.exportAll()
            expect(exported).toHaveLength(4)
            expect(exported[0]).toHaveProperty('id')
            expect(exported[0]).toHaveProperty('signature')
            expect(exported[0]).toHaveProperty('fullSignature')
            expect(exported[0]).toHaveProperty('paramCount')
        })
    })

    describe('getById', () => {
        it('gets function by ID', () => {
            const fn = engine.getById('fn:src/auth.ts:login')
            expect(fn).toBeDefined()
            expect(fn?.name).toBe('login')
        })

        it('returns undefined for non-existent ID', () => {
            const fn = engine.getById('nonExistent')
            expect(fn).toBeUndefined()
        })
    })

    describe('count', () => {
        it('returns correct count', () => {
            expect(engine.count()).toBe(4)
        })
    })

    describe('createDirectSearch', () => {
        it('creates search engine from lock', () => {
            const lock = createMockLock({
                'fn:src/test.ts:hello': {
                    id: 'fn:src/test.ts:hello',
                    name: 'hello',
                    file: 'src/test.ts',
                    startLine: 1,
                    endLine: 10,
                    hash: 'x',
                    calls: [],
                    calledBy: [],
                    moduleId: 'test',
                },
            })
            const search = createDirectSearch(lock)
            expect(search.count()).toBe(1)
            expect(search.find('hello')?.name).toBe('hello')
        })
    })
})
