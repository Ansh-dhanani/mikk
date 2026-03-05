import type { DependencyGraph } from './types.js'
import type { MikkLock } from '../contract/schema.js'

// ─── Types ──────────────────────────────────────────────────────────

export interface DeadCodeEntry {
    id: string
    name: string
    file: string
    moduleId?: string
    type: 'function' | 'class'
    reason: string
}

export interface DeadCodeResult {
    deadFunctions: DeadCodeEntry[]
    totalFunctions: number
    deadCount: number
    deadPercentage: number
    byModule: Record<string, { dead: number; total: number; items: DeadCodeEntry[] }>
}

// ─── Exemption patterns ────────────────────────────────────────────

/** Common entry-point function names that are never "dead" even with 0 callers */
const ENTRY_POINT_PATTERNS = [
    /^(main|bootstrap|start|init|setup|configure|register|mount)$/i,
    /^(app|server|index|mod|program)$/i,
    /Handler$/i,          // Express/Koa/Hono handlers
    /Middleware$/i,
    /Controller$/i,
    /^use[A-Z]/,          // React hooks
    /^handle[A-Z]/,       // Event handlers
    /^on[A-Z]/,           // Event listeners
]

/** Common test function patterns */
const TEST_PATTERNS = [
    /^(it|describe|test|beforeAll|afterAll|beforeEach|afterEach)$/,
    /\.test\./,
    /\.spec\./,
    /__test__/,
]

// ─── Detector ──────────────────────────────────────────────────────

/**
 * DeadCodeDetector — walks the dependency graph and finds functions
 * with zero incoming `calls` edges after applying multi-pass exemptions.
 *
 * Exemptions:
 *   1. Exported symbols (may be consumed externally)
 *   2. Entry point patterns (main, handler, middleware, hooks, etc.)
 *   3. Route handlers (detected HTTP routes)
 *   4. Test functions (describe, it, test, etc.)
 *   5. Decorated classes/functions (typically framework-managed)
 *   6. Constructor methods (called implicitly)
 */
export class DeadCodeDetector {
    private routeHandlers: Set<string>

    constructor(
        private graph: DependencyGraph,
        private lock: MikkLock,
    ) {
        // Build a set of handler function names from detected routes
        this.routeHandlers = new Set(
            (lock.routes ?? []).map(r => r.handler).filter(Boolean),
        )
    }

    detect(): DeadCodeResult {
        const dead: DeadCodeEntry[] = []
        let totalFunctions = 0
        const byModule: DeadCodeResult['byModule'] = {}

        for (const [id, fn] of Object.entries(this.lock.functions)) {
            totalFunctions++
            const moduleId = fn.moduleId ?? 'unknown'

            // Initialize module bucket
            if (!byModule[moduleId]) {
                byModule[moduleId] = { dead: 0, total: 0, items: [] }
            }
            byModule[moduleId].total++

            // Check if this function has any incoming call edges
            const inEdges = this.graph.inEdges.get(id) || []
            const hasCallers = inEdges.some(e => e.type === 'calls')

            if (hasCallers) continue // Not dead

            // Apply exemptions
            if (this.isExempt(fn, id)) continue

            const entry: DeadCodeEntry = {
                id,
                name: fn.name,
                file: fn.file,
                moduleId,
                type: 'function',
                reason: this.inferReason(fn, id),
            }
            dead.push(entry)
            byModule[moduleId].dead++
            byModule[moduleId].items.push(entry)
        }

        // Also check classes (if present in lock)
        if (this.lock.classes) {
            for (const [id, cls] of Object.entries(this.lock.classes)) {
                const moduleId = cls.moduleId ?? 'unknown'
                if (!byModule[moduleId]) {
                    byModule[moduleId] = { dead: 0, total: 0, items: [] }
                }

                const inEdges = this.graph.inEdges.get(id) || []
                const hasCallers = inEdges.some(e => e.type === 'calls' || e.type === 'imports')

                if (hasCallers) continue
                if (cls.isExported) continue // Exported classes are exempt

                const entry: DeadCodeEntry = {
                    id,
                    name: cls.name,
                    file: cls.file,
                    moduleId,
                    type: 'class',
                    reason: 'Class has no callers or importers and is not exported',
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

    // ─── Exemption checks ──────────────────────────────────────────

    private isExempt(fn: MikkLock['functions'][string], id: string): boolean {
        // 1. Exported functions — may be consumed by external packages
        if (fn.isExported) return true

        // 2. Entry point patterns
        if (ENTRY_POINT_PATTERNS.some(p => p.test(fn.name))) return true

        // 3. Route handlers
        if (this.routeHandlers.has(fn.name)) return true

        // 4. Test functions or in test files
        if (TEST_PATTERNS.some(p => p.test(fn.name) || p.test(fn.file))) return true

        // 5. Constructor methods
        if (fn.name === 'constructor' || fn.name === '__init__') return true

        // 6. Functions called by exported functions in the same file
        // (transitive liveness — if an exported fn calls this, it's alive)
        if (this.isCalledByExportedInSameFile(fn, id)) return true

        return false
    }

    private isCalledByExportedInSameFile(
        fn: MikkLock['functions'][string],
        fnId: string,
    ): boolean {
        // Check calledBy — if any caller is exported and in the same file, exempt
        for (const callerId of fn.calledBy) {
            const caller = this.lock.functions[callerId]
            if (caller && caller.isExported && caller.file === fn.file) {
                return true
            }
        }
        return false
    }

    private inferReason(fn: MikkLock['functions'][string], id: string): string {
        if (fn.calledBy.length === 0) {
            return 'No callers found anywhere in the codebase'
        }
        // calledBy has entries but they didn't resolve to graph edges
        return `${fn.calledBy.length} references exist but none resolved to active call edges`
    }
}
