import { describe, it, expect } from 'bun:test'
import { ContextBuilder } from '../src/context-builder'
import { ClaudeMdGenerator } from '../src/claude-md-generator'
import { getProvider } from '../src/providers'
import type { MikkContract, MikkLock } from '@getmikk/core'

const mockContract: MikkContract = {
    version: '1.0.0',
    project: {
        name: 'TestProject',
        description: 'A test project',
        language: 'TypeScript',
        entryPoints: ['src/index.ts'],
    },
    declared: {
        modules: [
            { id: 'auth', name: 'Authentication', description: 'Handles user auth', paths: ['src/auth/**'] },
            { id: 'api', name: 'API', description: 'REST API', paths: ['src/api/**'] },
        ],
        constraints: ['No direct DB access'],
        decisions: [{ id: 'd1', title: 'Use JWT', reason: 'Scalability', date: '2024-01-01' }],
    },
    overwrite: { mode: 'never', requireConfirmation: false },
}

const mockLock: MikkLock = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    generatorVersion: '1.1.0',
    projectRoot: '/test',
    syncState: { status: 'clean', lastSyncAt: new Date().toISOString(), lockHash: 'a', contractHash: 'b' },
    modules: {
        auth: { id: 'auth', files: ['src/auth/verify.ts'], hash: 'h1', fragmentPath: '.mikk/auth.json' },
        api: { id: 'api', files: ['src/api/login.ts'], hash: 'h2', fragmentPath: '.mikk/api.json' },
    },
    functions: {
        'fn:auth:verifyToken': {
            id: 'fn:auth:verifyToken', name: 'verifyToken', file: 'src/auth/verify.ts',
            startLine: 1, endLine: 10, hash: 'h1', calls: [], calledBy: [],
            moduleId: 'auth', purpose: 'Verify JWT tokens',
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
    graph: { nodes: 2, edges: 1, rootHash: 'root' },
}

describe('ContextBuilder', () => {
    const builder = new ContextBuilder(mockContract, mockLock)

    it('builds context with default settings', () => {
        const ctx = builder.build({ task: 'authentication' })
        expect(ctx).toBeDefined()
        expect(ctx.project).toBeDefined()
        expect(ctx.modules).toBeDefined()
    })

    it('respects token budget', () => {
        const ctx = builder.build({ task: 'auth', tokenBudget: 500 })
        expect(ctx.meta).toBeDefined()
    })

    it('respects maxHops parameter', () => {
        const ctx = builder.build({ task: 'auth', maxHops: 1 })
        expect(ctx).toBeDefined()
    })

    it('strict mode filters loosely relevant results', () => {
        const ctx = builder.build({
            task: 'auth login',
            relevanceMode: 'strict',
            minKeywordMatches: 2,
        })
        expect(ctx.meta).toBeDefined()
    })

    it('balanced mode includes more results', () => {
        const balanced = builder.build({ task: 'auth', relevanceMode: 'balanced' })
        const strict = builder.build({ task: 'auth', relevanceMode: 'strict' })
        expect(balanced.meta.selectedFunctions).toBeGreaterThanOrEqual(strict.meta.selectedFunctions)
    })

    it('includes meta information', () => {
        const ctx = builder.build({ task: 'verify token' })
        expect(ctx.meta.seedCount).toBeDefined()
        expect(ctx.meta.totalFunctionsConsidered).toBeDefined()
        expect(ctx.meta.selectedFunctions).toBeDefined()
        expect(ctx.meta.estimatedTokens).toBeDefined()
    })

    it('handles empty task gracefully', () => {
        const ctx = builder.build({ task: '' })
        expect(ctx).toBeDefined()
    })

    it('handles focusFiles parameter', () => {
        const ctx = builder.build({
            task: 'login',
            focusFiles: ['src/auth/verify.ts'],
        })
        expect(ctx).toBeDefined()
    })

    it('handles focusModules parameter', () => {
        const ctx = builder.build({
            task: 'auth functions',
            focusModules: ['auth'],
        })
        expect(ctx).toBeDefined()
    })

    it('includes constraints in context', () => {
        const ctx = builder.build({ task: 'auth' })
        expect(ctx.constraints).toBeDefined()
        expect(Array.isArray(ctx.constraints)).toBe(true)
    })

    it('includes decisions in context', () => {
        const ctx = builder.build({ task: 'auth' })
        expect(ctx.decisions).toBeDefined()
        expect(Array.isArray(ctx.decisions)).toBe(true)
    })
})

describe('ClaudeMdGenerator', () => {
    it('generates non-empty markdown', () => {
        const gen = new ClaudeMdGenerator(mockContract, mockLock)
        const md = gen.generate()
        expect(md.length).toBeGreaterThan(0)
    })

    it('includes project name', () => {
        const gen = new ClaudeMdGenerator(mockContract, mockLock)
        const md = gen.generate()
        expect(md).toContain('TestProject')
    })

    it('includes modules', () => {
        const gen = new ClaudeMdGenerator(mockContract, mockLock)
        const md = gen.generate()
        expect(md).toContain('auth')
        expect(md).toContain('api')
    })

    it('includes functions', () => {
        const gen = new ClaudeMdGenerator(mockContract, mockLock)
        const md = gen.generate()
        expect(md).toContain('verifyToken')
        expect(md).toContain('handleLogin')
    })

    it('respects token budget', () => {
        const gen = new ClaudeMdGenerator(mockContract, mockLock, 100)
        const md = gen.generate()
        expect(md).toBeDefined()
    })

    it('handles empty lock', () => {
        const emptyLock: MikkLock = {
            ...mockLock,
            functions: {},
            files: {},
            modules: {},
        }
        const gen = new ClaudeMdGenerator(mockContract, emptyLock)
        const md = gen.generate()
        expect(md).toContain('TestProject')
    })

    it('generates valid XML-like structure', () => {
        const gen = new ClaudeMdGenerator(mockContract, mockLock)
        const md = gen.generate()
        expect(md).toContain('<')
        expect(md).toContain('>')
    })
})

describe('AI Context Providers', () => {
    it('getProvider returns generic provider by default', () => {
        const provider = getProvider('generic')
        expect(provider).toBeDefined()
        expect(typeof provider.formatContext).toBe('function')
    })

    it('getProvider returns claude provider', () => {
        const provider = getProvider('claude')
        expect(provider).toBeDefined()
        expect(typeof provider.formatContext).toBe('function')
    })

    it('getProvider returns compact provider', () => {
        const provider = getProvider('compact')
        expect(provider).toBeDefined()
        expect(typeof provider.formatContext).toBe('function')
    })

    it('formats context with each provider', () => {
        const ctx = new ContextBuilder(mockContract, mockLock).build({ task: 'auth' })
        
        const generic = getProvider('generic').formatContext(ctx)
        expect(generic.length).toBeGreaterThan(0)

        const claude = getProvider('claude').formatContext(ctx)
        expect(claude.length).toBeGreaterThan(0)

        const compact = getProvider('compact').formatContext(ctx)
        expect(compact.length).toBeGreaterThan(0)
    })

    it('compact format is shorter than generic', () => {
        const ctx = new ContextBuilder(mockContract, mockLock).build({ task: 'auth' })
        
        const generic = getProvider('generic').formatContext(ctx)
        const compact = getProvider('compact').formatContext(ctx)
        
        expect(compact.length).toBeLessThanOrEqual(generic.length)
    })

    it('claude format includes XML tags', () => {
        const ctx = new ContextBuilder(mockContract, mockLock).build({ task: 'auth' })
        const claude = getProvider('claude').formatContext(ctx)
        expect(claude).toContain('<')
        expect(claude).toContain('>')
    })
})

describe('AIContext Type Structure', () => {
    it('build returns valid AIContext structure', () => {
        const ctx = new ContextBuilder(mockContract, mockLock).build({ task: 'auth' })
        
        expect(ctx.project).toBeDefined()
        expect(ctx.project.name).toBe('TestProject')
        expect(ctx.modules).toBeDefined()
        expect(Array.isArray(ctx.modules)).toBe(true)
        expect(ctx.constraints).toBeDefined()
        expect(ctx.decisions).toBeDefined()
        expect(ctx.prompt).toBeDefined()
        expect(ctx.meta).toBeDefined()
    })

    it('meta includes relevance information', () => {
        const ctx = new ContextBuilder(mockContract, mockLock).build({
            task: 'authentication login',
            relevanceMode: 'strict',
        })
        
        expect(ctx.meta.keywords).toBeDefined()
        expect(Array.isArray(ctx.meta.keywords)).toBe(true)
        expect(ctx.meta.seedCount).toBeGreaterThanOrEqual(0)
    })

    it('module functions include caller information', () => {
        const ctx = new ContextBuilder(mockContract, mockLock).build({ task: 'login' })
        
        for (const mod of ctx.modules) {
            for (const fn of mod.functions) {
                expect(fn.name).toBeDefined()
                expect(fn.file).toBeDefined()
                expect(fn.calls).toBeDefined()
                expect(fn.calledBy).toBeDefined()
            }
        }
    })
})

describe('Context Query Options', () => {
    const builder = new ContextBuilder(mockContract, mockLock)

    it('includeCallGraph option works', () => {
        const withGraph = builder.build({ task: 'auth', includeCallGraph: true })
        const withoutGraph = builder.build({ task: 'auth', includeCallGraph: false })
        expect(withGraph).toBeDefined()
        expect(withoutGraph).toBeDefined()
    })

    it('includeBodies option works', () => {
        const withBodies = builder.build({ task: 'auth', includeBodies: true })
        const withoutBodies = builder.build({ task: 'auth', includeBodies: false })
        expect(withBodies).toBeDefined()
        expect(withoutBodies).toBeDefined()
    })

    it('maxFunctions limits results', () => {
        const limited = builder.build({ task: 'auth', maxFunctions: 1 })
        expect(limited.meta.selectedFunctions).toBeLessThanOrEqual(1)
    })

    it('requiredKeywords filters results', () => {
        const ctx = builder.build({
            task: 'authentication',
            requiredKeywords: ['verify', 'token'],
        })
        expect(ctx).toBeDefined()
    })

    it('requireAllKeywords option works', () => {
        const ctx = builder.build({
            task: 'auth',
            requiredKeywords: ['verify', 'token'],
            requireAllKeywords: true,
        })
        expect(ctx).toBeDefined()
    })

    it('exactOnly option works', () => {
        const ctx = builder.build({
            task: 'xyz_nonexistent_12345',
            exactOnly: true,
            failFast: true,
        })
        expect(ctx).toBeDefined()
    })

    it('failFast returns empty on no match', () => {
        const ctx = builder.build({
            task: 'xyz_nonexistent',
            failFast: true,
        })
        expect(ctx).toBeDefined()
    })
})
