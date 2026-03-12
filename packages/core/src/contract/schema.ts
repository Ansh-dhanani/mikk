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
    params: z.array(z.object({
        name: z.string(),
        type: z.string(),
        optional: z.boolean().optional(),
    })).optional(),
    returnType: z.string().optional(),
    isAsync: z.boolean().optional(),
    isExported: z.boolean().optional(),
    purpose: z.string().optional(),
    edgeCasesHandled: z.array(z.string()).optional(),
    errorHandling: z.array(z.object({
        line: z.number(),
        type: z.enum(['try-catch', 'throw']),
        detail: z.string(),
    })).optional(),
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
    imports: z.array(z.string()).optional(),
})

export const MikkLockClassSchema = z.object({
    id: z.string(),
    name: z.string(),
    file: z.string(),
    startLine: z.number(),
    endLine: z.number(),
    moduleId: z.string(),
    isExported: z.boolean(),
    purpose: z.string().optional(),
    edgeCasesHandled: z.array(z.string()).optional(),
    errorHandling: z.array(z.object({
        line: z.number(),
        type: z.enum(['try-catch', 'throw']),
        detail: z.string(),
    })).optional(),
})

export const MikkLockGenericSchema = z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    file: z.string(),
    startLine: z.number(),
    endLine: z.number(),
    moduleId: z.string(),
    isExported: z.boolean(),
    purpose: z.string().optional(),
    /** Other files that contain an identical generic (same name + type). Dedup. */
    alsoIn: z.array(z.string()).optional(),
})

export const MikkLockContextFileSchema = z.object({
    path: z.string(),
    content: z.string().optional(),
    type: z.enum(['schema', 'model', 'types', 'routes', 'config', 'api-spec', 'migration', 'docker']),
    size: z.number().optional(),
})

export const MikkLockRouteSchema = z.object({
    method: z.string(),
    path: z.string(),
    handler: z.string(),
    middlewares: z.array(z.string()),
    file: z.string(),
    line: z.number(),
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
    classes: z.record(MikkLockClassSchema).optional(),
    generics: z.record(MikkLockGenericSchema).optional(),
    files: z.record(MikkLockFileSchema),
    contextFiles: z.array(MikkLockContextFileSchema).optional(),
    routes: z.array(MikkLockRouteSchema).optional(),
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
export type MikkLockClass = z.infer<typeof MikkLockClassSchema>
export type MikkLockGeneric = z.infer<typeof MikkLockGenericSchema>
export type MikkLockContextFile = z.infer<typeof MikkLockContextFileSchema>
export type MikkLockRoute = z.infer<typeof MikkLockRouteSchema>
