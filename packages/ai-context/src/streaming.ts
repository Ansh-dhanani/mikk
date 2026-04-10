import type { AIContext, ContextModule, ContextFunction, ContextQuery } from './types.js'

export interface StreamChunk {
    type: 'module' | 'function' | 'constraint' | 'decision' | 'route' | 'context-file' | 'complete' | 'error'
    data: any
    tokens?: number
}

export interface StreamOptions {
    maxTokensPerChunk?: number
    includeModules?: boolean
    includeFunctions?: boolean
    includeConstraints?: boolean
    includeDecisions?: boolean
    includeRoutes?: boolean
    includeContextFiles?: boolean
    moduleIds?: string[]
}

export class ContextStreamer {
    private encoder = new TextEncoder()

    async *streamContext(
        context: AIContext,
        options: StreamOptions = {}
    ): AsyncGenerator<StreamChunk> {
        const {
            includeModules = true,
            includeFunctions = true,
            includeConstraints = true,
            includeDecisions = true,
            includeRoutes = true,
            includeContextFiles = true,
            moduleIds,
        } = options

        let totalTokens = 0

        yield {
            type: 'module',
            data: { totalModules: context.modules.length },
            tokens: 0,
        }

        if (includeContextFiles && context.contextFiles?.length) {
            for (const cf of context.contextFiles) {
                const chunk = `=== ${cf.path} ===\n${cf.content}\n`
                const tokens = this.estimateTokens(chunk)
                totalTokens += tokens

                yield {
                    type: 'context-file',
                    data: { path: cf.path, content: cf.content },
                    tokens,
                }
            }
        }

        if (includeRoutes && context.routes?.length) {
            const routesText = context.routes
                .map(r => `${r.method} ${r.path} -> ${r.handler}`)
                .join('\n')
            const tokens = this.estimateTokens(routesText)

            yield {
                type: 'route',
                data: { routes: context.routes },
                tokens,
            }
            totalTokens += tokens
        }

        const modulesToStream = moduleIds
            ? context.modules.filter(m => moduleIds.includes(m.id))
            : context.modules

        for (const mod of modulesToStream) {
            if (includeModules) {
                const modText = `--- Module: ${mod.name} ---\n${mod.description}\n`
                const tokens = this.estimateTokens(modText)

                yield {
                    type: 'module',
                    data: { id: mod.id, name: mod.name, description: mod.description },
                    tokens,
                }
                totalTokens += tokens
            }

            if (includeFunctions) {
                for (const fn of mod.functions) {
                    const fnChunk = this.formatFunction(fn)
                    const tokens = this.estimateTokens(fnChunk)

                    yield {
                        type: 'function',
                        data: fn,
                        tokens,
                    }
                    totalTokens += tokens
                }
            }
        }

        if (includeConstraints && context.constraints.length > 0) {
            const constraintsText = context.constraints
                .map(c => `• ${c}`)
                .join('\n')
            const tokens = this.estimateTokens(constraintsText)

            yield {
                type: 'constraint',
                data: { constraints: context.constraints },
                tokens,
            }
            totalTokens += tokens
        }

        if (includeDecisions && context.decisions.length > 0) {
            const decisionsText = context.decisions
                .map(d => `• ${d.title}: ${d.reason}`)
                .join('\n')
            const tokens = this.estimateTokens(decisionsText)

            yield {
                type: 'decision',
                data: { decisions: context.decisions },
                tokens,
            }
            totalTokens += tokens
        }

        yield {
            type: 'complete',
            data: { totalTokens },
            tokens: 0,
        }
    }

    private formatFunction(fn: ContextFunction): string {
        const params = fn.params?.map(p => `${p.name}: ${p.type}`).join(', ') || ''
        const retStr = fn.returnType ? `: ${fn.returnType}` : ''
        const sig = `${fn.isAsync ? 'async ' : ''}${fn.name}(${params})${retStr}`

        let text = `${sig}\n  ${fn.file}:${fn.startLine}-${fn.endLine}\n`
        if (fn.purpose) text += `  purpose: ${fn.purpose}\n`
        if (fn.calls?.length) text += `  calls: [${fn.calls.join(', ')}]\n`
        if (fn.body) text += `  ${fn.body}\n`

        return text
    }

