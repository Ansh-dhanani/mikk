import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { z } from 'zod'

const MikkRcSchema = z.object({
    contextPatterns: z.record(z.string(), z.array(z.string())).optional(),
    domainKeywords: z.record(z.string(), z.array(z.string())).optional(),
    ignorePatterns: z.array(z.string()).optional(),
    languages: z.array(z.string()).optional(),
    parserOptions: z.record(z.string(), z.any()).optional(),
})

export type MikkRc = z.infer<typeof MikkRcSchema>

let cachedConfig: MikkRc | null = null

export async function loadMikkRc(projectRoot: string): Promise<MikkRc> {
    if (cachedConfig) return cachedConfig

    const rcPath = path.join(projectRoot, '.mikkrc')
    const jsonPath = path.join(projectRoot, 'mikk.json')

    try {
        let config: Partial<MikkRc> = {}
        
        // Try JSON first
        if (await fileExists(jsonPath)) {
            const raw = await fs.readFile(jsonPath, 'utf-8')
            const parsed = JSON.parse(raw)
            config = parsed.mikk || parsed
        }
        
        // Merge with .mikkrc if exists
        if (await fileExists(rcPath)) {
            const raw = await fs.readFile(rcPath, 'utf-8')
            const rcData = JSON.parse(raw)
            config = { ...config, ...rcData }
        }

        cachedConfig = MikkRcSchema.parse(config)
        return cachedConfig!
    } catch {
        cachedConfig = {}
        return cachedConfig!
    }
}

async function fileExists(p: string): Promise<boolean> {
    try {
        await fs.access(p)
        return true
    } catch {
        return false
    }
}

export function clearMikkRcCache(): void {
    cachedConfig = null
}