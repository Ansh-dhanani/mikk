import type { MikkContract, MikkLock, MikkLockFunction } from '@ansh_dhanani/core'

/** The structured context object passed to AI models */
export interface AIContext {
    project: {
        name: string
        language: string
        description: string
        moduleCount: number
        functionCount: number
    }
    modules: ContextModule[]
    constraints: string[]
    decisions: { title: string; reason: string }[]
    prompt: string
    /** Diagnostic info — helpful for debugging context quality */
    meta: {
        seedCount: number
        totalFunctionsConsidered: number
        selectedFunctions: number
        estimatedTokens: number
        keywords: string[]
    }
}

export interface ContextModule {
    id: string
    name: string
    description: string
    intent?: string
    functions: ContextFunction[]
    files: string[]
}

export interface ContextFunction {
    name: string
    file: string
    startLine: number
    endLine: number
    calls: string[]
    calledBy: string[]
    purpose?: string
    errorHandling?: string[]
    edgeCases?: string[]
}

/** Query options for context generation */
export interface ContextQuery {
    /** The user's task description — the primary relevance signal */
    task: string
    /** Specific files to anchor the graph traversal from */
    focusFiles?: string[]
    /** Specific modules to include */
    focusModules?: string[]
    /** Max functions to include in output (hard cap) */
    maxFunctions?: number
    /** Max BFS hops from seed nodes (default 4) */
    maxHops?: number
    /** Approximate token budget for function listings (default 6000) */
    tokenBudget?: number
    /** Include call graph arrows (default true) */
    includeCallGraph?: boolean
}

/** Context provider interface for different AI platforms */
export interface ContextProvider {
    name: string
    formatContext(context: AIContext): string
    maxTokens: number
}