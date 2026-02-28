import { z } from 'zod'

// ─── mikk.json schema ──────────────────────────────────────

export const MikkModuleSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    intent: z.string().optional(),
    owners: z.array(z.string()).optional(),
    paths: z.array(z.string()),
    entryFunctions: z.array(z.string()).optional(),
})

export const MikkDecisionSchema = z.object({
    id: z.string(),
    title: z.string(),
    reason: z.string(),
    date: z.string(),
})

export const MikkOverwriteSchema = z.object({
    mode: z.enum(['never', 'ask', 'explicit']).default('never'),
    requireConfirmation: z.boolean().default(true),
    lastOverwrittenBy: z.string().optional(),
    lastOverwrittenAt: z.string().optional(),
}).default({ mode: 'never', requireConfirmation: true })

export const MikkContractSchema = z.object({
    version: z.string(),
    project: z.object({
        name: z.string(),
        description: z.string(),
        language: z.string(),
        framework: z.string().optional(),
        entryPoints: z.array(z.string()),
    }),
    declared: z.object({
        modules: z.array(MikkModuleSchema),
        constraints: z.array(z.string()).default([]),
        decisions: z.array(MikkDecisionSchema).default([]),
    }),
    overwrite: MikkOverwriteSchema,
})

export type MikkContract = z.infer<typeof MikkContractSchema>
export type MikkModule = z.infer<typeof MikkModuleSchema>
export type MikkDecision = z.infer<typeof MikkDecisionSchema>

// ─── mikk.lock.json schema ─────────────────────────────────

export const MikkLockFunctionSchema = z.object({
    id: z.string(),
    name: z.string(),
    file: z.string(),
    startLine: z.number(),
    endLine: z.number(),
    hash: z.string(),
    calls: z.array(z.string()),
    calledBy: z.array(z.string()),
    moduleId: z.string(),
    purpose: z.string().optional(),
    edgeCasesHandled: z.array(z.string()).optional(),
    errorHandling: z.array(z.object({
        line: z.number(),
        type: z.enum(['try-catch', 'throw']),
        detail: z.string(),
    })).optional(),
    detailedLines: z.array(z.object({
        startLine: z.number(),
        endLine: z.number(),
        blockType: z.string(),
    })).optional()
})

export const MikkLockModuleSchema = z.object({
    id: z.string(),
    files: z.array(z.string()),
    hash: z.string(),
    fragmentPath: z.string(),
})

export const MikkLockFileSchema = z.object({
    path: z.string(),
    hash: z.string(),
    moduleId: z.string(),
    lastModified: z.string(),
})

export const MikkLockSchema = z.object({
    version: z.string(),
    generatedAt: z.string(),
    generatorVersion: z.string(),
    projectRoot: z.string(),
    syncState: z.object({
        status: z.enum(['clean', 'syncing', 'drifted', 'conflict']),
        lastSyncAt: z.string(),
        lockHash: z.string(),
        contractHash: z.string(),
    }),
    modules: z.record(MikkLockModuleSchema),
    functions: z.record(MikkLockFunctionSchema),
    files: z.record(MikkLockFileSchema),
    graph: z.object({
        nodes: z.number(),
        edges: z.number(),
        rootHash: z.string(),
    }),
})

export type MikkLock = z.infer<typeof MikkLockSchema>
export type MikkLockFunction = z.infer<typeof MikkLockFunctionSchema>
export type MikkLockModule = z.infer<typeof MikkLockModuleSchema>
export type MikkLockFile = z.infer<typeof MikkLockFileSchema>
