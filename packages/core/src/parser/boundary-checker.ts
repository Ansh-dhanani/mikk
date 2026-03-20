import * as path from 'node:path'
import type { MikkContract, MikkLock, MikkLockFunction } from '../contract/schema.js'

export type ViolationSeverity = 'error' | 'warning'

export interface BoundaryViolation {
    from: { functionId: string; functionName: string; file: string; moduleId: string; moduleName: string }
    to: { functionId: string; functionName: string; file: string; moduleId: string; moduleName: string }
    rule: string
    severity: ViolationSeverity
}

export interface BoundaryCheckResult {
    pass: boolean
    violations: BoundaryViolation[]
    summary: string
}

interface ParsedRule {
    type: 'deny' | 'allow_only' | 'isolated'
    fromModuleId: string
    toModuleIds: string[]
    raw: string
}

function stripPrefix(s: string): string {
    return s.trim().replace(/^module:/, '')
}

function parseList(raw: string): string[] {
    return raw.split(/,\s*/).map(stripPrefix).filter(Boolean)
}

function parseConstraint(constraint: string): ParsedRule | null {
    const c = constraint.trim()
    const l = c.toLowerCase()
    const natDeny = l.match(/^(\S+)\s+(?:must\s+not|cannot|should\s+not)\s+(?:import\s+from|import|call\s+into|call)\s+(.+)$/)
    if (natDeny) return { type: 'deny', fromModuleId: stripPrefix(natDeny[1]), toModuleIds: parseList(natDeny[2]), raw: c }
    const natAllow = l.match(/^(\S+)\s+can\s+only\s+(?:import\s+from|import)\s+(.+)$/)
    if (natAllow) return { type: 'allow_only', fromModuleId: stripPrefix(natAllow[1]), toModuleIds: parseList(natAllow[2]), raw: c }
    const natIso = l.match(/^(\S+)\s+(?:is\s+isolated|has\s+no\s+imports)$/)
    if (natIso) return { type: 'isolated', fromModuleId: stripPrefix(natIso[1]), toModuleIds: [], raw: c }
    const legDeny = l.match(/^module:(\S+)\s+cannot\s+import\s+(.+)$/)
    if (legDeny) return { type: 'deny', fromModuleId: legDeny[1], toModuleIds: parseList(legDeny[2]), raw: c }
    const legAllow = l.match(/^module:(\S+)\s+can\s+only\s+import\s+(.+)$/)
    if (legAllow) return { type: 'allow_only', fromModuleId: legAllow[1], toModuleIds: parseList(legAllow[2]), raw: c }
    const legIso = l.match(/^module:(\S+)\s+(?:has\s+no\s+imports|is\s+isolated)$/)
    if (legIso) return { type: 'isolated', fromModuleId: legIso[1], toModuleIds: [], raw: c }
    console.warn(`[mikk] Constraint skipped: "${c}" - use "auth must not import from payments"`)
    return null
}

export class BoundaryChecker {
    private rules: ParsedRule[]
    private moduleNames: Map<string, string>

    constructor(private contract: MikkContract, private lock: MikkLock) {
        this.rules = contract.declared.constraints.map(parseConstraint).filter((r): r is ParsedRule => r !== null)
        this.moduleNames = new Map(contract.declared.modules.map(m => [m.id, m.name]))
    }

    check(): BoundaryCheckResult {
        const violations: BoundaryViolation[] = []

        for (const fn of Object.values(this.lock.functions)) {
            if (fn.moduleId === 'unknown') continue
            for (const calleeId of fn.calls) {
                const callee = this.lock.functions[calleeId]
                if (!callee || callee.moduleId === 'unknown' || fn.moduleId === callee.moduleId) continue
                const v = this.checkCall(fn, callee)
                if (v) violations.push(v)
            }
        }

        for (const file of Object.values(this.lock.files)) {
            if (file.moduleId === 'unknown' || !file.imports?.length) continue
            for (const importedPath of file.imports) {
                const importedFile = this.lock.files[importedPath]
                if (!importedFile || importedFile.moduleId === 'unknown' || file.moduleId === importedFile.moduleId) continue
                const v = this.checkFileImport(file, importedFile)
                if (v) violations.push(v)
            }
        }

        const seen = new Set<string>()
        const unique = violations.filter(v => {
            const key = `${v.from.functionId}|${v.to.functionId}|${v.rule}`
            if (seen.has(key)) return false
            seen.add(key)
            return true
        })

        const fnCount = Object.keys(this.lock.functions).length
        const fileCount = Object.keys(this.lock.files).length
        const errorCount = unique.filter(v => v.severity === 'error').length
        const warnCount = unique.filter(v => v.severity === 'warning').length
        const summary = unique.length === 0
            ? `All module boundaries respected (${fnCount} functions, ${fileCount} files checked)`
            : `${errorCount} boundary error(s), ${warnCount} warning(s) found`

        return { pass: errorCount === 0, violations: unique, summary }
    }

    private checkCall(caller: MikkLockFunction, callee: MikkLockFunction): BoundaryViolation | null {
        for (const rule of this.rules) {
            if (rule.fromModuleId !== caller.moduleId) continue
            const forbidden = rule.type === 'isolated' ? true
                : rule.type === 'deny' ? rule.toModuleIds.includes(callee.moduleId)
                : !rule.toModuleIds.includes(callee.moduleId)
            if (forbidden) return {
                from: { functionId: caller.id, functionName: caller.name, file: caller.file, moduleId: caller.moduleId, moduleName: this.moduleNames.get(caller.moduleId) ?? caller.moduleId },
                to: { functionId: callee.id, functionName: callee.name, file: callee.file, moduleId: callee.moduleId, moduleName: this.moduleNames.get(callee.moduleId) ?? callee.moduleId },
                rule: rule.raw, severity: 'error'
            }
        }
        return null
    }

    private checkFileImport(sourceFile: { path: string; moduleId: string }, targetFile: { path: string; moduleId: string }): BoundaryViolation | null {
        for (const rule of this.rules) {
            if (rule.fromModuleId !== sourceFile.moduleId) continue
            const forbidden = rule.type === 'isolated' ? true
                : rule.type === 'deny' ? rule.toModuleIds.includes(targetFile.moduleId)
                : !rule.toModuleIds.includes(targetFile.moduleId)
            if (forbidden) return {
                from: { functionId: `file:${sourceFile.path}`, functionName: path.basename(sourceFile.path), file: sourceFile.path, moduleId: sourceFile.moduleId, moduleName: this.moduleNames.get(sourceFile.moduleId) ?? sourceFile.moduleId },
                to: { functionId: `file:${targetFile.path}`, functionName: path.basename(targetFile.path), file: targetFile.path, moduleId: targetFile.moduleId, moduleName: this.moduleNames.get(targetFile.moduleId) ?? targetFile.moduleId },
                rule: rule.raw, severity: 'error'
            }
        }
        return null
    }

    allCrossModuleCalls(): { from: string; to: string; count: number }[] {
        const counts = new Map<string, number>()
        for (const fn of Object.values(this.lock.functions)) {
            for (const calleeId of fn.calls) {
                const callee = this.lock.functions[calleeId]
                if (!callee || fn.moduleId === callee.moduleId || fn.moduleId === 'unknown' || callee.moduleId === 'unknown') continue
                const key = `${fn.moduleId}>${callee.moduleId}`
                counts.set(key, (counts.get(key) ?? 0) + 1)
            }
        }
        return [...counts.entries()].map(([key, count]) => { const [from, to] = key.split('>'); return { from, to, count } }).sort((a, b) => b.count - a.count)
    }
}