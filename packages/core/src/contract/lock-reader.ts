import { MikkLockSchema, type MikkLock } from './schema.js'
import { LockNotFoundError } from '../utils/errors.js'
import { readJsonSafe } from '../utils/json.js'
import { writeFileAtomic } from '../utils/atomic-write.js'
import { randomUUID } from 'node:crypto'

export interface LockWriteOptions {
    expectedGenerationId?: string
    expectedWriteVersion?: number
}

/**
 * LockReader -- reads and validates mikk.lock.json from disk.
 * Uses compact format on disk: default values are omitted to save space.
 * Hydrates omitted fields before validation; compactifies before writing.
 */
export class LockReader {
    /** Read and validate mikk.lock.json */
    async read(lockPath: string): Promise<MikkLock> {
        let json: any
        try {
            json = await readJsonSafe(lockPath, 'mikk.lock.json')
        } catch (e: any) {
            if (e.code === 'ENOENT') {
                throw new LockNotFoundError()
            }
            throw e
        }

        const hydrated = hydrateLock(json)
        const result = MikkLockSchema.safeParse(hydrated)

        if (!result.success) {
            const errors = result.error.issues.map(i => `  ${i.path.join('.')}: ${i.message}`).join('\n')
            throw new Error(`Invalid mikk.lock.json structure:\n${errors}`)
        }

        return result.data
    }

    serialize(lock: MikkLock): string {
        const compact = compactifyLock(lock)
        return JSON.stringify(compact, null, 2)
    }

    async prepareForWrite(lock: MikkLock, lockPath: string, options: LockWriteOptions = {}): Promise<MikkLock> {
        let existing: MikkLock | null = null
        try {
            existing = await this.read(lockPath)
        } catch (err: any) {
            if (!(err instanceof LockNotFoundError)) {
                throw err
            }
        }

        const prepared: MikkLock = {
            ...lock,
            syncState: {
                ...lock.syncState,
            },
        }

        if (existing) {
            const existingGeneration = existing.syncState.generationId
            const existingWriteVersion = existing.syncState.writeVersion ?? 0

            if (
                options.expectedGenerationId &&
                existingGeneration &&
                options.expectedGenerationId !== existingGeneration
            ) {
                throw new Error('Lock write rejected: generation mismatch (stale writer).')
            }

            if (
                typeof options.expectedWriteVersion === 'number' &&
                options.expectedWriteVersion !== existingWriteVersion
            ) {
                throw new Error('Lock write rejected: writeVersion mismatch (stale writer).')
            }

            prepared.syncState.generationId = existingGeneration || prepared.syncState.generationId || randomUUID()
            prepared.syncState.writeVersion = existingWriteVersion + 1
        } else {
            prepared.syncState.generationId = prepared.syncState.generationId || randomUUID()
            prepared.syncState.writeVersion = prepared.syncState.writeVersion ?? 0
        }

        return prepared
    }

    /** Write lock file to disk in compact format */
    async write(lock: MikkLock, lockPath: string, options: LockWriteOptions = {}): Promise<void> {
        const prepared = await this.prepareForWrite(lock, lockPath, options)
        const json = this.serialize(prepared)
        await writeFileAtomic(lockPath, json, { encoding: 'utf-8' })
    }
}

// ---------------------------------------------------------------------------
// Compact format -- omit-defaults serialization
// ---------------------------------------------------------------------------
// Rules:
//   1. Never write a field whose value equals its default ([], "", undefined, "unknown")
//   2. id/name/file/path are derivable from the record key  omit them
//   3. Line ranges become tuples: [startLine, endLine]
//   4. errorHandling becomes tuples: [line, type, detail]
//   5. detailedLines becomes tuples: [startLine, endLine, blockType]
// ---------------------------------------------------------------------------

