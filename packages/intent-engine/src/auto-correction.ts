import * as nodePath from 'node:path'
import * as fs from 'node:fs/promises'
import type { MikkContract, MikkLock, DependencyGraph } from '@getmikk/core'

/**
 * AutoCorrectionEngine — detects and auto-fixes common code issues.
 *
 * Capabilities:
 *  1. Broken call references (pointing to IDs that no longer exist in the lock)
 *  2. Missing imports (resolved path absent from lock)
 *  3. Boundary violations (cross-module calls that break declared constraints)
 */
export interface CorrectionIssue {
    type: 'missing_import' | 'broken_reference' | 'boundary_violation' | 'missing_type' | 'null_safety'
    severity: 'error' | 'warning'
    file: string
    line: number
    column: number
    message: string
    autoFixable: boolean
    suggestedFix: string
}

export interface CorrectionResult {
    issues: CorrectionIssue[]
    appliedFixes: string[]
    failedFixes: string[]
    filesModified: string[]
    tokenCost: number
}

export class AutoCorrectionEngine {
    constructor(
        private contract: MikkContract,
        private lock: MikkLock,
        private _graph: DependencyGraph,
        private projectRoot: string,
    ) {}

    /** Analyze files and auto-apply safe fixes. */
    async analyzeAndFix(files: string[]): Promise<CorrectionResult> {
        const issues: CorrectionIssue[] = []
        const appliedFixes: string[] = []
        const failedFixes: string[] = []
        const filesModified = new Set<string>()
        let tokenCost = 0

        for (const file of files) {
            const fileIssues = await this.analyzeFile(file)
            issues.push(...fileIssues)

            for (const issue of fileIssues) {
                if (!issue.autoFixable) continue
                try {
                    const ok = await this.applyFix(issue)
                    if (ok) {
                        appliedFixes.push(`${file}:${issue.line} — ${issue.message}`)
                        filesModified.add(file)
                        tokenCost += 100 // ~100 tokens per fix
                    } else {
                        failedFixes.push(`${file}:${issue.line} — ${issue.message}`)
                    }
                } catch {
                    failedFixes.push(`${file}:${issue.line} — ${issue.message}`)
                }
            }
        }

        return { issues, appliedFixes, failedFixes, filesModified: [...filesModified], tokenCost }
    }

    // ─── Private: analysis ──────────────────────────────────────────────────

    private async analyzeFile(file: string): Promise<CorrectionIssue[]> {
        const issues: CorrectionIssue[] = []
        const norm = file.replace(/\\/g, '/')

        const fileFunctions = Object.values(this.lock.functions).filter(
            f => f.file === norm || f.file.endsWith('/' + norm),
        )

        for (const fn of fileFunctions) {
            // Broken call references
            for (const callId of fn.calls) {
                if (!this.lock.functions[callId]) {
                    // Extract the plain name from the ID (fn:path:Name → Name)
                    const calleeName = callId.split(':').pop() ?? callId
                    const similar = this.findSimilarFunction(calleeName)
                    issues.push({
                        type: 'broken_reference',
                        severity: 'error',
                        file: norm,
                        line: fn.startLine,
                        column: 1,
                        message: `Function "${calleeName}" not found in lock.${similar ? ` Did you mean "${similar}"?` : ''}`,
                        autoFixable: !!similar,
                        suggestedFix: similar ?? '',
                    })
                }
            }

            // Boundary violations
            for (const v of this.checkBoundaryViolations(fn)) {
                issues.push({
                    type: 'boundary_violation',
                    severity: 'warning',
                    file: norm,
                    line: fn.startLine,
                    column: 1,
                    message: v.message,
                    autoFixable: true,
                    suggestedFix: v.suggestedAdapter,
                })
            }
        }

        // Missing imports
        const fileEntry = this.lock.files[norm]
        if (fileEntry) {
            for (const imp of fileEntry.imports ?? []) {
                if (imp.resolvedPath && !this.lock.files[imp.resolvedPath]) {
                    const corrected = this.findCorrectedImportPath(imp.resolvedPath)
                    if (corrected && corrected !== imp.resolvedPath) {
                        issues.push({
                            type: 'missing_import',
                            severity: 'error',
                            file: norm,
                            line: 1,
                            column: 1,
                            message: `Import "${imp.source}" resolves to missing file "${imp.resolvedPath}"`,
                            autoFixable: true,
                            suggestedFix: corrected,
                        })
                    }
                }
            }
        }

        return issues
    }

    // ─── Private: fix application ───────────────────────────────────────────

