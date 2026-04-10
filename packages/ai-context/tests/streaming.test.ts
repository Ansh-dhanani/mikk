import { describe, test, expect, beforeEach } from 'bun:test'
import { ContextStreamer, BatchContextFetcher } from '../src/streaming'
import type { AIContext, ContextQuery } from '../src/types'

const createMockContext = (): AIContext => ({
    project: {
        name: 'test-project',
        language: 'typescript',
        description: 'Test project',
        moduleCount: 2,
        functionCount: 4,
    },
    modules: [
        {
            id: 'auth',
            name: 'Authentication',
            description: 'Handles authentication',
            functions: [
                {
                    name: 'login',
                    file: 'src/auth.ts',
                    startLine: 10,
                    endLine: 30,
                    calls: ['verifyPassword', 'createSession'],
                    calledBy: ['handleRequest'],
                    params: [{ name: 'email', type: 'string' }],
                    returnType: 'User',
                    isAsync: true,
                    isExported: true,
                },
                {
                    name: 'logout',
                    file: 'src/auth.ts',
                    startLine: 35,
                    endLine: 45,
                    calls: [],
                    calledBy: ['handleRequest'],
                    params: [],
                    returnType: 'void',
                    isAsync: false,
                    isExported: true,
                },
            ],
            files: ['src/auth.ts'],
        },
        {
            id: 'api',
            name: 'API',
            description: 'API handlers',
            functions: [
                {
                    name: 'handleRequest',
                    file: 'src/api.ts',
                    startLine: 1,
                    endLine: 50,
                    calls: ['login'],
                    calledBy: [],
                    params: [{ name: 'req', type: 'Request' }],
                    returnType: 'Response',
                    isAsync: true,
                    isExported: false,
                },
            ],
            files: ['src/api.ts'],
        },
    ],
    constraints: [
        'All auth functions must be tested',
        'No direct database access from API handlers',
    ],
    decisions: [
        { title: 'Use JWT for auth', reason: 'Stateless and scalable' },
    ],
    routes: [
        { method: 'POST', path: '/login', handler: 'login', middlewares: [], file: 'src/auth.ts', line: 10 },
        { method: 'POST', path: '/logout', handler: 'logout', middlewares: [], file: 'src/auth.ts', line: 35 },
    ],
    prompt: 'Test context',
    meta: {
        seedCount: 2,
        totalFunctionsConsidered: 4,
        selectedFunctions: 3,
        estimatedTokens: 500,
        keywords: ['auth', 'login', 'api'],
    },
})

