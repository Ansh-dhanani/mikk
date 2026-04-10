export function normalizeSlashes(filePath: string): string {
    return filePath.replace(/\\/g, '/')
}

export function normalizePath(filePath: string, lowercase: boolean = true): string {
    const normalized = normalizeSlashes(filePath)
    return lowercase ? normalized.toLowerCase() : normalized
}

export function normalizePathQuiet(filePath: string): string {
    return normalizeSlashes(filePath).toLowerCase()
}

export function getPathKey(filePath: string): string {
    return normalizePath(filePath, true)
}

export function pathsEqual(a: string, b: string): boolean {
    return normalizePathQuiet(a) === normalizePathQuiet(b)
}

export function isSubPath(child: string, parent: string): boolean {
    const childNorm = normalizePathQuiet(child)
    const parentNorm = normalizePathQuiet(parent)
    return childNorm.startsWith(parentNorm + '/') || childNorm === parentNorm
}
