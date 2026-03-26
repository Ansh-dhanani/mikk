import { describe, expect, test } from 'bun:test'
import { ContextBuilder } from '../src/context-builder.js'
import type { ContextQuery } from '../src/types.js'

function makeFixture() {
    const contract = {
        project: {
            name: 'mikk',
            language: 'typescript',
            description: 'fixture',
        },
        declared: {
            modules: [
                { id: 'core-parser', name: 'Core Parser', description: '', paths: [], entryFunctions: [] },
                { id: 'ui', name: 'UI', description: '', paths: [], entryFunctions: [] },
            ],
            constraints: [],
            decisions: [],
        },
    } as any

    const fnResolver = {
        id: 'fn:parser:resolver',
        name: 'resolveImports',
        file: 'packages/core/src/parser/ts-resolver.ts',
        moduleId: 'core-parser',
        startLine: 1,
        endLine: 10,
        params: [],
        returnType: 'void',
        isAsync: false,
        isExported: true,
        purpose: 'resolve ts imports',
        calls: ['fn:parser:helper'],
        calledBy: [],
        edgeCasesHandled: [],
        errorHandling: [],
    }

    const fnHelper = {
        id: 'fn:parser:helper',
        name: 'normalizeTsPath',
        file: 'packages/core/src/parser/path.ts',
        moduleId: 'core-parser',
        startLine: 1,
        endLine: 8,
        params: [],
        returnType: 'string',
        isAsync: false,
        isExported: false,
        purpose: 'normalize ts path',
        calls: [],
        calledBy: ['fn:parser:resolver'],
        edgeCasesHandled: [],
        errorHandling: [],
    }

    const fnUnrelated = {
        id: 'fn:ui:render',
        name: 'renderHeader',
        file: 'apps/web/components/header.tsx',
        moduleId: 'ui',
        startLine: 1,
        endLine: 8,
        params: [],
        returnType: 'void',
        isAsync: false,
        isExported: true,
        purpose: 'render ui header',
        calls: [],
        calledBy: [],
        edgeCasesHandled: [],
        errorHandling: [],
    }

    const lock = {
        functions: {
            [fnResolver.id]: fnResolver,
            [fnHelper.id]: fnHelper,
            [fnUnrelated.id]: fnUnrelated,
        },
        files: {
            [fnResolver.file]: { path: fnResolver.file, moduleId: fnResolver.moduleId, imports: [] },
            [fnHelper.file]: { path: fnHelper.file, moduleId: fnHelper.moduleId, imports: [] },
            [fnUnrelated.file]: { path: fnUnrelated.file, moduleId: fnUnrelated.moduleId, imports: [] },
        },
        routes: [],
        contextFiles: [],
    } as any

    return { contract, lock }
}

function namesFrom(query: ContextQuery): string[] {
    const { contract, lock } = makeFixture()
    const builder = new ContextBuilder(contract, lock)
    const ctx = builder.build(query)
    return ctx.modules.flatMap(m => m.functions.map(f => f.name))
}

describe('ContextBuilder strict relevance mode', () => {
    test('strict mode filters unrelated entry-point noise', () => {
        const balanced = namesFrom({
            task: 'fix ts resolver imports',
            tokenBudget: 1200,
            includeBodies: false,
            includeCallGraph: false,
            relevanceMode: 'balanced',
        })
        const strict = namesFrom({
            task: 'fix ts resolver imports',
            tokenBudget: 1200,
            includeBodies: false,
            includeCallGraph: false,
            relevanceMode: 'strict',
            minKeywordMatches: 1,
        })

        expect(balanced).toContain('renderHeader')
        expect(strict).not.toContain('renderHeader')
        expect(strict).toContain('resolveImports')
    })

    test('requiredKeywords enforces exact focus in strict mode', () => {
        const strict = namesFrom({
            task: 'resolver imports',
            tokenBudget: 1200,
            includeBodies: false,
            includeCallGraph: false,
            relevanceMode: 'strict',
            requiredKeywords: ['ts'],
            minKeywordMatches: 1,
        })

        expect(strict).toContain('resolveImports')
        expect(strict).toContain('normalizeTsPath')
        expect(strict).not.toContain('renderHeader')
    })

    test('failFast returns empty context when exact match is impossible', () => {
        const { contract, lock } = makeFixture()
        const builder = new ContextBuilder(contract, lock)
        const ctx = builder.build({
            task: 'resolver imports',
            tokenBudget: 1200,
            includeBodies: false,
            includeCallGraph: false,
            relevanceMode: 'strict',
            requiredKeywords: ['nonexistent'],
            exactOnly: true,
            failFast: true,
        })

        expect(ctx.modules.length).toBe(0)
        expect(ctx.meta.selectedFunctions).toBe(0)
        expect((ctx.meta.reasons?.length ?? 0) > 0).toBe(true)
        expect((ctx.meta.suggestions?.length ?? 0) > 0).toBe(true)
    })
})