/** Strip defaults and redundant fields for compact on-disk storage */
function compactifyLock(lock: MikkLock): any {
    const out: any = {
        version: lock.version,
        generatedAt: lock.generatedAt,
        generatorVersion: lock.generatorVersion,
        projectRoot: lock.projectRoot,
        syncState: lock.syncState,
        graph: lock.graph,
    }

    // P7: Build fnIndex for integer edge references
    const fnKeys = Object.keys(lock.functions)
    const fnIndexMap = new Map<string, number>()
    fnKeys.forEach((k, i) => fnIndexMap.set(k, i))
    out.fnIndex = fnKeys

    // Functions -- biggest savings
    out.functions = {}
    for (let idx = 0; idx < fnKeys.length; idx++) {
        const fn = lock.functions[fnKeys[idx]]
        const c: any = {
            lines: [fn.startLine, fn.endLine],
        }
        // Always preserve moduleId — critical for module-level queries
        if (fn.moduleId && fn.moduleId !== 'unknown') c.moduleId = fn.moduleId
        // Preserve semantic role classification
        if (fn.role) c.role = fn.role
        if (fn.roleFramework) c.roleFramework = fn.roleFramework
        // P7: integer calls/calledBy referencing fnIndex positions
        const { name: parsedName } = parseEntityKey(fn.id, 'fn:')
        c.name = fn.name || parsedName
        if (fn.calls.length > 0) c.calls = fn.calls.map(id => fnIndexMap.get(id) ?? -1).filter((n: number) => n >= 0)
        if (fn.calledBy.length > 0) c.calledBy = fn.calledBy.map(id => fnIndexMap.get(id) ?? -1).filter((n: number) => n >= 0)
        if (fn.params && fn.params.length > 0) c.params = fn.params
        if (fn.returnType) c.returnType = fn.returnType
        if (fn.isAsync) c.isAsync = true
        if (fn.isExported) c.isExported = true
        if (fn.isAbstract) c.isAbstract = true
        if (fn.typeParameters) c.typeParameters = fn.typeParameters
        if (fn.decorators) c.decorators = fn.decorators
        if (fn.purpose) c.purpose = fn.purpose
        if (fn.edgeCasesHandled && fn.edgeCasesHandled.length > 0) c.edgeCases = fn.edgeCasesHandled
        if (fn.errorHandling && fn.errorHandling.length > 0) {
            c.errors = fn.errorHandling.map(e => [e.line, e.type, e.detail])
        }
        out.functions[String(idx)] = c
    }

    // Classes
    if (lock.classes && Object.keys(lock.classes).length > 0) {
        out.classes = {}
        for (const [key, cls] of Object.entries(lock.classes)) {
            const c: any = {
                name: cls.name,
                lines: [cls.startLine, cls.endLine],
            }
            if (cls.isExported) c.isExported = true
            if (cls.isAbstract) c.isAbstract = true
            if (cls.typeParameters) c.typeParameters = cls.typeParameters
            if (cls.extends) c.extends = cls.extends
            if (cls.implements) c.implements = cls.implements
            if (cls.decorators) c.decorators = cls.decorators
            if (cls.moduleId && cls.moduleId !== 'unknown') c.moduleId = cls.moduleId
            if (cls.purpose) c.purpose = cls.purpose
            if (cls.edgeCasesHandled && cls.edgeCasesHandled.length > 0) c.edgeCases = cls.edgeCasesHandled
            if (cls.errorHandling && cls.errorHandling.length > 0) {
                c.errors = cls.errorHandling.map(e => [e.line, e.type, e.detail])
            }
            out.classes[key] = c
        }
    }

    // Generics
    if (lock.generics && Object.keys(lock.generics).length > 0) {
        out.generics = {}
        for (const [key, gen] of Object.entries(lock.generics)) {
            const c: any = {
                name: gen.name,
                lines: [gen.startLine, gen.endLine],
            }
            if (gen.type && gen.type !== 'generic') c.type = gen.type
            if (gen.moduleId && gen.moduleId !== 'unknown') c.moduleId = gen.moduleId
            if (gen.isExported) c.isExported = true
            if (gen.purpose) c.purpose = gen.purpose
            if (gen.alsoIn && gen.alsoIn.length > 0) c.alsoIn = gen.alsoIn
            out.generics[key] = c
        }
    }

    // Modules -- keep as-is (already small)
    out.modules = lock.modules

    // Files -- strip redundant path (it's the key)
    out.files = {}
    for (const [key, file] of Object.entries(lock.files)) {
        const c: any = {
            hash: file.hash,
            lastModified: file.lastModified,
        }
        // Always store moduleId for proper hydration (P6)
        if (file.moduleId) c.moduleId = file.moduleId
        if (file.imports && file.imports.length > 0) {
            c.imports = file.imports.map(normalizeImportEntry)
        }
        out.files[key] = c
    }

    // Context files -- paths/type only, no content
    if (lock.contextFiles && lock.contextFiles.length > 0) {
        out.contextFiles = lock.contextFiles.map(({ path, type, size }) => ({ path, type, size }))
    }

    // Routes -- keep as-is (already compact)
    if (lock.routes && lock.routes.length > 0) {
        out.routes = lock.routes
    }

    return out
}

