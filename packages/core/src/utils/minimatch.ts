/**
 * Simple minimatch-like glob matching utility.
 * Supports ** (any depth directory) and * (wildcard) patterns.
 */
export function minimatch(filePath: string, pattern: string): boolean {
    // Normalize both to forward slashes
    const normalizedPath = filePath.replace(/\\/g, '/')
    const normalizedPattern = pattern.replace(/\\/g, '/')

    // Convert glob pattern to regex
    const regexStr = normalizedPattern
        .replace(/\./g, '\\.')
        .replace(/\*\*\//g, '(?:.+/)?')
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*')

    const regex = new RegExp(`^${regexStr}$`)
    return regex.test(normalizedPath)
}
