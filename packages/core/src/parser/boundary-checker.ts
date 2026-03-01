import * as path from 'node:path'
import type { MikkContract, MikkLock, MikkLockFunction } from '@ansh_dhanani/core'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ViolationSeverity = 'error' | 'warning'

export interface BoundaryViolation {
    /** The function making the illegal import */
    from: {
        functionId: string
        functionName: string
        file: string
        moduleId: string
        moduleName: string
    }
    /** The function being illegally called */
    to: {
        functionId: string
        functionName: string
        file: string
        moduleId: string
        moduleName: string
    }
    rule: string
    severity: ViolationSeverity
}

export interface BoundaryCheckResult {
    pass: boolean
    violations: BoundaryViolation[]
    summary: string
}

// ---------------------------------------------------------------------------
// Rule parsing
// ---------------------------------------------------------------------------

/**
 * Parse constraint strings into structured allow/deny rules.
 *
 * Supported syntax in mikk.json constraints:
 *   "module:auth cannot import module:payments"
 *   "module:cli cannot import module:db"
 *   "module:core has no imports"          → core is completely isolated
 *   "module:api can only import module:core, module:utils"
 */
interface ParsedRule {
    type: 'deny' | 'allow_only' | 'isolated'
    fromModuleId: string
    toModuleIds: string[]           // For deny: what's forbidden. For allow_only: what's allowed.
    raw: string
}

function parseConstraint(constraint: string): ParsedRule | null {
    const c = constraint.trim().toLowerCase()

    // "module:X cannot import module:Y"  or "module:X cannot import module:Y, module:Z"
    const denyMatch = c.match(/^module:(\S+)\s+cannot\s+import\s+(.+)$/)
    if (denyMatch) {
        const toModules = denyMatch[2]
            .split(',')
            .map(s => s.trim().replace('module:', ''))
            .filter(Boolean)
        return { type: 'deny', fromModuleId: denyMatch[1], toModuleIds: toModules, raw: constraint }
    }

    // "module:X can only import module:A, module:B"
    const allowOnlyMatch = c.match(/^module:(\S+)\s+can\s+only\s+import\s+(.+)$/)
    if (allowOnlyMatch) {
        const toModules = allowOnlyMatch[2]
            .split(',')
            .map(s => s.trim().replace('module:', ''))
            .filter(Boolean)
        return { type: 'allow_only', fromModuleId: allowOnlyMatch[1], toModuleIds: toModules, raw: constraint }
    }

    // "module:X has no imports" or "module:X is isolated"
    const isolatedMatch = c.match(/^module:(\S+)\s+(has\s+no\s+imports|is\s+isolated)$/)
    if (isolatedMatch) {
        return { type: 'isolated', fromModuleId: isolatedMatch[1], toModuleIds: [], raw: constraint }
    }

    return null   // unrecognized constraint — skip silently
}

// ---------------------------------------------------------------------------
// BoundaryChecker
// ---------------------------------------------------------------------------

/**
 * BoundaryChecker — walks the lock file's call graph and checks every
 * cross-module call against the rules declared in mikk.json constraints.
 *
 * This is the CI-ready enforcement layer.
 */
export class BoundaryChecker {
    private rules: ParsedRule[]
    private moduleNames: Map<string, string>   // id → name

    constructor(
        private contract: MikkContract,
        private lock: MikkLock
    ) {
        this.rules = contract.declared.constraints
            .map(parseConstraint)
            .filter((r): r is ParsedRule => r !== null)

        this.moduleNames = new Map(contract.declared.modules.map(m => [m.id, m.name]))
    }

    /** Run boundary check. Returns pass/fail + all violations. */
    check(): BoundaryCheckResult {
        const violations: BoundaryViolation[] = []

        // Collect all cross-module calls
        for (const fn of Object.values(this.lock.functions)) {
            for (const calleeId of fn.calls) {
                const callee = this.lock.functions[calleeId]
                if (!callee) continue
                if (fn.moduleId === callee.moduleId) continue  // same module — fine

                // Check this cross-module call against all parsed rules
                const violation = this.checkCall(fn, callee)
                if (violation) violations.push(violation)
            }
        }

        const errorCount = violations.filter(v => v.severity === 'error').length
        const warnCount = violations.filter(v => v.severity === 'warning').length

        const summary = violations.length === 0
            ? `✓ All module boundaries respected (${Object.keys(this.lock.functions).length} functions checked)`
            : `✗ ${errorCount} boundary error(s), ${warnCount} warning(s) found`

        return {
            pass: errorCount === 0,
            violations,
            summary,
        }
    }

    /**
     * Check a single cross-module call against parsed rules.
     * Returns a violation if the call is forbidden, null if it's allowed.
     */
    private checkCall(
        caller: MikkLockFunction,
        callee: MikkLockFunction
    ): BoundaryViolation | null {
        for (const rule of this.rules) {
            if (rule.fromModuleId !== caller.moduleId) continue

            let forbidden = false
            let ruleDesc = rule.raw

            if (rule.type === 'isolated') {
                // Module may not call anything outside itself
                forbidden = true
            } else if (rule.type === 'deny') {
                // Module may not call into these specific modules
                forbidden = rule.toModuleIds.includes(callee.moduleId)
            } else if (rule.type === 'allow_only') {
                // Module may ONLY call into the listed modules (+ itself)
                forbidden = !rule.toModuleIds.includes(callee.moduleId)
            }

            if (forbidden) {
                return {
                    from: {
                        functionId: caller.id,
                        functionName: caller.name,
                        file: caller.file,
                        moduleId: caller.moduleId,
                        moduleName: this.moduleNames.get(caller.moduleId) ?? caller.moduleId,
                    },
                    to: {
                        functionId: callee.id,
                        functionName: callee.name,
                        file: callee.file,
                        moduleId: callee.moduleId,
                        moduleName: this.moduleNames.get(callee.moduleId) ?? callee.moduleId,
                    },
                    rule: ruleDesc,
                    severity: 'error',
                }
            }
        }
        return null
    }

    /** Return all cross-module call pairs (useful for generating allow rules) */
    allCrossModuleCalls(): { from: string; to: string; count: number }[] {
        const counts = new Map<string, number>()
        for (const fn of Object.values(this.lock.functions)) {
            for (const calleeId of fn.calls) {
                const callee = this.lock.functions[calleeId]
                if (!callee || fn.moduleId === callee.moduleId) continue
                const key = `${fn.moduleId}→${callee.moduleId}`
                counts.set(key, (counts.get(key) ?? 0) + 1)
            }
        }
        return [...counts.entries()]
            .map(([key, count]) => {
                const [from, to] = key.split('→')
                return { from, to, count }
            })
            .sort((a, b) => b.count - a.count)
    }
}