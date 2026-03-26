import type { ImpactResult, MikkContract } from '@getmikk/core'
import type { DecisionResult, DecisionStatus } from './types.js'

/**
 * DecisionEngine — the "Brain" of Mikk 2.0.
 * Evaluates quantitative impact analysis against project policies.
 */
export class DecisionEngine {
    constructor(private contract: MikkContract) {}

    /**
     * Evaluate an impact result against the defined policies.
     */
    evaluate(impact: ImpactResult): DecisionResult {
        const policy = {
            maxRiskScore: this.contract.policies?.maxRiskScore ?? 70,
            maxImpactNodes: this.contract.policies?.maxImpactNodes ?? 10,
            protectedModules: this.contract.policies?.protectedModules ?? [],
            enforceStrictBoundaries: this.contract.policies?.enforceStrictBoundaries ?? false,
        };
        const reasons: string[] = [];
        let status: DecisionStatus = 'APPROVED';

        const maxRisk = impact.riskScore;
        const impactCount = impact.impacted.length;

        // 1. Check absolute risk threshold
        if (maxRisk >= 90) {
            status = 'BLOCKED';
            reasons.push(`Critical risk detected (${maxRisk}/100). Policy strictly blocks changes exceeding 90 risk.`);
        } else if (maxRisk > policy.maxRiskScore) {
            status = 'WARNING';
            reasons.push(`High risk (${maxRisk}) exceeds policy threshold of ${policy.maxRiskScore}.`);
        }

        // 2. Check impact scale
        if (impactCount > policy.maxImpactNodes) {
             status = status === 'BLOCKED' ? 'BLOCKED' : 'WARNING';
             reasons.push(`Impact spread (${impactCount} symbols) exceeds propagation limit of ${policy.maxImpactNodes}.`);
        }

        // 3. Check protected modules
        const touchedProtectedModules = impact.allImpacted
            .filter(node => node.risk === 'CRITICAL' || node.risk === 'HIGH')
            .map(node => {
                return policy.protectedModules.find(pm => node.file.toLowerCase().includes(pm.toLowerCase()));
            })
            .filter((m): m is string => !!m);

        const uniqueProtected = [...new Set(touchedProtectedModules)];
        if (uniqueProtected.length > 0) {
            status = status === 'BLOCKED' ? 'BLOCKED' : 'WARNING';
            reasons.push(`Change affects protected modules: ${uniqueProtected.join(', ')}.`);
        }

        // 4. Force BLOCKED for critical cross-boundary impacts if enforcement is on
        if (policy.enforceStrictBoundaries && impact.classified.critical.length > 0) {
            status = 'BLOCKED';
            reasons.push(`Strict boundary enforcement: ${impact.classified.critical.length} critical cross-module impact(s) detected.`);
        }

        return {
            status,
            reasons,
            riskScore: maxRisk,
            impactNodes: impactCount
        };
    }
}
