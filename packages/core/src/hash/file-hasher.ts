import { createHash } from 'node:crypto'
import * as fs from 'node:fs/promises'

/**
 * Compute SHA-256 hash of a string.
 */
export function hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex')
}

/**
 * Compute SHA-256 hash of a file on disk.
 */
export async function hashFile(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath, 'utf-8')
    return hashContent(content)
}

/**
 * Hash a specific function body by extracting lines from file content.
 */
export function hashFunctionBody(
    fileContent: string,
    startLine: number,
    endLine: number
): string {
    const lines = fileContent.split('\n')
    const body = lines.slice(startLine - 1, endLine).join('\n')
    return hashContent(body)
}
