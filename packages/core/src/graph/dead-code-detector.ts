import type { DependencyGraph } from './types.js'
import type { MikkLock } from '../contract/schema.js'

// ─── Types ──────────────────────────────────────────────────────────

/**
 * Confidence level for a dead code finding.
 *
 *  high   — zero callers, no dynamic patterns, no unresolved imports in the file.
 *           Safe to remove.
 *  medium — zero callers via graph, but the file has unresolved imports
 *           (some calls may not have been traced). Review before removing.
 *  low    — zero graph callers, but the function name or context suggests it
 *           may be used dynamically (generic names, lifecycle hooks, etc.).
 *           Do not remove without manual verification.
 */
export type DeadCodeConfidence = 'high' | 'medium' | 'low'

export interface DeadCodeEntry {
    id: string
    name: string
    file: string
    moduleId?: string
    type: 'function' | 'class'
    reason: string
    confidence: DeadCodeConfidence
}

export interface DeadCodeResult {
    deadFunctions: DeadCodeEntry[]
    totalFunctions: number
    deadCount: number
    deadPercentage: number
    byModule: Record<string, { dead: number; total: number; items: DeadCodeEntry[] }>
}

// ─── Exemption patterns ────────────────────────────────────────────

/** Entry-point function names that are never "dead" even with 0 graph callers */
const ENTRY_POINT_PATTERNS = [
    /^(main|bootstrap|start|init|setup|configure|register|mount)$/i,
    /^(app|server|index|mod|program)$/i,
    /Handler$/i,
    /Middleware$/i,
    /Controller$/i,
    /^use[A-Z]/,       // React hooks
    /^handle[A-Z]/,    // Event handlers
    /^on[A-Z]/,        // Event listeners
]

/** Test function patterns */
const TEST_PATTERNS = [
    /^(it|describe|test|beforeAll|afterAll|beforeEach|afterEach)$/,
    /\.test\./,
    /\.spec\./,
    /__test__/,
]

/**
 * Names that are commonly used via dynamic dispatch, string-keyed maps, or
 * framework injection. A function matching these patterns gets LOW confidence
 * even if no graph callers exist, because static analysis may have missed it.
 */
const DYNAMIC_USAGE_PATTERNS = [
    /^addEventListener$/i,
    /^removeEventListener$/i,
    /^on[A-Z]/,
    /(invoke|dispatch|emit|call|apply)/i,
    /^ngOnInit$/i,
    /^componentDidMount$/i,
    /^componentWillUnmount$/i,
]

// ─── Detector ──────────────────────────────────────────────────────

/**
 * DeadCodeDetector — walks the dependency graph to find functions with zero
 * incoming `calls` edges after applying multi-pass exemptions.
 *
 * Exemptions (function is NOT reported as dead):
 *   1. Exported symbols — may be consumed by external packages
 *   2. Entry point name patterns — main, handler, middleware, hooks, etc.
 *   3. Route handlers — detected via HTTP route registrations in the lock
 *   4. Test functions — describe, it, test, lifecycle hooks
 *   5. Constructors — called implicitly by `new`
 *   6. Called by an exported function in the same file (transitive liveness)
 *
 * Each dead entry includes a confidence level:
 *   high   — safe to remove
 *   medium — file has unresolved imports; verify before removing
 *   low    — dynamic usage patterns detected; manual review required
 */
export class DeadCodeDetector {
    private routeHandlers: Set<string>
    /** Files that have at least one unresolved import (empty resolvedPath) */
    private filesWithUnresolvedImports: Set<string>

    constructor(
        private graph: DependencyGraph,
        private lock: MikkLock,
    ) {
        this.routeHandlers = new Set(
            (lock.routes ?? []).map(r => r.handler).filter(Boolean),
        )

        // Pre-compute which files have unresolved imports so confidence can
        // be lowered for all functions in those files without scanning per-function.
        this.filesWithUnresolvedImports = this.buildUnresolvedImportFileSet()
    }

