import type { ImpactResult } from '@getmikk/core'
import type { DecisionResult, Explanation } from './types.js'

/**
 * ExplanationEngine — generates human-readable reasoning for code modification decisions.
 * Explains WHY a change is safe or risky based on the quantitative graph analysis.
 */
export class ExplanationEngine {
    /**
     * Generate an explanation for the decision and impact.
     */
    explain(impact: ImpactResult, decision: DecisionResult): Explanation {
        const summary = this.getSummary(decision);
        const details = this.getDetails(impact, decision);
        const riskBreakdown = this.getRiskBreakdown(impact);

        return {
            summary,
            details,
            riskBreakdown
        };
    }

    private getSummary(decision: DecisionResult): string {
        switch (decision.status) {
            case 'APPROVED': return 'This change is safe and conforms to project policies.';
            case 'WARNING': return 'Change detected with non-trivial impact — proceed with caution.';
            case 'BLOCKED': return 'MODIFICATION BLOCKED: This change violates safety or architectural policies.';
        }
    }

    private getDetails(impact: ImpactResult, decision: DecisionResult): string[] {
        const details: string[] = [];

        if (impact.allImpacted.length === 0) {
            details.push('No downstream symbols are affected by this change.');
        } else {
            details.push(`Affects ${impact.allImpacted.length} symbols across ${this.countModules(impact)} modules.`);
            details.push(`Maximum risk score is ${impact.riskScore}/100.`);
        }

        if (impact.classified.critical.length > 0) {
            details.push(`⚠ Critical: affects ${impact.classified.critical.length} symbols in separate modules.`);
        }

        if (decision.reasons.length > 0) {
            decision.reasons.forEach(r => details.push(`Policy: ${r}`));
        }

        return details;
    }

    private getRiskBreakdown(impact: ImpactResult): { symbol: string; reason: string; score: number }[] {
        // Return top 3 riskiest affected symbols
        return impact.allImpacted
            .sort((a, b) => b.riskScore - a.riskScore)
            .slice(0, 3)
            .map(node => ({
                symbol: node.label,
                score: node.riskScore,
                reason: this.getRiskReason(node.riskScore)
            }));
    }

    private getRiskReason(score: number): string {
        if (score >= 90) return 'Direct critical dependency in protected module';
        if (score >= 80) return 'Large downstream reach (potential side effects)';
        if (score >= 60) return 'Cross-module propagation';
        return 'Standard functional dependency';
    }

    private countModules(impact: ImpactResult): number {
        const modules = new Set(impact.allImpacted.map(n => {
            // Heuristic to extract module from file path if moduleId not present
            const parts = n.file.split('/');
            return parts.length > 1 ? parts[0] : 'root';
        }));
        return modules.size;
    }
}
