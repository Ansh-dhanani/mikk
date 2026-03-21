import * as fs from 'node:fs/promises'

/**
 * Safe JSON reading utility with descriptive error messages.
 * Centralizes JSON.parse hardening against syntax errors.
 */
export async function readJsonSafe(
    filePath: string,
    fileLabel: string = 'JSON file'
): Promise<any> {
    let content: string
    try {
        content = await fs.readFile(filePath, 'utf-8')
    } catch (e: any) {
        if (e.code === 'ENOENT') {
            throw e // Let callers handle missing files (e.g. ContractNotFoundError)
        }
        throw new Error(`Failed to read ${fileLabel}: ${e.message}`)
    }

    const sanitized = content.replace(/^\uFEFF/, '')
    try {
        return JSON.parse(sanitized)
    } catch (e: any) {
        throw new Error(`Malformed ${fileLabel}: Syntax error - ${e.message}`)
    }
}
