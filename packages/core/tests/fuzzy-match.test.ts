import { describe, test, expect } from 'bun:test'
import { scoreFunctions, findFuzzyMatches, levenshtein, splitCamelCase, extractKeywords } from '../src/utils/fuzzy-match'
import type { MikkLock } from '../src/contract/schema'

const mockLock: MikkLock = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    generatorVersion: '1.1.0',
    projectRoot: '/test',
    syncState: { status: 'clean', lastSyncAt: new Date().toISOString(), lockHash: 'abc', contractHash: 'def' },
    modules: {},
    functions: {
        'fn:auth:verifyToken': {
            id: 'fn:auth:verifyToken', name: 'verifyToken', file: 'src/auth/verify.ts',
            startLine: 1, endLine: 10, hash: 'h1', calls: [], calledBy: ['fn:api:handleLogin'],
            moduleId: 'auth',
        },
        'fn:auth:refreshToken': {
            id: 'fn:auth:refreshToken', name: 'refreshToken', file: 'src/auth/refresh.ts',
            startLine: 1, endLine: 15, hash: 'h2', calls: [], calledBy: [],
            moduleId: 'auth',
        },
        'fn:api:handleLogin': {
            id: 'fn:api:handleLogin', name: 'handleLogin', file: 'src/api/login.ts',
            startLine: 1, endLine: 20, hash: 'h3', calls: ['fn:auth:verifyToken'], calledBy: [],
            moduleId: 'api',
        },
        'fn:db:queryUsers': {
            id: 'fn:db:queryUsers', name: 'queryUsers', file: 'src/db/users.ts',
            startLine: 1, endLine: 8, hash: 'h4', calls: [], calledBy: [],
            moduleId: 'db',
        },
        'fn:api:validateUserInput': {
            id: 'fn:api:validateUserInput', name: 'validateUserInput', file: 'src/api/validation.ts',
            startLine: 1, endLine: 12, hash: 'h5', calls: [], calledBy: [],
            moduleId: 'api',
        },
    },
    files: {},
    graph: { nodes: 5, edges: 1, rootHash: 'root' },
}

describe('levenshtein', () => {
    test('identical strings → 0', () => {
        expect(levenshtein('hello', 'hello')).toBe(0)
    })

    test('empty vs non-empty', () => {
        expect(levenshtein('', 'abc')).toBe(3)
        expect(levenshtein('abc', '')).toBe(3)
    })

    test('single char difference', () => {
        expect(levenshtein('cat', 'bat')).toBe(1)
    })

    test('completely different strings', () => {
        expect(levenshtein('abc', 'xyz')).toBe(3)
    })

    test('insertion', () => {
        expect(levenshtein('test', 'tests')).toBe(1)
    })
})

describe('splitCamelCase', () => {
    test('camelCase', () => {
        expect(splitCamelCase('verifyToken')).toEqual(['verify', 'Token'])
    })

    test('PascalCase', () => {
        expect(splitCamelCase('VerifyToken')).toEqual(['Verify', 'Token'])
    })

    test('snake_case', () => {
        expect(splitCamelCase('verify_token')).toEqual(['verify', 'token'])
    })

    test('multiple words', () => {
        expect(splitCamelCase('validateUserInput')).toEqual(['validate', 'User', 'Input'])
    })
})

describe('extractKeywords', () => {
    test('removes stop words', () => {
        const keywords = extractKeywords('fix the auth token bug')
        expect(keywords).toContain('auth')
        expect(keywords).toContain('token')
        expect(keywords).not.toContain('the')
    })

    test('lowercases everything', () => {
        const keywords = extractKeywords('Token Validation')
        expect(keywords).toEqual(['token', 'validation'])
    })
})

describe('scoreFunctions', () => {
    test('exact name match scores highest', () => {
        const results = scoreFunctions('fix verifyToken', mockLock, 5)
        expect(results.length).toBeGreaterThan(0)
        expect(results[0].name).toBe('verifyToken')
    })

    test('keyword match works', () => {
        const results = scoreFunctions('fix the token issue', mockLock, 5)
        const names = results.map(r => r.name)
        // Should find token-related functions
        expect(names).toContain('verifyToken')
        expect(names).toContain('refreshToken')
    })

    test('module match boosts score', () => {
        const results = scoreFunctions('auth problem', mockLock, 5)
        // Auth module functions should appear
        const authFns = results.filter(r => r.moduleId === 'auth')
        expect(authFns.length).toBeGreaterThan(0)
    })

    test('maxResults limits output', () => {
        const results = scoreFunctions('function', mockLock, 2)
        expect(results.length).toBeLessThanOrEqual(2)
    })
})

describe('findFuzzyMatches', () => {
    test('finds similar names', () => {
        const matches = findFuzzyMatches('verifyTokens', mockLock, 3)
        expect(matches).toContain('verifyToken')
    })

    test('finds substring matches', () => {
        const matches = findFuzzyMatches('Token', mockLock, 5)
        expect(matches).toContain('verifyToken')
        expect(matches).toContain('refreshToken')
    })

    test('returns empty for very dissimilar terms', () => {
        const matches = findFuzzyMatches('xyzzyplugh', mockLock, 5)
        expect(matches.length).toBe(0)
    })
})