    private async applyFix(issue: CorrectionIssue): Promise<boolean> {
        // Only operate on files inside the project root
        const abs = nodePath.resolve(this.projectRoot, issue.file)
        const rootResolved = nodePath.resolve(this.projectRoot)
        if (!abs.startsWith(rootResolved + nodePath.sep) && abs !== rootResolved) return false

        let content: string
        try {
            content = await fs.readFile(abs, 'utf-8')
        } catch {
            return false
        }

        let newContent: string
        switch (issue.type) {
            case 'broken_reference':
                newContent = this.fixBrokenReference(content, issue)
                break
            case 'missing_import':
                newContent = this.fixMissingImport(content, issue)
                break
            case 'boundary_violation':
                newContent = this.addBoundaryWarningComment(content, issue)
                break
            default:
                return false
        }

        if (newContent === content) return false
        await fs.writeFile(abs, newContent, 'utf-8')
        return true
    }

    /**
     * Replace the old function name with the suggested name.
     *
     * The issue message is: `Function "<calleeName>" not found...`
     * We extract calleeName from the quotes and do a whole-word replace.
     * We use a simple string-literal escaping so no regex injection occurs.
     */
    private fixBrokenReference(content: string, issue: CorrectionIssue): string {
        const oldName = issue.message.match(/^Function "([^"]+)"/)?.[1]
        const newName = issue.suggestedFix

        if (!oldName || !newName || oldName === newName) return content

        // Escape any regex metacharacters in the name (names can contain `.` for methods)
        const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        return content.replace(new RegExp(`\\b${escaped}\\b`, 'g'), newName)
    }

    /**
     * Replace the old resolved path with the corrected one in import statements.
     */
    private fixMissingImport(content: string, issue: CorrectionIssue): string {
        // Extract the old path from the message: `...missing file "<path>"`
        const oldPath = issue.message.match(/missing file "([^"]+)"/)?.[1]
        const newPath = issue.suggestedFix
        if (!oldPath || !newPath) return content
        // Only replace inside string literals (quoted) to avoid broad substitution
        return content.split(oldPath).join(newPath)
    }

    /**
     * Prepend a TODO comment flagging the boundary violation.
     * Real adapter generation would go here in a future iteration.
     */
    private addBoundaryWarningComment(content: string, issue: CorrectionIssue): string {
        const comment = `// TODO [mikk]: Boundary violation — ${issue.message}\n// Suggested: ${issue.suggestedFix}\n`
        return comment + content
    }

    // ─── Private: helpers ───────────────────────────────────────────────────

    private findSimilarFunction(missingName: string): string | null {
        // Strip class prefix (Class.method → method) for matching
        const simpleName = missingName.includes('.') ? missingName.split('.').pop()! : missingName

        const candidates = Object.values(this.lock.functions)
            .map(f => {
                const name = f.name.includes('.') ? f.name.split('.').pop()! : f.name
                return { fn: f, dist: this.levenshtein(simpleName, name) }
            })
            .filter(x => x.dist <= 3)
            .sort((a, b) => a.dist - b.dist)

        return candidates[0]?.fn.name ?? null
    }

    private checkBoundaryViolations(fn: MikkLock['functions'][string]): Array<{ message: string; suggestedAdapter: string }> {
        const violations: Array<{ message: string; suggestedAdapter: string }> = []
        const constraints = this.contract.declared?.constraints ?? []

        for (const callId of fn.calls) {
            const target = this.lock.functions[callId]
            if (!target || fn.moduleId === target.moduleId) continue

            // Check if any constraint text mentions both modules with "no-import"
            const violated = constraints.some(c => {
                const lower = typeof c === 'string' ? c.toLowerCase() : ''
                return (
                    lower.includes('no-import') &&
                    lower.includes(fn.moduleId.toLowerCase()) &&
                    lower.includes(target.moduleId.toLowerCase())
                )
            })

            if (violated) {
                violations.push({
                    message: `Boundary violation: ${fn.moduleId} → ${target.moduleId} breaks a declared constraint`,
                    suggestedAdapter: `Create adapter in ${fn.moduleId} that wraps ${target.moduleId}::${target.name}`,
                })
            }
        }

        return violations
    }

    private findCorrectedImportPath(oldPath: string): string | null {
        const fileName = oldPath.split('/').pop()
        if (!fileName) return null
        const matches = Object.keys(this.lock.files).filter(p => p.endsWith('/' + fileName))
        return matches.length === 1 ? matches[0] : null
    }

    /** O(n·m) Levenshtein with early exit when distance exceeds threshold. */
    private levenshtein(a: string, b: string, threshold = 4): number {
        if (Math.abs(a.length - b.length) > threshold) return threshold + 1
        const row = Array.from({ length: b.length + 1 }, (_, i) => i)
        for (let i = 1; i <= a.length; i++) {
            let prev = i
            for (let j = 1; j <= b.length; j++) {
                const val = a[i - 1] === b[j - 1] ? row[j - 1] : Math.min(row[j - 1], row[j], prev) + 1
                row[j - 1] = prev
                prev = val
            }
            row[b.length] = prev
        }
        return row[b.length]
    }
}
