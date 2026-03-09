import { describe, test, expect, beforeAll } from 'bun:test'
import { SemanticSearcher } from '../src/semantic-searcher'
import type { MikkLock } from '@getmikk/core'

// ── Minimal mock lock ─────────────────────────────────────────────────────────
const mockLock: MikkLock = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    generatorVersion: '1.1.0',
    projectRoot: '/test',
    syncState: { status: 'clean', lastSyncAt: new Date().toISOString(), lockHash: 'a', contractHash: 'b' },
    modules: {},
    functions: {
        'fn:auth:verifyToken': {
            id: 'fn:auth:verifyToken',
            name: 'verifyToken',
            file: 'src/auth/verify.ts',
            startLine: 1, endLine: 10,
            hash: 'h1', calls: [], calledBy: [],
            moduleId: 'auth',
            purpose: 'Verify and decode a JWT token',
            params: [{ name: 'token', type: 'string', optional: false }],
            returnType: 'UserPayload',
        },
        'fn:db:saveUser': {
            id: 'fn:db:saveUser',
            name: 'saveUser',
            file: 'src/db/users.ts',
            startLine: 1, endLine: 15,
            hash: 'h2', calls: [], calledBy: [],
            moduleId: 'db',
            purpose: 'Persist a user record to the database',
            params: [{ name: 'user', type: 'User', optional: false }],
            returnType: 'Promise<void>',
        },
        'fn:email:sendWelcome': {
            id: 'fn:email:sendWelcome',
            name: 'sendWelcomeEmail',
            file: 'src/email/sender.ts',
            startLine: 1, endLine: 20,
            hash: 'h3', calls: [], calledBy: [],
            moduleId: 'email',
            purpose: 'Send a welcome email to a newly registered user',
            params: [{ name: 'to', type: 'string', optional: false }],
            returnType: 'Promise<void>',
        },
        'fn:api:handleLogin': {
            id: 'fn:api:handleLogin',
            name: 'handleLogin',
            file: 'src/api/login.ts',
            startLine: 1, endLine: 30,
            hash: 'h4', calls: [], calledBy: [],
            moduleId: 'api',
            purpose: 'Handle HTTP login request and return JWT',
            params: [{ name: 'req', type: 'Request', optional: false }],
            returnType: 'Promise<Response>',
        },
    },
    files: {},
    graph: { nodes: 4, edges: 0, rootHash: 'root' },
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SemanticSearcher', () => {
    let searcher: SemanticSearcher

    test('isAvailable() returns true (package is installed)', async () => {
        const ok = await SemanticSearcher.isAvailable()
        expect(ok).toBe(true)
    })

    describe('with indexed lock', () => {
        beforeAll(async () => {
            searcher = new SemanticSearcher('/tmp/mikk-test-' + Date.now())
            await searcher.index(mockLock)
        }, 60_000) // model download can take time on first run

        test('returns results for any query', async () => {
            const results = await searcher.search('authenticate user', mockLock, 4)
            expect(results.length).toBeGreaterThan(0)
            expect(results[0].score).toBeGreaterThanOrEqual(0)
            expect(results[0].score).toBeLessThanOrEqual(1)
        })

        test('JWT-related query ranks verifyToken or handleLogin highest', async () => {
            const results = await searcher.search('validate JWT token', mockLock, 4)
            const top2Names = results.slice(0, 2).map(r => r.name)
            const hasJwtMatch = top2Names.some(n => n === 'verifyToken' || n === 'handleLogin')
            expect(hasJwtMatch).toBe(true)
        })

        test('email query ranks sendWelcomeEmail highest', async () => {
            const results = await searcher.search('send email to new user', mockLock, 4)
            expect(results[0].name).toBe('sendWelcomeEmail')
        })

        test('database persistence query ranks saveUser highest', async () => {
            const results = await searcher.search('save user to database', mockLock, 4)
            expect(results[0].name).toBe('saveUser')
        })

        test('results include required fields', async () => {
            const results = await searcher.search('login', mockLock, 2)
            for (const r of results) {
                expect(typeof r.id).toBe('string')
                expect(typeof r.name).toBe('string')
                expect(typeof r.file).toBe('string')
                expect(typeof r.score).toBe('number')
                expect(typeof r.lines).toBe('string')
            }
        })

        test('topK limits the number of results', async () => {
            const results = await searcher.search('function', mockLock, 2)
            expect(results.length).toBeLessThanOrEqual(2)
        })

        test('second call uses cache (no re-embedding)', async () => {
            const t0 = Date.now()
            await searcher.index(mockLock) // should be cache hit
            const elapsed = Date.now() - t0
            // Cache hit should be sub-100ms (disk read only)
            expect(elapsed).toBeLessThan(500)
        })

        test('topK = 0 returns empty array', async () => {
            const results = await searcher.search('login', mockLock, 0)
            expect(results).toEqual([])
        })

        test('empty query string does not crash', async () => {
            const results = await searcher.search('', mockLock, 2)
            expect(Array.isArray(results)).toBe(true)
        })

        test('stale cache IDs not present in lock are silently skipped', async () => {
            // Build a lock that has one fewer function than what was cached
            const shrunkLock = { ...mockLock, functions: { 'fn:auth:verifyToken': mockLock.functions['fn:auth:verifyToken']! } }
            // searcher.cache still has embeddings for all 4 IDs from beforeAll
            const results = await searcher.search('user', shrunkLock, 10)
            // Only the one function present in the shrunk lock should appear
            expect(results.every(r => r.id in shrunkLock.functions)).toBe(true)
        })

        test('re-index with changed lock rebuilds embeddings', async () => {
            const newFn = {
                ...mockLock.functions['fn:auth:verifyToken']!,
                id: 'fn:new:brandNewFn',
                name: 'brandNewFn',
                purpose: 'A completely unique purpose for testing fingerprint change',
            }
            const changedLock: MikkLock = {
                ...mockLock,
                functions: { ...mockLock.functions, 'fn:new:brandNewFn': newFn },
            }
            const freshSearcher = new SemanticSearcher('/tmp/mikk-reindex-' + Date.now())
            await freshSearcher.index(changedLock) // fingerprint differs → full recompute
            const results = await freshSearcher.search('unique purpose', changedLock, 5)
            expect(results.some(r => r.name === 'brandNewFn')).toBe(true)
        }, 30_000)
    })

    describe('edge cases', () => {
        test('search() before index() throws', async () => {
            const fresh = new SemanticSearcher('/tmp/mikk-never-indexed-' + Date.now())
            await expect(fresh.search('query', mockLock)).rejects.toThrow('Call index() before search()')
        })

        test('empty lock: index() and search() succeed, return empty array', async () => {
            const emptyLock: MikkLock = { ...mockLock, functions: {} }
            const s = new SemanticSearcher('/tmp/mikk-empty-' + Date.now())
            await s.index(emptyLock)
            const results = await s.search('anything', emptyLock, 5)
            expect(results).toEqual([])
        })
    })
})
