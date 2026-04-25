/**
 * Canonical entity ID factory — single source of truth for all parser IDs.
 *
 * ALL parsers (OXC, tree-sitter, GoExtractor, RustExtractor, error-recovery)
 * MUST use makeIdAllocator() or makeCanonicalId() to create entity IDs.
 *
 * Format:  <prefix>:<normalized-posix-path>:<name>[#<count>]
 *
 * Rules:
 *   - File path is always lowercased + forward-slash-normalized (Windows-safe)
 *   - Symbol name preserves ORIGINAL casing (Go `Println` ≠ `println`)
 *   - count ≥ 2 appends `#N` suffix for overloads / same-name declarations
 *
 * Examples:
 *   makeIdAllocator('C:\\Users\\Ansh\\src\\auth.ts')('fn', 'createUser')
 *     → 'fn:c:/users/ansh/src/auth.ts:createUser'
 *   makeCanonicalId('class', '/project/models/user.go', 'User')
 *     → 'class:/project/models/user.go:User'
 */

export type IdPrefix = 'fn' | 'class' | 'type' | 'intf' | 'enum' | 'var' | 'prop'

/**
 * Normalize a file path to the canonical lowercase posix form used in all IDs.
 * Safe to call multiple times (idempotent).
 */
export function normalizeFsPath(filePath: string): string {
    return filePath.replace(/\\/g, '/').toLowerCase()
}

/**
 * Normalize backslashes to forward slashes, preserving original casing.
 * Use for ParsedFile.path and file: fields (human-readable display paths).
 * IDs still use normalizeFsPath (lowercase) for platform-agnostic matching.
 */
export function toPosixPath(filePath: string): string {
    return filePath.replace(/\\/g, '/')
}

/**
 * Build a single canonical ID without duplicate tracking.
 * Use makeIdAllocator when parsing a full file.
 */
export function makeCanonicalId(
    prefix: IdPrefix,
    filePath: string,
    name: string,
    count = 1,
): string {
    const path = normalizeFsPath(filePath)
    const suffix = count > 1 ? `#${count}` : ''
    return `${prefix}:${path}:${name}${suffix}`
}

/**
 * Create a stateful allocator for one file parse pass.
 * Tracks duplicate names automatically and appends #N suffixes.
 *
 * Usage:
 *   const allocateId = makeIdAllocator(filePath)
 *   const id1 = allocateId('fn', 'handler')   // → 'fn:/path/file.ts:handler'
 *   const id2 = allocateId('fn', 'handler')   // → 'fn:/path/file.ts:handler#2'
 */
export function makeIdAllocator(filePath: string): (prefix: IdPrefix, name: string) => string {
    const counter = new Map<string, number>()
    const path = normalizeFsPath(filePath)

    return (prefix: IdPrefix, name: string): string => {
        const key = `${prefix}:${name}`
        const count = (counter.get(key) ?? 0) + 1
        counter.set(key, count)
        const suffix = count > 1 ? `#${count}` : ''
        return `${prefix}:${path}:${name}${suffix}`
    }
}

// ── Typed convenience helpers ──────────────────────────────────────────────────

export const makeFnId    = (f: string, n: string, c = 1): string => makeCanonicalId('fn',    f, n, c)
export const makeClassId = (f: string, n: string, c = 1): string => makeCanonicalId('class', f, n, c)
export const makeTypeId  = (f: string, n: string, c = 1): string => makeCanonicalId('type',  f, n, c)
export const makeIntfId  = (f: string, n: string, c = 1): string => makeCanonicalId('intf',  f, n, c)
export const makeEnumId  = (f: string, n: string, c = 1): string => makeCanonicalId('enum',  f, n, c)
export const makeVarId   = (f: string, n: string, c = 1): string => makeCanonicalId('var',   f, n, c)
export const makePropId  = (f: string, n: string, c = 1): string => makeCanonicalId('prop',  f, n, c)
