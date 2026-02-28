import * as fs from 'node:fs/promises'
import { MikkContractSchema, type MikkContract } from './schema.js'
import { ContractNotFoundError } from '../utils/errors.js'

/**
 * ContractReader — reads and validates mikk.json from disk.
 */
export class ContractReader {
    /** Read and validate mikk.json */
    async read(contractPath: string): Promise<MikkContract> {
        let content: string
        try {
            content = await fs.readFile(contractPath, 'utf-8')
        } catch {
            throw new ContractNotFoundError(contractPath)
        }

        const json = JSON.parse(content)
        const result = MikkContractSchema.safeParse(json)

        if (!result.success) {
            const errors = result.error.issues.map(i => `  ${i.path.join('.')}: ${i.message}`).join('\n')
            throw new Error(`Invalid mikk.json:\n${errors}`)
        }

        return result.data
    }
}
