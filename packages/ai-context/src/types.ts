import type { MikkContract, MikkLock, MikkLockFunction } from '@mikk/core'

/** The structured context object passed to AI models */
export interface AIContext {
    /** Project-level information */
    project: {
        name: string
        language: string
        description: string
        moduleCount: number
        functionCount: number
    }
    /** Relevant modules with their functions */
    modules: ContextModule[]
    /** Constraints the AI must respect */
    constraints: string[]
    /** Architectural decisions for context */
    decisions: { title: string; reason: string }[]
    /** Generated prompt section */
    prompt: string
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
}

/** Query options for context generation */
export interface ContextQuery {
    /** The user's task description */
    task: string
    /** Specific files to focus on */
    focusFiles?: string[]
    /** Specific modules to include */
    focusModules?: string[]
    /** Maximum number of functions to include */
    maxFunctions?: number
    /** Include call graph details */
    includeCallGraph?: boolean
}

/** Context provider interface for different AI platforms */
export interface ContextProvider {
    name: string
    formatContext(context: AIContext): string
    maxTokens: number
}
