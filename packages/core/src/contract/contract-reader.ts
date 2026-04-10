/* eslint-disable @typescript-eslint/no-explicit-any */
import { MikkContractSchema, type MikkContract } from './schema.js'
import { ContractNotFoundError } from '../utils/errors.js'
import { readJsonSafe } from '../utils/json.js'

/**
 * ContractReader -- reads and validates mikk.json from disk.
 */
export class ContractReader {
    /** Read and validate mikk.json */
    async read(contractPath: string): Promise<MikkContract> {
        let json: any
        try {
            json = await readJsonSafe(contractPath, 'mikk.json')
        } catch (e: any) {
            if (e.code === 'ENOENT') {
                throw new ContractNotFoundError(contractPath)
            }
            throw e
        }

        const result = MikkContractSchema.safeParse(json)
        if (!result.success) {
            const errors = result.error.issues.map(i => `  ${i.path.join('.')}: ${i.message}`).join('\n')
            throw new Error(`Invalid mikk.json structure:\n${errors}`)
        }
        return result.data
    }
}
