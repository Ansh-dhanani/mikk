import type { MikkContract, MikkLock, DependencyGraph } from '@getmikk/core'
import { ImpactAnalyzer } from '@getmikk/core'

/**
 * EnforcedSafetyGates — blocks unsafe edits at edit-time.
 *
 * Unlike warnings, blocking gates PREVENT edits from being applied
 * unless explicitly bypassed.
 *
 * Integration points:
 * - Pre-commit hooks
 * - IDE save handlers
 * - CI/CD gates
 * - MCP tool validation (mikk_before_edit)
 */
export interface SafetyGateResult {
    canProceed: boolean
    gate: string
    reason: string
    severity: 'BLOCKING' | 'WARNING'
    bypassable: boolean
    bypassCommand?: string
    autoFixable: boolean
    suggestedFix?: string
}

export interface SafetyGateConfig {
    enforceOnSave: boolean
    enforceOnCommit: boolean
    enforceInCI: boolean
    maxRiskScore: number
    maxImpactNodes: number
    requireTestsForChangedFiles: boolean
    requireDocumentationForApiChanges: boolean
    protectedModules: string[]
}

export class EnforcedSafetyGates {
    private analyzer: ImpactAnalyzer

    constructor(
        private contract: MikkContract,
        private lock: MikkLock,
        graph: DependencyGraph,
        private config: SafetyGateConfig,
    ) {
        this.analyzer = new ImpactAnalyzer(graph)
    }

    /** Run all safety gates before allowing edits. */
    async validateEdits(
        files: string[],
        context?: { commitMessage?: string; branchName?: string; isTestRun?: boolean },
    ): Promise<SafetyGateResult[]> {
        return [
            await this.checkRiskGate(files),
            await this.checkScaleGate(files),
            await this.checkProtectedModuleGate(files),
            await this.checkBreakingChangeGate(files, context),
            await this.checkTestCoverageGate(files),
            await this.checkDocumentationGate(files),
        ]
    }

    /** Returns whether all blocking gates passed. */
    canProceed(results: SafetyGateResult[]): { allowed: boolean; blockingGates: string[] } {
        const blocking = results.filter(r => !r.canProceed && r.severity === 'BLOCKING')
        return { allowed: blocking.length === 0, blockingGates: blocking.map(r => r.gate) }
    }

    // ─── Gate implementations ──────────────────────────────────────────────

    private async checkRiskGate(files: string[]): Promise<SafetyGateResult> {
        const fileNodes = this.getFileNodes(files)

        if (fileNodes.length === 0) {
            return this.pass('RISK_SCORE', 'No tracked functions in modified files')
        }

        const impact = this.analyzer.analyze(fileNodes.map(n => n.id))
        const risk = impact.riskScore

        if (risk >= 90) {
            return {
                canProceed: false,
                gate: 'RISK_SCORE',
                reason: `Critical risk score: ${risk}/100. Changes could break significant portions of the system.`,
                severity: 'BLOCKING',
                bypassable: false,
                autoFixable: false,
                suggestedFix: 'Break changes into smaller increments or add comprehensive tests',
            }
        }
        if (risk > this.config.maxRiskScore) {
            return {
                canProceed: false,
                gate: 'RISK_SCORE',
                reason: `High risk: ${risk}/100 exceeds threshold of ${this.config.maxRiskScore}`,
                severity: 'BLOCKING',
                bypassable: true,
                bypassCommand: 'mikk safety bypass --gate=RISK_SCORE --reason="<explanation>"',
                autoFixable: false,
            }
        }

        return this.pass('RISK_SCORE', `Risk score ${risk} within acceptable limits`)
    }

    private async checkScaleGate(files: string[]): Promise<SafetyGateResult> {
        const fileNodes = this.getFileNodes(files)

        if (fileNodes.length === 0) {
            return this.pass('IMPACT_SCALE', 'No tracked functions in modified files')
        }

        const impact = this.analyzer.analyze(fileNodes.map(n => n.id))
        const count = impact.impacted.length
        const hardLimit = this.config.maxImpactNodes * 2

        if (count > hardLimit) {
            return {
                canProceed: false,
                gate: 'IMPACT_SCALE',
                reason: `Massive blast radius: ${count} functions affected. Hard limit: ${hardLimit}`,
                severity: 'BLOCKING',
                bypassable: false,
                autoFixable: false,
                suggestedFix: 'Split into multiple PRs or create a migration plan',
            }
        }
        if (count > this.config.maxImpactNodes) {
            return {
                canProceed: false,
                gate: 'IMPACT_SCALE',
                reason: `Large impact: ${count} functions affected. Threshold: ${this.config.maxImpactNodes}`,
                severity: 'BLOCKING',
                bypassable: true,
                bypassCommand: 'mikk safety bypass --gate=IMPACT_SCALE --reason="<explanation>"',
                autoFixable: false,
            }
        }

        return this.pass('IMPACT_SCALE', `Impact scale acceptable: ${count} functions`)
    }

