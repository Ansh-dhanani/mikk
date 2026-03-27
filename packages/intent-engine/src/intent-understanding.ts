import type { ImpactResult, MikkContract, MikkLock } from '@getmikk/core'

/**
 * IntentUnderstanding - Analyzes if breaking changes are intentional.
 *
 * Understands developer intent through:
 * 1. Explicit intent declarations ("REFACTOR:", "BREAKING:" in commit messages)
 * 2. Change pattern analysis (rename vs bugfix vs new feature)
 * 3. Context clues (branch name, PR description, file patterns)
 */
export interface IntentContext {
    commitMessage?: string
    branchName?: string
    prDescription?: string
    author?: string
    filesChanged: string[]
    changeType: 'refactor' | 'feature' | 'bugfix' | 'breaking' | 'unknown'
    confidence: number
}

export interface IntentAnalysis {
    isIntentionalBreakingChange: boolean
    confidence: number
    reasoning: string[]
    suggestedActions: string[]
    riskAcceptance: 'none' | 'low' | 'medium' | 'high'
}

export class IntentUnderstanding {
    constructor(private contract: MikkContract, private lock: MikkLock) {}

    /**
     * Analyze if breaking changes are intentional based on context.
     *
     * NOTE: `impact` is typed as ImpactResult. ClassifiedImpact nodes expose
     * `nodeId` (not `id` or `functionId`) — all node lookups use that field.
     */
    analyzeIntent(impact: ImpactResult, context: Partial<IntentContext> = {}): IntentAnalysis {
        const reasoning: string[] = []
        let confidence = 0.5
        let isIntentional = false
        let riskAcceptance: IntentAnalysis['riskAcceptance'] = 'none'

        // 1. Check explicit markers in commit message
        if (context.commitMessage) {
            const msg = context.commitMessage.toLowerCase()
            const breakingMarkers = ['breaking:', 'breaking change', 'refactor:', 'migration:', 'api change']
            const found = breakingMarkers.find(m => msg.includes(m))

            if (found) {
                isIntentional = true
                confidence += 0.3
                reasoning.push(`Explicit breaking change marker found: "${found}"`)
                riskAcceptance = 'high'
            }

            const safetyMarkers = ['fix:', 'hotfix:', 'patch:', 'bugfix:']
            if (safetyMarkers.some(m => msg.includes(m))) {
                confidence += 0.2
                reasoning.push('Safety fix detected — changes should be minimal and safe')
                if (riskAcceptance === 'none') riskAcceptance = 'low'
            }
        }

        // 2. Analyze branch naming patterns
        if (context.branchName) {
            const branch = context.branchName.toLowerCase()
            if (branch.includes('refactor') || branch.includes('breaking') || branch.includes('v2')) {
                isIntentional = true
                confidence += 0.2
                reasoning.push(`Branch name "${context.branchName}" suggests intentional restructuring`)
                if (riskAcceptance === 'none') riskAcceptance = 'medium'
            }
            if (branch.includes('hotfix') || branch.includes('patch')) {
                reasoning.push('Hotfix branch — expect minimal, safe changes')
                if (riskAcceptance === 'none') riskAcceptance = 'low'
            }
        }

        // 3. Analyze change patterns
        const changePattern = this.analyzeChangePattern(impact, context.filesChanged ?? [])
        if (changePattern.isRename) {
            isIntentional = true
            confidence += 0.15
            reasoning.push('Pattern suggests systematic rename/refactor')
        }
        if (changePattern.isSignatureChange) {
            reasoning.push('Function signature changes detected')
            if (!isIntentional) confidence -= 0.1
        }

        // 4. Check against contract migration policies
        const migrationPhase = this.detectMigrationPhase(impact)
        if (migrationPhase === 'planned') {
            isIntentional = true
            confidence += 0.25
            reasoning.push('Changes align with planned migration in contract')
            riskAcceptance = 'high'
        }

        // 5. Historical analysis
        if (context.author) {
            const pattern = this.analyzeAuthorPattern(context.author)
            if (pattern === 'careful') {
                confidence += 0.1
                reasoning.push(`${context.author} has history of careful, safe changes`)
            }
        }

        confidence = Math.max(0, Math.min(1, confidence))

        const suggestedActions = this.generateSuggestions(impact, isIntentional, confidence, riskAcceptance)

        return { isIntentionalBreakingChange: isIntentional, confidence, reasoning, suggestedActions, riskAcceptance }
    }