/** Restore omitted defaults and redundant fields from compact format */
function hydrateLock(raw: any): any {
    if (!raw || typeof raw !== 'object') return raw

    // If it already has the old format (functions have id/name/file), pass through
    const firstFn = Object.values(raw.functions || {})[0] as any
    if (firstFn && typeof firstFn === 'object' && 'id' in firstFn && 'name' in firstFn && 'file' in firstFn) {
        return raw // Already in full format -- no hydration needed
    }

    const out: any = {
        version: raw.version,
        generatedAt: raw.generatedAt,
        generatorVersion: raw.generatorVersion,
        projectRoot: raw.projectRoot,
        syncState: raw.syncState,
        graph: raw.graph ? {
            ...raw.graph,
            // P7 Handle legacy lock format where edges was just a count (number)
            edges: Array.isArray(raw.graph.edges) ? raw.graph.edges : []
        } : undefined,
    }

    // P7: function index for integer edge resolution
    const fnIndex: string[] = raw.fnIndex || []
    const hasFnIndex = fnIndex.length > 0

    // P6: build file->moduleId map before function loop
    const fileModuleMap: Record<string, string> = {}
    for (const [key, c] of Object.entries(raw.files || {}) as [string, any][]) {
        const moduleId = c.moduleId || 'unknown'
        const normalizedKey = normalizeFilePath(key)
        fileModuleMap[key] = moduleId
        fileModuleMap[normalizedKey] = moduleId
    }

    // Hydrate functions
    out.functions = {}
    for (const [key, c] of Object.entries(raw.functions || {}) as [string, any][]) {
        // P7: key is integer index -> look up full ID via fnIndex
        const fullId = hasFnIndex ? (fnIndex[parseInt(key)] || key) : key
        const { name: parsedName, file } = parseEntityKey(fullId, 'fn:')
        const name = c.name || parsedName
        const lines = c.lines || [c.startLine || 0, c.endLine || 0]
        // P7: integer calls/calledBy -> resolve to full string IDs (backward compat: strings pass through)
        const calls = (c.calls || []).map((v: any) => typeof v === 'number' ? (fnIndex[v] ?? null) : v).filter(Boolean)
        const calledBy = (c.calledBy || []).map((v: any) => typeof v === 'number' ? (fnIndex[v] ?? null) : v).filter(Boolean)

        // Priority: stored moduleId > file-map derivation > 'unknown'
        const normalizedFile = normalizeFilePath(file)
        const moduleId = c.moduleId || fileModuleMap[normalizedFile] || fileModuleMap[file] || 'unknown'

        out.functions[fullId] = {
            id: fullId,
            name,
            file,
            startLine: lines[0],
            endLine: lines[1],
            hash: c.hash || '',
            calls,
            calledBy,
            moduleId,
            ...(c.params ? { params: c.params } : {}),
            ...(c.returnType ? { returnType: c.returnType } : {}),
            ...(c.isAsync ? { isAsync: true } : {}),
            ...(c.isExported ? { isExported: true } : {}),
            ...(c.isAbstract ? { isAbstract: true } : {}),
            ...(c.typeParameters ? { typeParameters: c.typeParameters } : {}),
            ...(c.decorators ? { decorators: c.decorators } : {}),
            ...(c.purpose ? { purpose: c.purpose } : {}),
            ...(c.role ? { role: c.role } : {}),
            ...(c.roleFramework ? { roleFramework: c.roleFramework } : {}),
            ...(c.edgeCases && c.edgeCases.length > 0 ? { edgeCasesHandled: c.edgeCases } : {}),
            ...(c.errors && c.errors.length > 0 ? {
                errorHandling: c.errors.map((e: any) => ({
                    line: e[0], type: e[1], detail: e[2]
                }))
            } : {}),
        }
    }

    // Hydrate classes
    if (raw.classes) {
        out.classes = {}
        for (const [key, c] of Object.entries(raw.classes) as [string, any][]) {
            const { name, file } = parseEntityKey(key, 'class:')
            const lines = c.lines || [c.startLine || 0, c.endLine || 0]

            out.classes[key] = {
                id: key,
                name,
                file,
                startLine: lines[0],
                endLine: lines[1],
                moduleId: c.moduleId || 'unknown',
                isExported: c.isExported ?? false,
                isAbstract: c.isAbstract ?? false,
                ...(c.typeParameters ? { typeParameters: c.typeParameters } : {}),
                ...(c.extends ? { extends: c.extends } : {}),
                ...(c.implements ? { implements: c.implements } : {}),
                ...(c.decorators ? { decorators: c.decorators } : {}),
                ...(c.purpose ? { purpose: c.purpose } : {}),
                ...(c.edgeCases && c.edgeCases.length > 0 ? { edgeCasesHandled: c.edgeCases } : {}),
                ...(c.errors && c.errors.length > 0 ? {
                    errorHandling: c.errors.map((e: any) => ({
                        line: e[0], type: e[1], detail: e[2]
                    }))
                } : {}),
            }
        }
    }

    // Hydrate generics
    if (raw.generics) {
        out.generics = {}
        for (const [key, c] of Object.entries(raw.generics) as [string, any][]) {
            const { name, file, prefix } = parseEntityKeyFull(key)
            const lines = c.lines || [c.startLine || 0, c.endLine || 0]
            const inferredType = prefix === 'intf' ? 'interface' : prefix === 'type' ? 'type' : prefix === 'const' ? 'const' : c.type || 'generic'

            out.generics[key] = {
                id: key,
                name,
                type: c.type || inferredType,
                file,
                startLine: lines[0],
                endLine: lines[1],
                moduleId: c.moduleId || 'unknown',
                isExported: c.isExported ?? false,
                ...(c.purpose ? { purpose: c.purpose } : {}),
                ...(c.alsoIn && c.alsoIn.length > 0 ? { alsoIn: c.alsoIn } : {}),
            }
        }
    }

    // Hydrate files
    out.files = {}
    for (const [key, c] of Object.entries(raw.files || {}) as [string, any][]) {
        out.files[key] = {
            path: key,
            hash: c.hash || '',
            moduleId: c.moduleId || 'unknown',
            lastModified: c.lastModified || '',
            ...(c.imports && c.imports.length > 0 ? { imports: c.imports.map(normalizeImportEntry) } : {}),
        }
    }

    // Modules -- already in full format
    out.modules = raw.modules

    // Pass through
    if (raw.contextFiles) out.contextFiles = raw.contextFiles
    if (raw.routes) out.routes = raw.routes

    return out
}

