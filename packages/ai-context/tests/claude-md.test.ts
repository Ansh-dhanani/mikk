import { describe, test, expect } from 'bun:test'
import { ClaudeMdGenerator } from '../src/claude-md-generator'
import type { MikkContract, MikkLock } from '@getmikk/core'

const mockContract: MikkContract = {
    version: '1.0.0',
    project: {
        name: 'TestProject',
        description: 'A test project for validating claude.md generation',
        language: 'TypeScript',
        entryPoints: ['src/index.ts'],
    },
    declared: {
        modules: [
            { id: 'auth', name: 'Authentication', description: 'Handles user authentication', intent: 'JWT-based auth flow', paths: ['src/auth/**'] },
            { id: 'api', name: 'API', description: 'REST API layer', paths: ['src/api/**'] },
        ],
        constraints: [
            'No direct DB access outside db/',
            'All auth must go through auth.middleware',
        ],
        decisions: [
            { id: 'd1', title: 'Use JWT', reason: 'Stateless auth for scalability', date: '2024-01-01' },
        ],
    },
    overwrite: { mode: 'never', requireConfirmation: true },
}

const mockLock: MikkLock = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    generatorVersion: '1.1.0',
    projectRoot: '/test',
    syncState: { status: 'clean', lastSyncAt: new Date().toISOString(), lockHash: 'a', contractHash: 'b' },
    modules: {
        auth: { id: 'auth', files: ['src/auth/verify.ts'], hash: 'h1', fragmentPath: '.mikk/fragments/auth.json' },
        api: { id: 'api', files: ['src/api/login.ts'], hash: 'h2', fragmentPath: '.mikk/fragments/api.json' },
    },
    functions: {
        'fn:auth:verifyToken': {
            id: 'fn:auth:verifyToken', name: 'verifyToken', file: 'src/auth/verify.ts',
            startLine: 1, endLine: 10, hash: 'h1', calls: [], calledBy: ['fn:api:handleLogin'],
            moduleId: 'auth', purpose: 'Verify JWT tokens',
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
    },
    files: {
        'src/auth/verify.ts': { path: 'src/auth/verify.ts', hash: 'fh1', moduleId: 'auth', lastModified: new Date().toISOString() },
        'src/api/login.ts': { path: 'src/api/login.ts', hash: 'fh2', moduleId: 'api', lastModified: new Date().toISOString() },
    },
    graph: { nodes: 3, edges: 1, rootHash: 'root' },
}

describe('ClaudeMdGenerator', () => {
    test('generates valid markdown', () => {
        const gen = new ClaudeMdGenerator(mockContract, mockLock)
        const md = gen.generate()
        expect(md).toContain('# TestProject')
        expect(md).toContain('Architecture Overview')
    })

    test('includes project description', () => {
        const gen = new ClaudeMdGenerator(mockContract, mockLock)
        const md = gen.generate()
        expect(md).toContain('A test project for validating claude.md generation')
    })

    test('includes module sections', () => {
        const gen = new ClaudeMdGenerator(mockContract, mockLock)
        const md = gen.generate()
        expect(md).toContain('Authentication module')
        expect(md).toContain('API module')
    })

    test('includes function names', () => {
        const gen = new ClaudeMdGenerator(mockContract, mockLock)
        const md = gen.generate()
        expect(md).toContain('verifyToken')
        expect(md).toContain('handleLogin')
    })

    test('includes constraints', () => {
        const gen = new ClaudeMdGenerator(mockContract, mockLock)
        const md = gen.generate()
        expect(md).toContain('No direct DB access outside db/')
    })

    test('includes decisions', () => {
        const gen = new ClaudeMdGenerator(mockContract, mockLock)
        const md = gen.generate()
        expect(md).toContain('Use JWT')
        expect(md).toContain('Stateless auth for scalability')
    })

    test('includes dependency info', () => {
        const gen = new ClaudeMdGenerator(mockContract, mockLock)
        const md = gen.generate()
        // API depends on Auth (handleLogin calls verifyToken)
        expect(md).toContain('Depends on')
    })

    test('respects token budget', () => {
        // Use a very small budget — should truncate
        const gen = new ClaudeMdGenerator(mockContract, mockLock, 200)
        const md = gen.generate()
        // Should have the summary but may be truncated
        expect(md).toContain('TestProject')
    })

    test('includes stats', () => {
        const gen = new ClaudeMdGenerator(mockContract, mockLock)
        const md = gen.generate()
        expect(md).toContain('3 functions')
        expect(md).toContain('2 modules')
    })

    test('shows purpose when available', () => {
        const gen = new ClaudeMdGenerator(mockContract, mockLock)
        const md = gen.generate()
        expect(md).toContain('Verify JWT tokens')
    })

    test('shows calledBy count for key functions', () => {
        const gen = new ClaudeMdGenerator(mockContract, mockLock)
        const md = gen.generate()
        expect(md).toContain('called by 1')
    })
})