    // ─── Private helpers ───────────────────────────────────────────────────

    private detectMigrationPhase(impact: ImpactResult): 'none' | 'planned' {
        const decisions = this.contract.declared?.decisions ?? []

        for (const decision of decisions) {
            const text = `${decision.title ?? ''} ${decision.reason ?? ''}`.toLowerCase()
            if (!text.includes('migration') && !text.includes('deprecat')) continue

            // Use `nodeId` — the correct field on ClassifiedImpact
            const affectedModules = new Set<string>()
            for (const node of impact.allImpacted) {
                const fn = this.lock.functions[node.nodeId]
                if (fn?.moduleId) affectedModules.add(fn.moduleId)
            }

            const decisionModules = this.extractModulesFromDecision(`${decision.title ?? ''} ${decision.reason ?? ''}`)
            if ([...affectedModules].some(m => decisionModules.includes(m))) return 'planned'
        }

        return 'none'
    }

    private extractModulesFromDecision(decision: string): string[] {
        const modules = this.contract.declared?.modules ?? []
        const mentioned: string[] = []
        for (const mod of modules) {
            if (
                decision.toLowerCase().includes(mod.id.toLowerCase()) ||
                decision.toLowerCase().includes(mod.name.toLowerCase())
            ) {
                mentioned.push(mod.id)
            }
        }
        return mentioned
    }

    private analyzeChangePattern(
        impact: ImpactResult,
        filesChanged: string[],
    ): { isRename: boolean; isSignatureChange: boolean; isNewFeature: boolean } {
        const result = { isRename: false, isSignatureChange: false, isNewFeature: false }

        const lockFilePaths = new Set(Object.keys(this.lock.files))
        const norm = (f: string) => f.replace(/\\/g, '/')
        const deletedFiles = filesChanged.filter(f => !lockFilePaths.has(norm(f)))
        const addedFiles   = filesChanged.filter(f =>  lockFilePaths.has(norm(f)))

        if (deletedFiles.length > 0 && addedFiles.length > 0) {
            for (const deleted of deletedFiles) {
                const base = deleted.split('/').pop()?.split('.')[0]
                if (base && addedFiles.some(a => norm(a).includes(base))) {
                    result.isRename = true
                    break
                }
            }
        }

        // Use `nodeId` — correct field on ClassifiedImpact
        for (const node of impact.allImpacted) {
            const fn = this.lock.functions[node.nodeId]
            if (fn?.params && fn.params.length > 0) {
                result.isSignatureChange = true
                break
            }
        }

        const newExports = filesChanged.flatMap(file => {
            const n = norm(file)
            return Object.values(this.lock.functions).filter(
                f => (f.file === n || f.file.endsWith('/' + n)) && f.isExported && f.calledBy.length === 0,
            )
        })
        if (newExports.length > 3) result.isNewFeature = true

        return result
    }

    private analyzeAuthorPattern(_author: string): 'careful' | 'normal' | 'aggressive' {
        return 'normal'
    }

    private generateSuggestions(
        impact: ImpactResult,
        isIntentional: boolean,
        confidence: number,
        riskAcceptance: IntentAnalysis['riskAcceptance'],
    ): string[] {
        const out: string[] = []

        if (isIntentional && confidence > 0.7) {
            out.push('✓ Breaking change appears intentional — proceeding with caution')
            if (impact.impacted.length > 10) out.push('Consider breaking this into smaller PRs for easier review')
            out.push('Ensure tests exist for all impacted call paths')
            out.push('Update relevant documentation for API changes')
            if (riskAcceptance === 'high') out.push('Schedule deployment during low-traffic period')
        } else if (impact.riskScore > 80) {
            out.push('⚠ HIGH RISK: Breaking changes without explicit intent detected')
            out.push('Add "BREAKING:" prefix to commit message if intentional')
            out.push('Run full test suite before committing')
            out.push('Consider creating a migration guide for consumers')
        } else if (impact.impacted.length > 5) {
            out.push('Review impacted functions to ensure changes are necessary')
            out.push('Check if any changes can be made backward-compatible')
        } else {
            out.push('Changes appear low-risk — standard review process recommended')
        }

        return out
    }
}