describe('ContextStreamer', () => {
    let streamer: ContextStreamer

    beforeEach(() => {
        streamer = new ContextStreamer()
    })

    describe('streamContext', () => {
        test('streams all module headers', async () => {
            const context = createMockContext()
            const chunks: any[] = []
            
            for await (const chunk of streamer.streamContext(context)) {
                chunks.push(chunk)
            }
            
            const moduleChunks = chunks.filter(c => c.type === 'module' && c.data.totalModules)
            expect(moduleChunks.length).toBe(1)
        })

        test('streams functions by default', async () => {
            const context = createMockContext()
            const chunks: any[] = []
            
            for await (const chunk of streamer.streamContext(context)) {
                chunks.push(chunk)
            }
            
            const functionChunks = chunks.filter(c => c.type === 'function')
            expect(functionChunks.length).toBeGreaterThan(0)
        })

        test('streams constraints by default', async () => {
            const context = createMockContext()
            const chunks: any[] = []
            
            for await (const chunk of streamer.streamContext(context)) {
                chunks.push(chunk)
            }
            
            const constraintChunks = chunks.filter(c => c.type === 'constraint')
            expect(constraintChunks.length).toBe(1)
            expect(constraintChunks[0].data.constraints.length).toBe(2)
        })

        test('streams decisions by default', async () => {
            const context = createMockContext()
            const chunks: any[] = []
            
            for await (const chunk of streamer.streamContext(context)) {
                chunks.push(chunk)
            }
            
            const decisionChunks = chunks.filter(c => c.type === 'decision')
            expect(decisionChunks.length).toBe(1)
        })

        test('streams routes by default', async () => {
            const context = createMockContext()
            const chunks: any[] = []
            
            for await (const chunk of streamer.streamContext(context)) {
                chunks.push(chunk)
            }
            
            const routeChunks = chunks.filter(c => c.type === 'route')
            expect(routeChunks.length).toBe(1)
        })

        test('emits complete chunk at end', async () => {
            const context = createMockContext()
            const chunks: any[] = []
            
            for await (const chunk of streamer.streamContext(context)) {
                chunks.push(chunk)
            }
            
            const completeChunk = chunks.find(c => c.type === 'complete')
            expect(completeChunk).toBeDefined()
            expect(completeChunk.data.totalTokens).toBeGreaterThan(0)
        })

        test('respects includeModules option', async () => {
            const context = createMockContext()
            const chunks: any[] = []
            
            for await (const chunk of streamer.streamContext(context, { includeModules: false })) {
                chunks.push(chunk)
            }
            
            const moduleChunks = chunks.filter(c => c.type === 'module' && c.data.name)
            expect(moduleChunks.length).toBe(0)
        })

        test('respects includeFunctions option', async () => {
            const context = createMockContext()
            const chunks: any[] = []
            
            for await (const chunk of streamer.streamContext(context, { includeFunctions: false })) {
                chunks.push(chunk)
            }
            
            const functionChunks = chunks.filter(c => c.type === 'function')
            expect(functionChunks.length).toBe(0)
        })

        test('filters by moduleIds when specified', async () => {
            const context = createMockContext()
            const chunks: any[] = []
            
            for await (const chunk of streamer.streamContext(context, { moduleIds: ['auth'] })) {
                chunks.push(chunk)
            }
            
            const functionChunks = chunks.filter(c => c.type === 'function')
            expect(functionChunks.length).toBeGreaterThan(0)
            
            const moduleChunks = chunks.filter(c => c.type === 'module' && c.data.id)
            const authModules = moduleChunks.filter(c => c.data.id === 'auth')
            const apiModules = moduleChunks.filter(c => c.data.id === 'api')
            
            expect(authModules.length).toBeGreaterThan(0)
            expect(apiModules.length).toBe(0)
        })

        test('estimates tokens correctly', async () => {
            const context = createMockContext()
            let totalTokens = 0
            
            for await (const chunk of streamer.streamContext(context)) {
                if (chunk.tokens) {
                    totalTokens += chunk.tokens
                }
            }
            
            expect(totalTokens).toBeGreaterThan(0)
        })
    })

    describe('toReadableStream', () => {
        test('returns a ReadableStream', async () => {
            const context = createMockContext()
            const stream = streamer.toReadableStream(context)
            
            expect(stream).toBeInstanceOf(ReadableStream)
        })

        test('yields encoded chunks', async () => {
            const context = createMockContext()
            const stream = streamer.toReadableStream(context)
            const reader = stream.getReader()
            const result = await reader.read()
            
            expect(result.value).toBeInstanceOf(Uint8Array)
        })
    })
})

describe('BatchContextFetcher', () => {
    let fetcher: BatchContextFetcher
    let mockBuilder: any

    beforeEach(() => {
        mockBuilder = {
            build: async (query: ContextQuery) => ({
                project: { name: 'test', language: 'ts', description: '', moduleCount: 1, functionCount: 1 },
                modules: [{ 
                    id: query.task.split(':')[1] || 'default', 
                    name: 'test', 
                    description: '', 
                    functions: [
                        { name: 'login', file: 'src/auth.ts', startLine: 1, endLine: 10, calls: [], calledBy: [] },
                        { name: 'logout', file: 'src/auth.ts', startLine: 11, endLine: 20, calls: [], calledBy: [] },
                    ], 
                    files: [] 
                }],
                constraints: [],
                decisions: [],
                prompt: '',
                meta: { seedCount: 0, totalFunctionsConsidered: 0, selectedFunctions: 0, estimatedTokens: 0, keywords: [] },
            }),
        }
        fetcher = new BatchContextFetcher(mockBuilder)
    })

    describe('fetchBatch', () => {
        test('fetches multiple queries in parallel', async () => {
            const queries: ContextQuery[] = [
                { task: 'query:1' },
                { task: 'query:2' },
                { task: 'query:3' },
            ]
            
            const result = await fetcher.fetchBatch(queries)
            
            expect(result.contexts?.length).toBe(3)
            expect(result.errors?.length).toBe(0)
        })

        test('handles errors gracefully', async () => {
            mockBuilder.build = async () => {
                throw new Error('Build failed')
            }
            
            const queries: ContextQuery[] = [{ task: 'fail' }]
            
            const result = await fetcher.fetchBatch(queries)
            
            expect(result.contexts?.length).toBe(0)
            expect(result.errors?.length).toBe(1)
        })

        test('handles mixed success and failure', async () => {
            let callCount = 0
            mockBuilder.build = async (q: ContextQuery) => {
                callCount++
                if (callCount === 2) throw new Error('Failed')
                return {
                    project: { name: 'test', language: 'ts', description: '', moduleCount: 1, functionCount: 1 },
                    modules: [],
                    constraints: [],
                    decisions: [],
                    prompt: '',
                    meta: { seedCount: 0, totalFunctionsConsidered: 0, selectedFunctions: 0, estimatedTokens: 0, keywords: [] },
                }
            }
            
            const queries: ContextQuery[] = [
                { task: 'success:1' },
                { task: 'fail:2' },
                { task: 'success:3' },
            ]
            
            const result = await fetcher.fetchBatch(queries)
            
            expect(result.contexts?.length).toBe(2)
            expect(result.errors?.length).toBe(1)
        })
    })

    describe('fetchModules', () => {
        test('returns empty array for empty input', async () => {
            const modules = await fetcher.fetchModules([])
            
            expect(modules).toEqual([])
        })
    })

    describe('fetchFunctions', () => {
        test('returns empty array for empty input', async () => {
            const functions = await fetcher.fetchFunctions([])
            
            expect(functions).toEqual([])
        })
    })
})

