import type { ImpactResult, MikkContract } from '@getmikk/core'
import type { DecisionResult, DecisionStatus } from './types.js'

/**
 * DecisionEngine — evaluates quantitative impact analysis against project policies.
 *
 * Policies live in contract.policies (all optional with safe defaults):
 *   - maxRiskScore       (default 70)  — WARNING above, BLOCKED at ≥ 90
 *   - maxImpactNodes     (default 10)  — WARNING/BLOCKED when exceeded
 *   - protectedModules   (default [])  — BLOCKED if a CRITICAL/HIGH-risk node's
 *                                        file path matches a protected module name
 *   - enforceStrictBoundaries (false)  — BLOCKED on any critical cross-module hit
 */
export class DecisionEngine {
    constructor(private contract: MikkContract) {}

    evaluate(impact: ImpactResult): DecisionResult {
        const policy = {
            maxRiskScore:            this.contract.policies?.maxRiskScore           ?? 70,
            maxImpactNodes:          this.contract.policies?.maxImpactNodes         ?? 10,
            protectedModules:        this.contract.policies?.protectedModules       ?? [] as string[],
            enforceStrictBoundaries: this.contract.policies?.enforceStrictBoundaries ?? false,
        }

        const reasons: string[] = []
        let status: DecisionStatus = 'APPROVED'
        const promote = (next: DecisionStatus) => {
            if (next === 'BLOCKED' || (next === 'WARNING' && status === 'APPROVED')) status = next
        }

        // 1. Absolute risk threshold
        if (impact.riskScore >= 90) {
            promote('BLOCKED')
            reasons.push(`Critical risk detected (${impact.riskScore}/100). Changes exceeding 90 are always blocked.`)
        } else if (impact.riskScore > policy.maxRiskScore) {
            promote('WARNING')
            reasons.push(`High risk (${impact.riskScore}) exceeds policy threshold of ${policy.maxRiskScore}.`)
        }

        // 2. Impact scale
        if (impact.impacted.length > policy.maxImpactNodes) {
            promote('WARNING')
            reasons.push(`Impact spread (${impact.impacted.length} symbols) exceeds limit of ${policy.maxImpactNodes}.`)
        }

        // 3. Protected modules
        // allImpacted entries are ClassifiedImpact objects — they have `nodeId`
        // and `riskScore` (numeric), NOT a `.risk` string field.
        const touched = new Set<string>()
        for (const node of impact.allImpacted) {
            // Only act on nodes above the HIGH threshold (riskScore ≥ 60)
            if (node.riskScore < 60) continue
            for (const pm of policy.protectedModules) {
                if (node.file.toLowerCase().includes(pm.toLowerCase())) {
                    touched.add(pm)
                }
            }
        }
        if (touched.size > 0) {
            promote('WARNING')
            reasons.push(`Change affects protected modules: ${[...touched].join(', ')}.`)
        }

        // 4. Strict boundary enforcement
        if (policy.enforceStrictBoundaries && impact.classified.critical.length > 0) {
            promote('BLOCKED')
            reasons.push(
                `Strict boundary enforcement: ${impact.classified.critical.length} critical cross-module impact(s) detected.`,
            )
        }

        return { status, reasons, riskScore: impact.riskScore, impactNodes: impact.impacted.length }
    }
}