    private async checkProtectedModuleGate(files: string[]): Promise<SafetyGateResult> {
        const touchedProtected: string[] = []

        for (const file of files) {
            const norm = file.replace(/\\/g, '/')
            const fileEntry = Object.values(this.lock.files).find(
                f => f.path === norm || norm.endsWith(f.path),
            )
            // Guard: moduleId may be absent on file entries
            if (fileEntry?.moduleId && this.config.protectedModules.includes(fileEntry.moduleId)) {
                touchedProtected.push(fileEntry.moduleId)
            }
        }

        const unique = [...new Set(touchedProtected)]
        if (unique.length > 0) {
            return {
                canProceed: false,
                gate: 'PROTECTED_MODULE',
                reason: `Modified protected modules: ${unique.join(', ')}. These require architecture review.`,
                severity: 'BLOCKING',
                bypassable: false,
                autoFixable: false,
                suggestedFix: 'Request architecture review or schedule a change review meeting',
            }
        }

        return this.pass('PROTECTED_MODULE', 'No protected modules touched')
    }

    private async checkBreakingChangeGate(
        files: string[],
        context?: { commitMessage?: string; branchName?: string },
    ): Promise<SafetyGateResult> {
        const fileNodes = this.getFileNodes(files)

        // An exported function with callers is a breaking-change candidate
        const exportedWithCallers = fileNodes.filter(n => {
            const fn = this.lock.functions[n.id]
            return fn?.isExported && fn.calledBy.length > 0
        })

        if (exportedWithCallers.length === 0) {
            return this.pass('BREAKING_CHANGE', 'No exported API changes with existing callers detected')
        }

        const hasExplicitIntent =
            context?.commitMessage?.toLowerCase().includes('breaking:') ||
            context?.branchName?.toLowerCase().includes('breaking') ||
            context?.commitMessage?.toLowerCase().includes('api change')

        if (hasExplicitIntent) {
            return this.pass(
                'BREAKING_CHANGE',
                `Exported API changes (${exportedWithCallers.length} functions) with explicit breaking intent`,
            )
        }

        return {
            canProceed: false,
            gate: 'BREAKING_CHANGE',
            reason: `${exportedWithCallers.length} exported function(s) with callers modified without explicit intent marker. Add "BREAKING:" to commit message.`,
            severity: 'BLOCKING',
            bypassable: true,
            bypassCommand: 'git commit -m "BREAKING: <your message>"',
            autoFixable: false,
        }
    }

    private async checkTestCoverageGate(files: string[]): Promise<SafetyGateResult> {
        if (!this.config.requireTestsForChangedFiles) {
            return this.pass('TEST_COVERAGE', 'Test coverage gate disabled')
        }

        const fileNodes = this.getFileNodes(files)
        if (fileNodes.length === 0) return this.pass('TEST_COVERAGE', 'No tracked functions in modified files')

        const impact = this.analyzer.analyze(fileNodes.map(n => n.id))

        const highRisk = impact.impacted.filter(id => {
            const fn = this.lock.functions[id]
            return fn && (fn.calledBy.length > 10 || fn.isExported)
        })

        const hasTests = files.some(
            f => f.includes('.test.') || f.includes('.spec.') || f.includes('__tests__'),
        )

        if (highRisk.length > 0 && !hasTests) {
            return {
                canProceed: false,
                gate: 'TEST_COVERAGE',
                reason: `${highRisk.length} high-risk change(s) without test modifications`,
                severity: 'BLOCKING',
                bypassable: true,
                bypassCommand: 'mikk safety bypass --gate=TEST_COVERAGE',
                autoFixable: true,
                suggestedFix: 'Add tests for changed functions or affected call paths',
            }
        }

        return this.pass(
            'TEST_COVERAGE',
            hasTests ? 'Tests modified alongside changes' : 'No high-risk changes requiring tests',
        )
    }

    private async checkDocumentationGate(files: string[]): Promise<SafetyGateResult> {
        if (!this.config.requireDocumentationForApiChanges) {
            return this.pass('DOCUMENTATION', 'Documentation gate disabled')
        }

        const docFiles = ['README.md', 'API.md', 'CHANGELOG.md', 'AGENTS.md']
        const docsUpdated = files.some(f => docFiles.some(d => f.endsWith(d)))

        const fileNodes = this.getFileNodes(files)
        const hasSignificantApiChanges = fileNodes.some(n => {
            const fn = this.lock.functions[n.id]
            return fn?.isExported && fn.calledBy.length > 5
        })

        if (hasSignificantApiChanges && !docsUpdated) {
            return {
                canProceed: false,
                gate: 'DOCUMENTATION',
                reason: 'Significant API changes detected without documentation updates',
                severity: 'BLOCKING',
                bypassable: true,
                bypassCommand: 'mikk safety bypass --gate=DOCUMENTATION',
                autoFixable: false,
                suggestedFix: 'Update README.md, API.md, or AGENTS.md with the changes',
            }
        }

        return this.pass(
            'DOCUMENTATION',
            docsUpdated ? 'Documentation updated' : 'No significant API changes requiring docs',
        )
    }

    // ─── Helpers ───────────────────────────────────────────────────────────

    /** Collect graph-node IDs for every tracked function in the given files. */
    private getFileNodes(files: string[]): Array<{ id: string }> {
        const nodes: Array<{ id: string }> = []
        for (const file of files) {
            const norm = file.replace(/\\/g, '/')
            for (const fn of Object.values(this.lock.functions)) {
                if (fn.file === norm || fn.file.endsWith('/' + norm)) {
                    nodes.push({ id: fn.id })
                }
            }
        }
        return nodes
    }

    private pass(gate: string, reason: string): SafetyGateResult {
        return { canProceed: true, gate, reason, severity: 'WARNING', bypassable: true, autoFixable: false }
    }
}
