import { hashContent } from './file-hasher.js'

/**
 * Compute Merkle tree hash for a module from its file hashes.
 * Sort to ensure order doesn't matter.
 */
export function computeModuleHash(fileHashes: string[]): string {
    const sorted = [...fileHashes].sort()
    return hashContent(sorted.join(''))
}

/**
 * Compute root hash from all module hashes.
 */
export function computeRootHash(moduleHashes: Record<string, string>): string {
    const sorted = Object.entries(moduleHashes)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, hash]) => hash)
    return hashContent(sorted.join(''))
}
