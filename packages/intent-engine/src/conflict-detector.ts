import type { MikkContract } from '@mikk/core'
import type { Intent, ConflictResult, Conflict } from './types.js'

/**
 * ConflictDetector — checks candidate intents against declared
 * constraints and module boundaries. Catches violations early.
 */
export class ConflictDetector {
    constructor(
        private contract: MikkContract
    ) { }

    /** Check all intents for conflicts */
    detect(intents: Intent[]): ConflictResult {
        const conflicts: Conflict[] = []

        for (const intent of intents) {
            // Check constraint violations
            for (const constraint of this.contract.declared.constraints) {
                if (this.violatesConstraint(intent, constraint)) {
                    conflicts.push({
                        type: 'constraint-violation',
                        severity: 'error',
                        message: `Intent "${intent.action} ${intent.target.name}" violates constraint: ${constraint}`,
                        relatedIntent: intent,
                        suggestedFix: `Modify the action to comply with: ${constraint}`,
                    })
                }
            }

            // Check boundary crossings
            if (intent.target.moduleId && intent.action === 'move') {
                conflicts.push({
                    type: 'boundary-crossing',
                    severity: 'warning',
                    message: `Moving ${intent.target.name} will cross module boundary from ${intent.target.moduleId}`,
                    relatedIntent: intent,
                })
            }
        }

        return {
            hasConflicts: conflicts.length > 0,
            conflicts,
        }
    }

    private violatesConstraint(intent: Intent, constraint: string): boolean {
        // Simple heuristic — check if the constraint mentions a forbidden area
        const constraintLower = constraint.toLowerCase()
        const filePath = intent.target.filePath?.toLowerCase() || ''

        if (constraintLower.includes('no direct') && constraintLower.includes('outside')) {
            // Extract the restricted area from the constraint
            const match = constraintLower.match(/outside\s+(\S+)/)
            if (match) {
                const restrictedArea = match[1].replace(/[/]/g, '')
                const targetArea = intent.target.moduleId || ''
                if (targetArea && targetArea !== restrictedArea) {
                    return true
                }
            }
        }

        return false
    }
}
