import type { MikkContract, MikkLock, DependencyGraph, ImpactResult } from '@getmikk/core'
import { ImpactAnalyzer } from '@getmikk/core'
import { IntentUnderstanding, type IntentContext } from './intent-understanding.js'
import { AutoCorrectionEngine } from './auto-correction.js'
import { EnforcedSafetyGates, type SafetyGateConfig } from './enforced-safety.js'

/**
 * PreEditValidation — intercepts edits before they are applied.
 *
 * Combines:
 *  1. Intent understanding  (is this intentional?)
 *  2. Real impact analysis  (what breaks?)
 *  3. Auto-correction       (can we fix issues automatically?)
 *  4. Safety gates          (should we block this?)
 *
 * This is the single entry point for mikk_before_edit.
 */
export interface EditProposal {
    files: string[]
    description: string
    author: string
    intent?: Partial<IntentContext>
}

export interface ValidationResult {
    allowed: boolean
    confidence: number

    intent: {
        isIntentionalBreakingChange: boolean
        confidence: number
        reasoning: string[]
        riskAcceptance: 'none' | 'low' | 'medium' | 'high'
    }

    impact: {
        totalFiles: number
        totalFunctions: number
        riskScore: number
        criticalPaths: string[]
        blastRadius: string[]
    }

    gates: Array<{
        name: string
        passed: boolean
        severity: 'BLOCKING' | 'WARNING'
        message: string
        bypassable: boolean
    }>

    corrections: {
        available: boolean
        issuesFound: number
        autoFixable: number
        applied: string[]
        suggested: string[]
    }

    recommendations: string[]
    nextSteps: string[]
    tokenSavings: number
}

export class PreEditValidation {
    private intentEngine: IntentUnderstanding
    private autoCorrection: AutoCorrectionEngine
    private safetyGates: EnforcedSafetyGates
    private impactAnalyzer: ImpactAnalyzer

    constructor(
        private contract: MikkContract,
        private lock: MikkLock,
        graph: DependencyGraph,
        private projectRoot: string,
        safetyConfig?: Partial<SafetyGateConfig>,
    ) {
        this.intentEngine   = new IntentUnderstanding(contract, lock)
        this.impactAnalyzer = new ImpactAnalyzer(graph)

        // Build protected modules list from constraints that mention "protected".
        // Constraints may be strings OR objects — guard both cases.
        const protectedModules = (contract.declared?.constraints ?? [])
            .filter(c => {
                if (typeof c === 'string') return c.toLowerCase().includes('protected')
                return false // object-style constraints don't auto-map to module names
            })
            .flatMap(c => {
                const parts = (c as string).split('::')
                return parts[0] ? [parts[0]] : []
            })

        const defaultConfig: SafetyGateConfig = {
            enforceOnSave: true,
            enforceOnCommit: true,
            enforceInCI: true,
            maxRiskScore: 70,
            maxImpactNodes: 10,
            requireTestsForChangedFiles: true,
            requireDocumentationForApiChanges: true,
            protectedModules,
        }

        this.safetyGates   = new EnforcedSafetyGates(contract, lock, graph, { ...defaultConfig, ...safetyConfig })
        this.autoCorrection = new AutoCorrectionEngine(contract, lock, graph, projectRoot)
    }

    /** Main validation method — call this BEFORE any edit. */
    async validate(proposal: EditProposal): Promise<ValidationResult> {
        const { files } = proposal

        // 1. Real impact analysis from the graph
        const fileNodeIds = this.collectFileNodeIds(files)
        const impact = fileNodeIds.length > 0
            ? this.impactAnalyzer.analyze(fileNodeIds)
            : this.emptyImpact(files)

        // 2. Intent analysis — receives the real ImpactResult so field shapes match
        const intentAnalysis = this.intentEngine.analyzeIntent(impact, {
            commitMessage: proposal.intent?.commitMessage,
            branchName:    proposal.intent?.branchName,
            author:        proposal.author,
            filesChanged:  files,
            changeType:    this.inferChangeType(proposal),
            confidence:    0.7,
        })

        // 3. Safety gates
        const gateResults = await this.safetyGates.validateEdits(files, {
            commitMessage: proposal.intent?.commitMessage,
            branchName:    proposal.intent?.branchName,
        })

        // 4. Auto-correction
        const corrections = await this.autoCorrection.analyzeAndFix(files)

        // 5. Allowed?
        const { allowed, blockingGates } = this.safetyGates.canProceed(gateResults)

        // 6. Recommendations
        const recommendations = this.buildRecommendations(intentAnalysis, impact, gateResults, corrections)

        // 7. Token savings estimate
        const tokenSavings = this.calculateTokenSavings(files, impact)

        // 8. Impact summary for the response
        const impactSummary = this.summariseImpact(files, impact)

        return {
            allowed,
            confidence: intentAnalysis.confidence,

            intent: {
                isIntentionalBreakingChange: intentAnalysis.isIntentionalBreakingChange,
                confidence: intentAnalysis.confidence,
                reasoning:  intentAnalysis.reasoning,
                riskAcceptance: intentAnalysis.riskAcceptance,
            },

            impact: impactSummary,

            gates: gateResults.map(g => ({
                name:      g.gate,
                passed:    g.canProceed,
                severity:  g.severity,
                message:   g.reason,
                bypassable: g.bypassable,
            })),

            corrections: {
                available:   corrections.issues.length > 0,
                issuesFound: corrections.issues.length,
                autoFixable: corrections.appliedFixes.length,
                applied:     corrections.appliedFixes.slice(0, 5),
                suggested:   corrections.issues
                    .filter(i => !i.autoFixable)
                    .map(i => `${i.file}:${i.line} — ${i.message}`)
                    .slice(0, 5),
            },

            recommendations,

            nextSteps: allowed
                ? ['Proceed with edit', 'Run tests after changes']
                : [
                    `Address blocking gates: ${blockingGates.join(', ')}`,
                    ...gateResults
                        .filter(g => !g.canProceed && g.suggestedFix)
                        .map(g => g.suggestedFix!)
                        .slice(0, 3),
                ],

            tokenSavings,
        }
    }