    private estimateTokens(text: string): number {
        return Math.ceil(text.length / 4)
    }

    toReadableStream(context: AIContext, options: StreamOptions = {}): ReadableStream<Uint8Array> {
        const streamContext = this.streamContext.bind(this)
        const chunkToText = this.chunkToText.bind(this)
        return new ReadableStream({
            async *start() {},
            async pull(controller) {
                for await (const chunk of streamContext(context, options)) {
                    const text = chunkToText(chunk)
                    controller.enqueue(new TextEncoder().encode(text))
                }
                controller.close()
            },
        })
    }

    private chunkToText(chunk: StreamChunk): string {
        switch (chunk.type) {
            case 'module':
                return `=== ${chunk.data.name} ===\n${chunk.data.description || ''}\n`
            case 'function':
                return this.formatFunction(chunk.data) + '\n'
            case 'constraint':
                return `=== CONSTRAINTS ===\n${chunk.data.constraints.map((c: string) => `• ${c}`).join('\n')}\n\n`
            case 'decision':
                return `=== DECISIONS ===\n${chunk.data.decisions.map((d: any) => `• ${d.title}: ${d.reason}`).join('\n')}\n\n`
            case 'route':
                return `=== ROUTES ===\n${chunk.data.routes.map((r: any) => `${r.method} ${r.path}`).join('\n')}\n\n`
            case 'context-file':
                return `=== ${chunk.data.path} ===\n${chunk.data.content}\n\n`
            case 'complete':
                return `\n=== END ===\nTotal tokens: ${chunk.data.totalTokens}\n`
            default:
                return ''
        }
    }
}

export interface BatchRequest {
    moduleIds?: string[]
    functionIds?: string[]
    queries?: ContextQuery[]
}

export interface BatchResponse {
    modules?: ContextModule[]
    functions?: ContextFunction[]
    contexts?: AIContext[]
    errors?: Array<{ index: number; error: string }>
}

export class BatchContextFetcher {
    constructor(private contextBuilder: any) {}

    async fetchBatch(requests: ContextQuery[]): Promise<BatchResponse> {
        const contexts: Array<AIContext | null> = []
        const errors: Array<{ index: number; error: string }> = []

        const results = await Promise.allSettled(
            requests.map((query, index) =>
                Promise.resolve(this.contextBuilder.build(query))
                    .then(ctx => ({ index, ctx }))
                    .catch((err: Error) => ({ index, error: err.message }))
            )
        )

        for (const result of results) {
            if (result.status === 'fulfilled') {
                const value = result.value as { index: number; ctx?: AIContext; error?: string }
                if (value.error) {
                    errors.push({ index: value.index, error: value.error })
                    contexts.push(null)
                } else if (value.ctx) {
                    contexts.push(value.ctx)
                }
            } else if (result.status === 'rejected') {
                const index = (result as any).index ?? contexts.length
                errors.push({ index, error: String(result.reason()) })
                contexts.push(null)
            }
        }

        return { contexts: contexts.filter(Boolean) as AIContext[], errors }
    }

    async fetchModules(moduleIds: string[]): Promise<ContextModule[]> {
        const results = await Promise.all(
            moduleIds.map(async (moduleId) => {
                const query: ContextQuery = {
                    task: `module ${moduleId}`,
                    focusModules: [moduleId],
                    maxFunctions: 50,
                }
                const context = await Promise.resolve(this.contextBuilder.build(query))
                return context.modules.find((m: ContextModule) => m.id === moduleId)
            })
        )

        return results.filter(Boolean) as ContextModule[]
    }

    async fetchFunctions(functionIds: string[]): Promise<ContextFunction[]> {
        const functions: ContextFunction[] = []

        for (const fnId of functionIds) {
            const query: ContextQuery = {
                task: `function ${fnId}`,
                maxFunctions: 1,
                requireAllKeywords: true,
            }
            const context = await Promise.resolve(this.contextBuilder.build(query))

            for (const mod of context.modules) {
                const fn = mod.functions.find((f: ContextFunction) => f.file.includes(fnId) || f.name === fnId)
                if (fn) {
                    functions.push(fn)
                    break
                }
            }
        }

        return functions
    }
}

export const contextStreamer = new ContextStreamer()