/**
 * Parse entity key like "fn:path/to/file.ts:FunctionName"
 * Handles both new single-colon format (fn:path:name) and legacy
 * double-colon format (fn::path::name) for backward compatibility.
 */
function parseEntityKey(key: string, prefix: string): { name: string; file: string } {
    // Handle legacy double-colon format: fn::path::name
    const doubleColonPrefix = prefix.replace(/:$/, '::')
    if (key.startsWith(doubleColonPrefix)) {
        const withoutPrefix = key.slice(doubleColonPrefix.length)
        const lastSep = withoutPrefix.lastIndexOf('::')
        if (lastSep !== -1) {
            return {
                file: withoutPrefix.slice(0, lastSep),
                name: withoutPrefix.slice(lastSep + 2),
            }
        }
    }

    // Standard single-colon format: fn:path:name
    const withoutPrefix = key.startsWith(prefix) ? key.slice(prefix.length) : key
    // Find the last colon that's NOT part of a drive letter (e.g., c:/)
    const lastColon = findLastNonDriveColon(withoutPrefix)
    if (lastColon === -1) return { name: withoutPrefix, file: '' }
    return {
        file: withoutPrefix.slice(0, lastColon),
        name: withoutPrefix.slice(lastColon + 1),
    }
}

/** Parse any entity key, returning prefix too */
function parseEntityKeyFull(key: string): { prefix: string; file: string; name: string } {
    const firstColon = key.indexOf(':')
    if (firstColon === -1) return { prefix: '', file: '', name: key }
    const prefix = key.slice(0, firstColon)
    // Skip a second colon if present (legacy double-colon format)
    const restStart = key[firstColon + 1] === ':' ? firstColon + 2 : firstColon + 1
    const rest = key.slice(restStart)
    const lastColon = findLastNonDriveColon(rest)
    if (lastColon === -1) return { prefix, file: rest, name: '' }
    return {
        prefix,
        file: rest.slice(0, lastColon),
        name: rest.slice(lastColon + 1),
    }
}

/**
 * Find the last colon in a string, skoring drive-letter colons (e.g., c:/).
 * This ensures 'c:/users/project/file.ts:functionName' splits correctly.
 */
function findLastNonDriveColon(s: string): number {
    for (let i = s.length - 1; i >= 0; i--) {
        if (s[i] === ':') {
            // Skip if this is a drive letter colon (single letter before, / or \ after)
            if (i === 1 && /^[a-zA-Z]$/.test(s[0]) && (s[2] === '/' || s[2] === '\\')) {
                continue
            }
            // Skip legacy double-colon separators
            if (s[i - 1] === ':') continue
            if (s[i + 1] === ':') continue
            return i
        }
    }
    return -1
}

function normalizeImportEntry(entry: any): { source: string; resolvedPath?: string; names?: string[] } {
    if (!entry) return { source: '' }
    if (typeof entry === 'string') return { source: entry }
    return {
        source: entry.source,
        resolvedPath: entry.resolvedPath || undefined,
        names: entry.names?.length ? entry.names : undefined,
    }
}

function normalizeFilePath(p: string): string {
    return (p || '').replace(/\\/g, '/').toLowerCase()
}