    // ─── Private helpers ────────────────────────────────────────────────────

    /** Collect graph IDs for every tracked function in the given files. */
    private collectFileNodeIds(files: string[]): string[] {
        const ids: string[] = []
        for (const file of files) {
            const norm = file.replace(/\\/g, '/')
            for (const fn of Object.values(this.lock.functions)) {
                if (fn.file === norm || fn.file.endsWith('/' + norm)) ids.push(fn.id)
            }
        }
        return ids
    }

    /** Build a zero-impact result when no tracked functions exist. */
    private emptyImpact(_files: string[]): ImpactResult {
        return {
            changed:        [],
            impacted:       [],
            allImpacted:    [],
            depth:          0,
            entryPoints:    [],
            criticalModules: [],
            paths:          [],
            confidence:     1.0,
            riskScore:      0,
            classified:     { critical: [], high: [], medium: [], low: [] },
        }
    }

    private summariseImpact(files: string[], impact: ImpactResult) {
        const fileFunctions = this.collectFileNodeIds(files)
            .map(id => this.lock.functions[id])
            .filter(Boolean)

        const criticalPaths = fileFunctions
            .filter(f => f.calledBy.length > 10)
            .map(f => `${f.moduleId}::${f.name}`)
            .slice(0, 5)

        const blastRadius = [...new Set(
            fileFunctions
                .flatMap(f => f.calledBy)
                .map(id => this.lock.functions[id])
                .filter(Boolean)
                .map(f => `${f.moduleId}::${f.name}`),
        )].slice(0, 10)

        return {
            totalFiles:     files.length,
            totalFunctions: fileFunctions.length,
            riskScore:      impact.riskScore,
            criticalPaths,
            blastRadius,
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private buildRecommendations(intent: any, impact: ImpactResult, gates: any[], corrections: any): string[] {
        const recs: string[] = []

        if (intent.isIntentionalBreakingChange && intent.confidence > 0.7) {
            recs.push('✓ Breaking change appears intentional — ensure migration guide exists')
        }
        if (impact.riskScore > 70) {
            recs.push('⚠ High risk — consider breaking into smaller changes')
        }

        const summaryImpact = this.summariseImpact([], impact)
        if (summaryImpact.criticalPaths.length > 0) {
            recs.push(`Critical paths affected: ${summaryImpact.criticalPaths.join(', ')}`)
        }

        const warnings = gates.filter(g => g.severity === 'WARNING' && !g.canProceed)
        if (warnings.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            recs.push(`Address warnings: ${warnings.map((w: any) => w.gate).join(', ')}`)
        }
        if (corrections.issues.length > 0) {
            recs.push(`Found ${corrections.issues.length} issue(s) — ${corrections.appliedFixes.length} auto-fixed`)
        }

        return recs
    }

    private calculateTokenSavings(files: string[], impact: ImpactResult): number {
        // Naive estimate: without Mikk the AI reads all impacted + changed files
        const fileCount = impact.impacted.length + files.length
        const naiveCost = fileCount * 500
        return Math.max(0, naiveCost - 500) // 500 tokens for the validation result itself
    }

    private inferChangeType(proposal: EditProposal): IntentContext['changeType'] {
        const desc = `${proposal.description} ${proposal.intent?.commitMessage ?? ''}`.toLowerCase()
        if (desc.includes('refactor') || desc.includes('restructure')) return 'refactor'
        if (desc.includes('feat') || desc.includes('add') || desc.includes('new')) return 'feature'
        if (desc.includes('fix') || desc.includes('bug') || desc.includes('patch')) return 'bugfix'
        if (desc.includes('breaking') || desc.includes('api change')) return 'breaking'
        return 'unknown'
    }
}
