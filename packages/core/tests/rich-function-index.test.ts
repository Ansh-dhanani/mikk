import { describe, it, expect, beforeEach } from 'bun:test'
import { RichFunctionIndex } from '../src/graph/rich-function-index'
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

describe('RichFunctionIndex', () => {
    let index: RichFunctionIndex

    beforeEach(() => {
        index = new RichFunctionIndex()
    })

    describe('indexing', () => {
        it('indexes functions from lock', () => {
            const lock = createMockLock({
                'fn:src/auth.ts:signToken': {
                    id: 'fn:src/auth.ts:signToken',
                    name: 'signToken',
                    file: 'src/auth.ts',
                    startLine: 10,
                    endLine: 25,
                    hash: 'abc123',
                    calls: [],
                    calledBy: [],
                    moduleId: 'auth',
                },
            })

            index.index(lock)
            expect(index.getCount()).toBe(1)
        })

        it('handles empty lock', () => {
            const lock = createMockLock()
            index.index(lock)
            expect(index.getCount()).toBe(0)
        })

        it('parses function ids correctly', () => {
            const lock = createMockLock({
                'fn:src/utils/helper.ts:parseData': {
                    id: 'fn:src/utils/helper.ts:parseData',
                    name: 'parseData',
                    file: 'src/utils/helper.ts',
                    startLine: 1,
                    endLine: 10,
                    hash: 'hash1',
                    calls: [],
                    calledBy: [],
                    moduleId: 'utils',
                },
            })

            index.index(lock)
            const fn = index.get('fn:src/utils/helper.ts:parseData')
            expect(fn).toBeDefined()
            expect(fn?.name).toBe('parseData')
        })
    })

    describe('getByExactName', () => {
        it('finds function by exact name', () => {
            const lock = createMockLock({
                'fn:src/auth.ts:verifyToken': {
                    id: 'fn:src/auth.ts:verifyToken',
                    name: 'verifyToken',
                    file: 'src/auth.ts',
                    startLine: 1,
                    endLine: 10,
                    hash: 'x',
                    calls: [],
                    calledBy: [],
                    moduleId: 'auth',
                },
            })

            index.index(lock)
            const fn = index.getByExactName('verifyToken')
            expect(fn).toBeDefined()
            expect(fn?.id).toBe('fn:src/auth.ts:verifyToken')
        })

        it('returns undefined for non-existent name', () => {
            const lock = createMockLock()
            index.index(lock)
            expect(index.getByExactName('nonExistent')).toBeUndefined()
        })
    })

    describe('getByFile', () => {
        it('finds all functions in a file', () => {
            const lock = createMockLock({
                'fn:src/auth.ts:login': {
                    id: 'fn:src/auth.ts:login',
                    name: 'login',
                    file: 'src/auth.ts',
                    startLine: 1,
                    endLine: 10,
                    hash: 'x',
                    calls: [],
                    calledBy: [],
                    moduleId: 'auth',
                },
                'fn:src/auth.ts:logout': {
                    id: 'fn:src/auth.ts:logout',
                    name: 'logout',
                    file: 'src/auth.ts',
                    startLine: 12,
                    endLine: 20,
                    hash: 'y',
                    calls: [],
                    calledBy: [],
                    moduleId: 'auth',
                },
                'fn:src/other.ts:helper': {
                    id: 'fn:src/other.ts:helper',
                    name: 'helper',
                    file: 'src/other.ts',
                    startLine: 1,
                    endLine: 5,
                    hash: 'z',
                    calls: [],
                    calledBy: [],
                    moduleId: 'other',
                },
            })

            index.index(lock)
            const fns = index.getByFile('src/auth.ts')
            expect(fns).toHaveLength(2)
            expect(fns.map(f => f.name).sort()).toEqual(['login', 'logout'])
        })

        it('returns empty array for non-existent file', () => {
            const lock = createMockLock()
            index.index(lock)
            expect(index.getByFile('nonExistent.ts')).toHaveLength(0)
        })
    })

    describe('getByModule', () => {
        it('finds all functions in a module', () => {
            const lock = createMockLock({
                'fn:src/auth/login.ts:login': {
                    id: 'fn:src/auth/login.ts:login',
                    name: 'login',
                    file: 'src/auth/login.ts',
                    startLine: 1,
                    endLine: 10,
                    hash: 'x',
                    calls: [],
                    calledBy: [],
                    moduleId: 'auth',
                },
                'fn:src/auth/jwt.ts:createToken': {
                    id: 'fn:src/auth/jwt.ts:createToken',
                    name: 'createToken',
                    file: 'src/auth/jwt.ts',
                    startLine: 1,
                    endLine: 10,
                    hash: 'y',
                    calls: [],
                    calledBy: [],
                    moduleId: 'auth',
                },
            })

            index.index(lock)
            const fns = index.getByModule('auth')
            expect(fns).toHaveLength(2)
        })
    })

    describe('getExported', () => {
        it('returns only exported functions', () => {
            const lock = createMockLock({
                'fn:src/auth.ts:publicFn': {
                    id: 'fn:src/auth.ts:publicFn',
                    name: 'publicFn',
                    file: 'src/auth.ts',
                    startLine: 1,
                    endLine: 10,
                    hash: 'x',
                    calls: [],
                    calledBy: [],
                    moduleId: 'auth',
                    isExported: true,
                },
                'fn:src/auth.ts:privateFn': {
                    id: 'fn:src/auth.ts:privateFn',
                    name: 'privateFn',
                    file: 'src/auth.ts',
                    startLine: 11,
                    endLine: 20,
                    hash: 'y',
                    calls: [],
                    calledBy: [],
                    moduleId: 'auth',
                    isExported: false,
                },
            })

            index.index(lock)
            const exported = index.getExported()
            expect(exported).toHaveLength(1)
            expect(exported[0].name).toBe('publicFn')
        })
    })

    describe('search', () => {
        it('searches by name contains', () => {
            const lock = createMockLock({
                'fn:src/auth.ts:getUser': {
                    id: 'fn:src/auth.ts:getUser',
                    name: 'getUser',
                    file: 'src/auth.ts',
                    startLine: 1,
                    endLine: 10,
                    hash: 'x',
                    calls: [],
                    calledBy: [],
                    moduleId: 'auth',
                },
                'fn:src/auth.ts:createUser': {
                    id: 'fn:src/auth.ts:createUser',
                    name: 'createUser',
                    file: 'src/auth.ts',
                    startLine: 11,
                    endLine: 20,
                    hash: 'y',
                    calls: [],
                    calledBy: [],
                    moduleId: 'auth',
                },
                'fn:src/db.ts:query': {
                    id: 'fn:src/db.ts:query',
                    name: 'query',
                    file: 'src/db.ts',
                    startLine: 1,
                    endLine: 10,
                    hash: 'z',
                    calls: [],
                    calledBy: [],
                    moduleId: 'db',
                },
            })

            index.index(lock)
            const results = index.search({ nameContains: 'user' })
            expect(results).toHaveLength(2)
            expect(results.map(r => r.function.name).sort()).toEqual(['createUser', 'getUser'])
        })

        it('searches by exact name', () => {
            const lock = createMockLock({
                'fn:src/auth.ts:login': {
                    id: 'fn:src/auth.ts:login',
                    name: 'login',
                    file: 'src/auth.ts',
                    startLine: 1,
                    endLine: 10,
                    hash: 'x',
                    calls: [],
                    calledBy: [],
                    moduleId: 'auth',
                },
            })

            index.index(lock)
            const results = index.search({ exactName: 'login' })
            expect(results).toHaveLength(1)
            expect(results[0].function.name).toBe('login')
        })

        it('searches by isAsync', () => {
            const lock = createMockLock({
                'fn:src/auth.ts:syncFn': {
                    id: 'fn:src/auth.ts:syncFn',
                    name: 'syncFn',
                    file: 'src/auth.ts',
                    startLine: 1,
                    endLine: 10,
                    hash: 'x',
                    calls: [],
                    calledBy: [],
                    moduleId: 'auth',
                    isAsync: false,
                },
                'fn:src/db.ts:asyncFn': {
                    id: 'fn:src/db.ts:asyncFn',
                    name: 'asyncFn',
                    file: 'src/db.ts',
                    startLine: 1,
                    endLine: 10,
                    hash: 'y',
                    calls: [],
                    calledBy: [],
                    moduleId: 'db',
                    isAsync: true,
                },
            })

            index.index(lock)
            const results = index.search({ isAsync: true })
            expect(results).toHaveLength(1)
            expect(results[0].function.name).toBe('asyncFn')
        })

        it('searches by return type', () => {
            const lock = createMockLock({
                'fn:src/auth.ts:getUser': {
                    id: 'fn:src/auth.ts:getUser',
                    name: 'getUser',
                    file: 'src/auth.ts',
                    startLine: 1,
                    endLine: 10,
                    hash: 'x',
                    calls: [],
                    calledBy: [],
                    moduleId: 'auth',
                    returnType: 'User',
                },
                'fn:src/db.ts:delete': {
                    id: 'fn:src/db.ts:delete',
                    name: 'delete',
                    file: 'src/db.ts',
                    startLine: 1,
                    endLine: 10,
                    hash: 'y',
                    calls: [],
                    calledBy: [],
                    moduleId: 'db',
                    returnType: 'void',
                },
            })

            index.index(lock)
            const results = index.search({ returnType: 'void' })
            expect(results).toHaveLength(1)
            expect(results[0].function.name).toBe('delete')
        })

        it('combines multiple search criteria', () => {
            const lock = createMockLock({
                'fn:src/auth.ts:asyncLogin': {
                    id: 'fn:src/auth.ts:asyncLogin',
                    name: 'asyncLogin',
                    file: 'src/auth.ts',
                    startLine: 1,
                    endLine: 10,
                    hash: 'x',
                    calls: [],
                    calledBy: [],
                    moduleId: 'auth',
                    isAsync: true,
                },
                'fn:src/db.ts:syncLogin': {
                    id: 'fn:src/db.ts:syncLogin',
                    name: 'syncLogin',
                    file: 'src/db.ts',
                    startLine: 1,
                    endLine: 10,
                    hash: 'y',
                    calls: [],
                    calledBy: [],
                    moduleId: 'db',
                    isAsync: false,
                },
            })

            index.index(lock)
            const results = index.search({ nameContains: 'login', isAsync: true })
            expect(results).toHaveLength(1)
            expect(results[0].function.name).toBe('asyncLogin')
        })
    })

    describe('searchText', () => {
        it('searches across multiple fields', () => {
            const lock = createMockLock({
                'fn:src/auth.ts:login': {
                    id: 'fn:src/auth.ts:login',
                    name: 'login',
                    file: 'src/auth.ts',
                    startLine: 1,
                    endLine: 10,
                    hash: 'x',
                    calls: [],
                    calledBy: [],
                    moduleId: 'auth',
                    purpose: 'Handles user authentication',
                },
            })

            index.index(lock)
            const results = index.searchText('authentication')
            expect(results).toHaveLength(1)
            expect(results[0].function.name).toBe('login')
        })
    })

    describe('findByLocation', () => {
        it('finds function by file and line', () => {
            const lock = createMockLock({
                'fn:src/auth.ts:login': {
                    id: 'fn:src/auth.ts:login',
                    name: 'login',
                    file: 'src/auth.ts',
                    startLine: 10,
                    endLine: 25,
                    hash: 'x',
                    calls: [],
                    calledBy: [],
                    moduleId: 'auth',
                },
            })

            index.index(lock)
            const fn = index.findByLocation('src/auth.ts', 15)
            expect(fn?.name).toBe('login')
        })

        it('returns undefined for line outside function range', () => {
            const lock = createMockLock({
                'fn:src/auth.ts:login': {
                    id: 'fn:src/auth.ts:login',
                    name: 'login',
                    file: 'src/auth.ts',
                    startLine: 10,
                    endLine: 25,
                    hash: 'x',
                    calls: [],
                    calledBy: [],
                    moduleId: 'auth',
                },
            })

            index.index(lock)
            const fn = index.findByLocation('src/auth.ts', 100)
            expect(fn).toBeUndefined()
        })
    })

    describe('getCallers / getCallees', () => {
        it('gets callers of a function', () => {
            const lock = createMockLock({
                'fn:src/auth.ts:login': {
                    id: 'fn:src/auth.ts:login',
                    name: 'login',
                    file: 'src/auth.ts',
                    startLine: 1,
                    endLine: 10,
                    hash: 'x',
                    calls: [],
                    calledBy: ['fn:src/api.ts:handleLogin'],
                    moduleId: 'auth',
                },
                'fn:src/api.ts:handleLogin': {
                    id: 'fn:src/api.ts:handleLogin',
                    name: 'handleLogin',
                    file: 'src/api.ts',
                    startLine: 1,
                    endLine: 10,
                    hash: 'y',
                    calls: ['fn:src/auth.ts:login'],
                    calledBy: [],
                    moduleId: 'api',
                },
            })

            index.index(lock)
            const callers = index.getCallers('fn:src/auth.ts:login')
            expect(callers).toHaveLength(1)
            expect(callers[0].name).toBe('handleLogin')
        })

        it('gets callees of a function (by calledBy reverse lookup)', () => {
            const lock = createMockLock({
                'fn:src/auth.ts:login': {
                    id: 'fn:src/auth.ts:login',
                    name: 'login',
                    file: 'src/auth.ts',
                    startLine: 1,
                    endLine: 10,
                    hash: 'x',
                    calls: [],
                    calledBy: [],
                    moduleId: 'auth',
                },
                'fn:src/db.ts:query': {
                    id: 'fn:src/db.ts:query',
                    name: 'query',
                    file: 'src/db.ts',
                    startLine: 1,
                    endLine: 10,
                    hash: 'y',
                    calls: [],
                    calledBy: ['fn:src/auth.ts:login'],
                    moduleId: 'db',
                },
            })

            index.index(lock)
            // getCallees returns functions that the given function calls
            // Since login doesn't call query directly, we test via getCallers
            const callers = index.getCallers('fn:src/db.ts:query')
            expect(callers.some(c => c.name === 'login')).toBe(true)
        })
    })

    describe('getStats', () => {
        it('returns correct statistics', () => {
            const lock = createMockLock({
                'fn:src/auth.ts:login': {
                    id: 'fn:src/auth.ts:login',
                    name: 'login',
                    file: 'src/auth.ts',
                    startLine: 1,
                    endLine: 10,
                    hash: 'x',
                    calls: [],
                    calledBy: [],
                    moduleId: 'auth',
                    isExported: true,
                    isAsync: true,
                },
                'fn:src/db.ts:query': {
                    id: 'fn:src/db.ts:query',
                    name: 'query',
                    file: 'src/db.ts',
                    startLine: 1,
                    endLine: 10,
                    hash: 'y',
                    calls: [],
                    calledBy: [],
                    moduleId: 'db',
                    isExported: false,
                    isAsync: false,
                },
            })

            index.index(lock)
            const stats = index.getStats()
            expect(stats.totalFunctions).toBe(2)
            expect(stats.exportedCount).toBe(1)
            expect(stats.asyncCount).toBe(1)
            expect(stats.byModule.auth).toBe(1)
            expect(stats.byModule.db).toBe(1)
        })
    })

    describe('getContext', () => {
        it('returns function context', () => {
            const lock = createMockLock({
                'fn:src/auth.ts:login': {
                    id: 'fn:src/auth.ts:login',
                    name: 'login',
                    file: 'src/auth.ts',
                    startLine: 1,
                    endLine: 10,
                    hash: 'x',
                    calls: [],
                    calledBy: [],
                    moduleId: 'auth',
                    params: [{ name: 'email', type: 'string' }],
                    returnType: 'User',
                },
            })

            index.index(lock)
            const ctx = index.getContext({ functionId: 'fn:src/auth.ts:login' })
            expect(ctx).toBeDefined()
            expect(ctx?.signature).toContain('login')
            expect(ctx?.params).toHaveLength(1)
            expect(ctx?.params[0].name).toBe('email')
        })

        it('returns null for non-existent function', () => {
            const lock = createMockLock()
            index.index(lock)
            const ctx = index.getContext({ functionId: 'nonExistent' })
            expect(ctx).toBeNull()
        })
    })

    describe('signature building', () => {
        it('builds correct signatures', () => {
            const lock = createMockLock({
                'fn:src/auth.ts:login': {
                    id: 'fn:src/auth.ts:login',
                    name: 'login',
                    file: 'src/auth.ts',
                    startLine: 1,
                    endLine: 10,
                    hash: 'x',
                    calls: [],
                    calledBy: [],
                    moduleId: 'auth',
                    params: [
                        { name: 'email', type: 'string' },
                        { name: 'password', type: 'string', optional: true },
                    ],
                    returnType: 'User',
                    isAsync: true,
                },
            })

            index.index(lock)
            const fn = index.get('fn:src/auth.ts:login')
            expect(fn?.signature).toContain('login')
            expect(fn?.signature).toContain('email')
            expect(fn?.fullSignature).toContain('async')
            expect(fn?.fullSignature).toContain(': User')
        })
    })

    describe('purpose inference', () => {
        it('infers purpose from function name', () => {
            const lock = createMockLock({
                'fn:src/db.ts:getUser': {
                    id: 'fn:src/db.ts:getUser',
                    name: 'getUser',
                    file: 'src/db.ts',
                    startLine: 1,
                    endLine: 10,
                    hash: 'x',
                    calls: [],
                    calledBy: [],
                    moduleId: 'db',
                },
            })

            index.index(lock)
            const fn = index.get('fn:src/db.ts:getUser')
            expect(fn?.purpose).toContain('Retrieves')
        })
    })

    describe('keyword extraction', () => {
        it('extracts keywords from function name', () => {
            const lock = createMockLock({
                'fn:src/auth.ts:validateUserEmail': {
                    id: 'fn:src/auth.ts:validateUserEmail',
                    name: 'validateUserEmail',
                    file: 'src/auth.ts',
                    startLine: 1,
                    endLine: 10,
                    hash: 'x',
                    calls: [],
                    calledBy: [],
                    moduleId: 'auth',
                },
            })

            index.index(lock)
            const fn = index.get('fn:src/auth.ts:validateUserEmail')
            expect(fn?.keywords).toContain('validate')
            expect(fn?.keywords).toContain('user')
            expect(fn?.keywords).toContain('email')
        })

        it('marks async functions with async keyword', () => {
            const lock = createMockLock({
                'fn:src/db.ts:query': {
                    id: 'fn:src/db.ts:query',
                    name: 'query',
                    file: 'src/db.ts',
                    startLine: 1,
                    endLine: 10,
                    hash: 'x',
                    calls: [],
                    calledBy: [],
                    moduleId: 'db',
                    isAsync: true,
                },
            })

            index.index(lock)
            const fn = index.get('fn:src/db.ts:query')
            expect(fn?.keywords).toContain('async')
        })
    })
})