describe('streaming edge cases', () => {
    let streamer: ContextStreamer

    beforeEach(() => {
        streamer = new ContextStreamer()
    })

    test('handles empty modules array', async () => {
        const emptyContext: AIContext = {
            ...createMockContext(),
            modules: [],
        }
        
        const chunks: any[] = []
        for await (const chunk of streamer.streamContext(emptyContext)) {
            chunks.push(chunk)
        }
        
        const completeChunk = chunks.find(c => c.type === 'complete')
        expect(completeChunk).toBeDefined()
    })

    test('handles module with no functions', async () => {
        const context = createMockContext()
        context.modules.push({
            id: 'empty',
            name: 'Empty Module',
            description: 'Has no functions',
            functions: [],
            files: [],
        })
        
        const chunks: any[] = []
        for await (const chunk of streamer.streamContext(context)) {
            chunks.push(chunk)
        }
        
        const functionChunks = chunks.filter(c => c.type === 'function')
        expect(functionChunks.length).toBeGreaterThan(0)
    })

    test('handles empty constraints array', async () => {
        const context = createMockContext()
        context.constraints = []
        
        const chunks: any[] = []
        for await (const chunk of streamer.streamContext(context)) {
            chunks.push(chunk)
        }
        
        const completeChunk = chunks.find(c => c.type === 'complete')
        expect(completeChunk).toBeDefined()
    })

    test('handles empty decisions array', async () => {
        const context = createMockContext()
        context.decisions = []
        
        const chunks: any[] = []
        for await (const chunk of streamer.streamContext(context)) {
            chunks.push(chunk)
        }
        
        const completeChunk = chunks.find(c => c.type === 'complete')
        expect(completeChunk).toBeDefined()
    })

    test('handles empty routes array', async () => {
        const context = createMockContext()
        context.routes = []
        
        const chunks: any[] = []
        for await (const chunk of streamer.streamContext(context)) {
            chunks.push(chunk)
        }
        
        const completeChunk = chunks.find(c => c.type === 'complete')
        expect(completeChunk).toBeDefined()
    })

    test('handles function with no params', async () => {
        const context = createMockContext()
        context.modules[0].functions[1].params = []
        
        const chunks: any[] = []
        for await (const chunk of streamer.streamContext(context)) {
            chunks.push(chunk)
        }
        
        const functionChunks = chunks.filter(c => c.type === 'function')
        expect(functionChunks.length).toBeGreaterThan(0)
    })

    test('handles function with no calls', async () => {
        const context = createMockContext()
        context.modules[0].functions[0].calls = []
        
        const chunks: any[] = []
        for await (const chunk of streamer.streamContext(context)) {
            chunks.push(chunk)
        }
        
        const functionChunks = chunks.filter(c => c.type === 'function')
        expect(functionChunks.length).toBeGreaterThan(0)
    })
})
