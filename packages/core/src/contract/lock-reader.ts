import * as fs from 'node:fs/promises'
import { MikkLockSchema, type MikkLock } from './schema.js'
import { LockNotFoundError } from '../utils/errors.js'

/**
 * LockReader — reads and validates mikk.lock.json from disk.
 * Uses compact format on disk: default values are omitted to save space.
 * Hydrates omitted fields before validation; compactifies before writing.
 */
export class LockReader {
    /** Read and validate mikk.lock.json */
    async read(lockPath: string): Promise<MikkLock> {
        let content: string
        try {
            content = await fs.readFile(lockPath, 'utf-8')
        } catch {
            throw new LockNotFoundError()
        }

        const json = JSON.parse(content)
        const hydrated = hydrateLock(json)
        const result = MikkLockSchema.safeParse(hydrated)

        if (!result.success) {
            const errors = result.error.issues.map(i => `  ${i.path.join('.')}: ${i.message}`).join('\n')
            throw new Error(`Invalid mikk.lock.json:\n${errors}`)
        }

        return result.data
    }

    /** Write lock file to disk in compact format */
    async write(lock: MikkLock, lockPath: string): Promise<void> {
        const compact = compactifyLock(lock)
        const json = JSON.stringify(compact, null, 2)
        await fs.writeFile(lockPath, json, 'utf-8')
    }
}

// ---------------------------------------------------------------------------
// Compact format — omit-defaults serialization
// ---------------------------------------------------------------------------
// Rules:
//   1. Never write a field whose value equals its default ([], "", undefined, "unknown")
//   2. id/name/file/path are derivable from the record key — omit them
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

    // Functions — biggest savings
    out.functions = {}
    for (const [key, fn] of Object.entries(lock.functions)) {
        const c: any = {
            lines: [fn.startLine, fn.endLine],
            hash: fn.hash,
        }
        // Only write non-default fields
        if (fn.moduleId && fn.moduleId !== 'unknown') c.moduleId = fn.moduleId
        if (fn.calls.length > 0) c.calls = fn.calls
        if (fn.calledBy.length > 0) c.calledBy = fn.calledBy
        if (fn.params && fn.params.length > 0) c.params = fn.params
        if (fn.returnType) c.returnType = fn.returnType
        if (fn.isAsync) c.isAsync = true
        if (fn.isExported) c.isExported = true
        if (fn.purpose) c.purpose = fn.purpose
        if (fn.edgeCasesHandled && fn.edgeCasesHandled.length > 0) c.edgeCases = fn.edgeCasesHandled
        if (fn.errorHandling && fn.errorHandling.length > 0) {
            c.errors = fn.errorHandling.map(e => [e.line, e.type, e.detail])
        }
        if (fn.detailedLines && fn.detailedLines.length > 0) {
            c.details = fn.detailedLines.map(d => [d.startLine, d.endLine, d.blockType])
        }
        out.functions[key] = c
    }

    // Classes
    if (lock.classes && Object.keys(lock.classes).length > 0) {
        out.classes = {}
        for (const [key, cls] of Object.entries(lock.classes)) {
            const c: any = {
                lines: [cls.startLine, cls.endLine],
                isExported: cls.isExported,
            }
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

    // Modules — keep as-is (already small)
    out.modules = lock.modules

    // Files — strip redundant path (it's the key)
    out.files = {}
    for (const [key, file] of Object.entries(lock.files)) {
        const c: any = {
            hash: file.hash,
            lastModified: file.lastModified,
        }
        if (file.moduleId && file.moduleId !== 'unknown') c.moduleId = file.moduleId
        if (file.imports && file.imports.length > 0) c.imports = file.imports
        out.files[key] = c
    }

    // Context files — keep as-is (content is the bulk, no savings)
    if (lock.contextFiles && lock.contextFiles.length > 0) {
        out.contextFiles = lock.contextFiles
    }

    // Routes — keep as-is (already compact)
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
        return raw // Already in full format — no hydration needed
    }

    const out: any = {
        version: raw.version,
        generatedAt: raw.generatedAt,
        generatorVersion: raw.generatorVersion,
        projectRoot: raw.projectRoot,
        syncState: raw.syncState,
        graph: raw.graph,
    }

    // Hydrate functions
    out.functions = {}
    for (const [key, c] of Object.entries(raw.functions || {}) as [string, any][]) {
        // Parse key: "fn:filepath:functionName"
        const { name, file } = parseEntityKey(key, 'fn:')
        const lines = c.lines || [c.startLine || 0, c.endLine || 0]

        out.functions[key] = {
            id: key,
            name,
            file,
            startLine: lines[0],
            endLine: lines[1],
            hash: c.hash || '',
            calls: c.calls || [],
            calledBy: c.calledBy || [],
            moduleId: c.moduleId || 'unknown',
            ...(c.params ? { params: c.params } : {}),
            ...(c.returnType ? { returnType: c.returnType } : {}),
            ...(c.isAsync ? { isAsync: true } : {}),
            ...(c.isExported ? { isExported: true } : {}),
            ...(c.purpose ? { purpose: c.purpose } : {}),
            ...(c.edgeCases && c.edgeCases.length > 0 ? { edgeCasesHandled: c.edgeCases } : {}),
            ...(c.errors && c.errors.length > 0 ? {
                errorHandling: c.errors.map((e: any) => ({
                    line: e[0], type: e[1], detail: e[2]
                }))
            } : {}),
            ...(c.details && c.details.length > 0 ? {
                detailedLines: c.details.map((d: any) => ({
                    startLine: d[0], endLine: d[1], blockType: d[2]
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
            ...(c.imports && c.imports.length > 0 ? { imports: c.imports } : {}),
        }
    }

    // Modules — already in full format
    out.modules = raw.modules

    // Pass through
    if (raw.contextFiles) out.contextFiles = raw.contextFiles
    if (raw.routes) out.routes = raw.routes

    return out
}

/** Parse entity key like "fn:path/to/file.ts:FunctionName" */
function parseEntityKey(key: string, prefix: string): { name: string; file: string } {
    const withoutPrefix = key.startsWith(prefix) ? key.slice(prefix.length) : key
    const lastColon = withoutPrefix.lastIndexOf(':')
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
    const rest = key.slice(firstColon + 1)
    const lastColon = rest.lastIndexOf(':')
    if (lastColon === -1) return { prefix, file: rest, name: '' }
    return {
        prefix,
        file: rest.slice(0, lastColon),
        name: rest.slice(lastColon + 1),
    }
}
