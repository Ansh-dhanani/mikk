import type { ImpactResult, MikkLock } from '@getmikk/core'
import type { DecisionResult, Explanation } from './types.js'

/**
 * ExplanationEngine — generates human-readable reasoning for code modification decisions.
 * Explains WHY a change is safe or risky based on the quantitative graph analysis.
 */
export class ExplanationEngine {
    /**
     * @param lock  Optional lock reference — used to resolve module names accurately.
     *              If omitted, module count is estimated from file paths.
     */
    constructor(private lock?: MikkLock) {}

    explain(impact: ImpactResult, decision: DecisionResult): Explanation {
        return {
            summary:       this.getSummary(decision),
            details:       this.getDetails(impact, decision),
            riskBreakdown: this.getRiskBreakdown(impact),
        }
    }

    private getSummary(decision: DecisionResult): string {
        switch (decision.status) {
            case 'APPROVED': return 'This change is safe and conforms to project policies.'
            case 'WARNING':  return 'Change detected with non-trivial impact — proceed with caution.'
            case 'BLOCKED':  return 'MODIFICATION BLOCKED: This change violates safety or architectural policies.'
        }
    }

    private getDetails(impact: ImpactResult, decision: DecisionResult): string[] {
        const details: string[] = []

        if (impact.allImpacted.length === 0) {
            details.push('No downstream symbols are affected by this change.')
        } else {
            details.push(`Affects ${impact.allImpacted.length} symbols across ${this.countModules(impact)} modules.`)
            details.push(`Maximum risk score is ${impact.riskScore}/100.`)
        }

        if (impact.classified.critical.length > 0) {
            details.push(`⚠ Critical: affects ${impact.classified.critical.length} symbol(s) in separate modules.`)
        }

        for (const r of decision.reasons) {
            details.push(`Policy: ${r}`)
        }

        return details
    }

    private getRiskBreakdown(impact: ImpactResult): { symbol: string; reason: string; score: number }[] {
        return [...impact.allImpacted]
            .sort((a, b) => b.riskScore - a.riskScore)
            .slice(0, 3)
            .map(node => ({
                symbol: node.label,
                score:  node.riskScore,
                reason: this.getRiskReason(node.riskScore),
            }))
    }

    private getRiskReason(score: number): string {
        if (score >= 90) return 'Direct critical dependency in protected module'
        if (score >= 80) return 'Large downstream reach (potential side effects)'
        if (score >= 60) return 'Cross-module propagation'
        return 'Standard functional dependency'
    }

    /**
     * Count distinct modules touched by the impact set.
     *
     * Preference order:
     *  1. lock.functions[nodeId].moduleId  — accurate
     *  2. heuristic from file path         — fallback when lock is absent
     */
    private countModules(impact: ImpactResult): number {
        const modules = new Set<string>()

        for (const node of impact.allImpacted) {
            let moduleId: string | undefined

            // Try to resolve via lock first
            if (this.lock) {
                moduleId = this.lock.functions[node.nodeId]?.moduleId
            }

            if (!moduleId) {
                // Fallback: first meaningful path segment after stripping common prefixes
                const parts = node.file.replace(/\\/g, '/').split('/')
                const segIdx = parts.findIndex(p => p !== 'src' && p !== 'packages' && p !== 'apps')
                moduleId = segIdx >= 0 ? parts[segIdx] : (parts[0] ?? 'root')
            }

            modules.add(moduleId)
        }

        return modules.size
    }
}