    detect(): DeadCodeResult {
        const dead: DeadCodeEntry[] = []
        let totalFunctions = 0
        const byModule: DeadCodeResult['byModule'] = {}

        for (const [id, fn] of Object.entries(this.lock.functions)) {
            totalFunctions++
            const moduleId = fn.moduleId ?? 'unknown'

            if (!byModule[moduleId]) {
                byModule[moduleId] = { dead: 0, total: 0, items: [] }
            }
            byModule[moduleId].total++

            // Check for incoming call edges in the graph
            const inEdges = this.graph.inEdges.get(id) || []
            const hasCallers = inEdges.some(e => e.type === 'calls')
            if (hasCallers) continue

            if (this.isExempt(fn, id)) continue

            const confidence = this.inferConfidence(fn)
            const entry: DeadCodeEntry = {
                id,
                name: fn.name,
                file: fn.file,
                moduleId,
                type: 'function',
                reason: this.inferReason(fn),
                confidence,
            }
            dead.push(entry)
            byModule[moduleId].dead++
            byModule[moduleId].items.push(entry)
        }

        // Check classes
        if (this.lock.classes) {
            for (const [id, cls] of Object.entries(this.lock.classes)) {
                const moduleId = cls.moduleId ?? 'unknown'
                if (!byModule[moduleId]) {
                    byModule[moduleId] = { dead: 0, total: 0, items: [] }
                }

                const inEdges = this.graph.inEdges.get(id) || []
                const hasCallers = inEdges.some(e => e.type === 'calls' || e.type === 'imports')
                if (hasCallers || cls.isExported) continue

                const entry: DeadCodeEntry = {
                    id,
                    name: cls.name,
                    file: cls.file,
                    moduleId,
                    type: 'class',
                    reason: 'Class has no callers or importers and is not exported',
                    confidence: this.filesWithUnresolvedImports.has(cls.file) ? 'medium' : 'high',
                }
                dead.push(entry)
                byModule[moduleId].dead++
                byModule[moduleId].items.push(entry)
            }
        }

        return {
            deadFunctions: dead,
            totalFunctions,
            deadCount: dead.length,
            deadPercentage: totalFunctions > 0
                ? Math.round((dead.length / totalFunctions) * 1000) / 10
                : 0,
            byModule,
        }
    }

    // ─── Private helpers ───────────────────────────────────────────

    private isExempt(fn: MikkLock['functions'][string], id: string): boolean {
        if (fn.isExported) return true
        if (ENTRY_POINT_PATTERNS.some(p => p.test(fn.name))) return true
        if (this.routeHandlers.has(fn.name)) return true
        if (TEST_PATTERNS.some(p => p.test(fn.name) || p.test(fn.file))) return true
        if (fn.name === 'constructor' || fn.name === '__init__') return true
        if (this.isCalledByExportedInSameFile(fn)) return true
        return false
    }

    private isCalledByExportedInSameFile(fn: MikkLock['functions'][string]): boolean {
        for (const callerId of fn.calledBy) {
            const caller = this.lock.functions[callerId]
            if (caller && caller.isExported && caller.file === fn.file) return true
        }
        return false
    }

    /**
     * Assign a confidence level to a dead code finding.
     *
     * Priority (first match wins):
     *  medium — lock.calledBy has entries that didn't become graph edges:
     *           something references this function but resolution failed.
     *  medium — file has unresolved imports: the graph may be incomplete.
     *  low    — function name matches common dynamic-dispatch patterns.
     *  high   — none of the above: safe to remove.
     */
    private inferConfidence(fn: MikkLock['functions'][string]): DeadCodeConfidence {
        if (fn.calledBy.length > 0) return 'medium'
        if (this.filesWithUnresolvedImports.has(fn.file)) return 'medium'
        if (DYNAMIC_USAGE_PATTERNS.some(p => p.test(fn.name))) return 'low'
        return 'high'
    }

    private inferReason(fn: MikkLock['functions'][string]): string {
        if (fn.calledBy.length === 0) {
            return 'No callers found anywhere in the codebase'
        }
        return `${fn.calledBy.length} reference(s) in lock but none resolved to active call edges`
    }

    /**
     * Build the set of file paths that have at least one import whose
     * resolvedPath is empty. Used to downgrade confidence for all dead
     * findings in those files, since the graph may be incomplete.
     *
     * We derive this from the lock's file entries. Each file entry stores
     * its imports; any import with an empty resolvedPath (or no match in
     * the graph nodes) indicates an unresolved dependency.
     */
    private buildUnresolvedImportFileSet(): Set<string> {
        const result = new Set<string>()
        if (!this.lock.files) return result

        for (const [filePath, fileInfo] of Object.entries(this.lock.files)) {
            const imports = (fileInfo as any).imports ?? []
            for (const imp of imports) {
                if (!imp.resolvedPath || imp.resolvedPath === '') {
                    result.add(filePath)
                    break // One unresolved import is enough to flag the file
                }
            }
        }
        return result
    }
}
