import type { MikkContract, MikkLock } from '@getmikk/core'
import type { Intent, ConflictResult, Conflict } from './types.js'

/**
 * Constraint types — classifies constraints for rule-based checking per Section 5.
 * Rule-based matching is fast and doesn't require AI calls.
 */
type ConstraintType =
    | 'no-import'   // "No direct DB access outside db/"
    | 'must-use'    // "All auth must go through auth.middleware"
    | 'no-call'     // "Never call setTimeout in the payment flow"
    | 'layer'       // "Controllers cannot import from repositories directly"
    | 'naming'      // "All exported functions must be camelCase"
    | 'complex'     // Everything else

/**
 * ConflictDetector — checks candidate intents against declared
 * constraints and module boundaries. Uses rule-based pattern matching
 * per spec Section 5 — no AI calls for deterministic constraint types.
 */
export class ConflictDetector {
    constructor(
        private contract: MikkContract,
        private lock?: MikkLock
    ) { }

    /** Check all intents for conflicts */
    detect(intents: Intent[]): ConflictResult {
        const conflicts: Conflict[] = []

        for (const intent of intents) {
            // Check constraint violations
            for (const constraint of this.contract.declared.constraints) {
                const conflict = this.checkConstraint(intent, constraint)
                if (conflict) {
                    conflicts.push(conflict)
                }
            }

            // Check boundary crossings for move/refactor actions
            if (intent.target.moduleId && (intent.action === 'move' || intent.action === 'refactor')) {
                // Check if the target module exists
                const moduleExists = this.contract.declared.modules.some(
                    m => m.id === intent.target.moduleId
                )
                if (intent.action === 'move') {
                    conflicts.push({
                        type: 'boundary-crossing',
                        severity: 'warning',
                        message: `Moving ${intent.target.name} will cross module boundary from ${intent.target.moduleId}`,
                        relatedIntent: intent,
                        suggestedFix: moduleExists
                            ? `Ensure all callers of ${intent.target.name} are updated after the move`
                            : `Module "${intent.target.moduleId}" not found — check mikk.json`,
                    })
                }
            }

            // Check for missing dependency: does the target exist in the lock?
            if (this.lock && intent.action === 'modify') {
                const fnExists = Object.values(this.lock.functions).some(
                    f => f.name === intent.target.name
                )
                const fileExists = intent.target.filePath
                    ? !!this.lock.files[intent.target.filePath]
                    : true
                if (!fnExists && intent.target.type === 'function') {
                    conflicts.push({
                        type: 'missing-dependency',
                        severity: 'warning',
                        message: `Function "${intent.target.name}" not found in lock file — it may not exist yet`,
                        relatedIntent: intent,
                        suggestedFix: `Did you mean "create" instead of "modify"?`,
                    })
                }
                if (!fileExists) {
                    conflicts.push({
                        type: 'missing-dependency',
                        severity: 'warning',
                        message: `File "${intent.target.filePath}" not found in lock file`,
                        relatedIntent: intent,
                    })
                }
            }

            // Ownership check: warn if modifying a module with explicit owners
            if (intent.target.moduleId) {
                const module = this.contract.declared.modules.find(
                    m => m.id === intent.target.moduleId
                )
                if (module?.owners && module.owners.length > 0) {
                    conflicts.push({
                        type: 'ownership-conflict',
                        severity: 'warning',
                        message: `Module "${module.name}" has designated owners: ${module.owners.join(', ')}`,
                        relatedIntent: intent,
                        suggestedFix: `Coordinate with ${module.owners[0]} before modifying this module`,
                    })
                }
            }
        }

        return {
            hasConflicts: conflicts.some(c => c.severity === 'error'),
            conflicts,
        }
    }

    // ── Constraint Classification & Checking ─────────────────────

    private classifyConstraint(text: string): ConstraintType {
        const lower = text.toLowerCase()
        if (lower.includes('no direct') || lower.includes('cannot import') ||
            lower.includes('must not import')) return 'no-import'
        if (lower.includes('must go through') || lower.includes('must use') ||
            lower.includes('required')) return 'must-use'
        if (lower.includes('never call') || lower.includes('do not call')) return 'no-call'
        if (lower.includes('cannot import from') || lower.includes('layer')) return 'layer'
        if (lower.includes('must be') && (lower.includes('case') || lower.includes('named')))
            return 'naming'
        return 'complex'
    }

    private checkConstraint(intent: Intent, constraint: string): Conflict | null {
        const type = this.classifyConstraint(constraint)
        switch (type) {
            case 'no-import': return this.checkNoImport(constraint, intent)
            case 'must-use': return this.checkMustUse(constraint, intent)
            case 'no-call': return this.checkNoCall(constraint, intent)
            case 'layer': return this.checkLayer(constraint, intent)
            case 'naming': return this.checkNaming(constraint, intent)
            case 'complex': return this.checkComplex(constraint, intent)
        }
    }

    /** "No direct DB access outside db/" */
    private checkNoImport(constraint: string, intent: Intent): Conflict | null {
        const match = constraint.match(/no direct (\w+) (?:access|import) outside (.+)/i)
        if (!match) {
            // Fallback: "X cannot import Y" pattern
            const alt = constraint.match(/(\w+) (?:cannot|must not) import (?:from )?(\w+)/i)
            if (!alt) return null
            const [, source, target] = alt
            if (intent.target.moduleId?.toLowerCase().includes(target.toLowerCase())) {
                return this.makeConflict(constraint, intent, 'error',
                    `Intent targets ${intent.target.moduleId} which conflicts with import restriction on ${target}`,
                    `Use the ${source} module's public API instead`)
            }
            return null
        }

        const [, _accessType, allowedPath] = match
        const allowed = allowedPath.trim().replace(/[/\\*]*/g, '')
        const targetModule = intent.target.moduleId || ''

        // If the intent's target is outside the allowed area and touches restricted module
        if (targetModule && !targetModule.toLowerCase().includes(allowed.toLowerCase())) {
            return this.makeConflict(constraint, intent, 'error',
                `Intent "${intent.action} ${intent.target.name}" in module "${targetModule}" accesses a restricted area. Only "${allowed}" modules may access this.`,
                `Route through the ${allowed} module's public API`)
        }
        return null
    }

    /** "All auth must go through auth.middleware" */
    private checkMustUse(constraint: string, intent: Intent): Conflict | null {
        const match = constraint.match(/all (\w+) must (?:go through|use) (.+)/i)
        if (!match) return null
        const [, domain, requiredFn] = match

        // Check if the intent touches this domain
        const targetLower = intent.target.name.toLowerCase()
        const moduleLower = intent.target.moduleId?.toLowerCase() || ''
        if (!targetLower.includes(domain.toLowerCase()) &&
            !moduleLower.includes(domain.toLowerCase())) {
            return null
        }

        // If creating or modifying in this domain, warn about required function
        if (intent.action === 'create' || intent.action === 'modify') {
            return this.makeConflict(constraint, intent, 'warning',
                `${intent.action} in the "${domain}" domain requires using ${requiredFn.trim()}`,
                `Ensure ${requiredFn.trim()} is called in the ${intent.target.name} flow`)
        }
        return null
    }

    /** "Never call setTimeout in the payment flow" */
    private checkNoCall(constraint: string, intent: Intent): Conflict | null {
        const match = constraint.match(/(?:never|do not) call (\w+)(?: in (?:the )?(.+))?/i)
        if (!match) return null
        const [, forbiddenCall, contextArea] = match

        // If a context area is specified, only check intents in that area
        if (contextArea) {
            const area = contextArea.trim().replace(/\s*flow$/i, '')
            const intentModule = intent.target.moduleId?.toLowerCase() || ''
            const intentName = intent.target.name.toLowerCase()
            if (!intentModule.includes(area.toLowerCase()) &&
                !intentName.includes(area.toLowerCase())) {
                return null
            }
        }

        // Warn if creating code that might use the forbidden function
        if (intent.action === 'create' || intent.action === 'modify') {
            return this.makeConflict(constraint, intent, 'warning',
                `Ensure "${forbiddenCall}" is not called in this context`,
                `Avoid using ${forbiddenCall} — see constraint: "${constraint}"`)
        }
        return null
    }

    /** "Controllers cannot import from repositories directly" */
    private checkLayer(constraint: string, intent: Intent): Conflict | null {
        const match = constraint.match(/(\w+) cannot import (?:from )?(\w+)/i)
        if (!match) return null
        const [, sourceLayer, targetLayer] = match

        const intentModule = intent.target.moduleId?.toLowerCase() || ''
        if (intentModule.includes(sourceLayer.toLowerCase()) &&
            (intent.action === 'create' || intent.action === 'modify')) {
            return this.makeConflict(constraint, intent, 'warning',
                `${sourceLayer} layer should not import directly from ${targetLayer}`,
                `Use an intermediate service layer between ${sourceLayer} and ${targetLayer}`)
        }
        return null
    }

    /** "All exported functions must be camelCase" */
    private checkNaming(constraint: string, intent: Intent): Conflict | null {
        if (intent.action !== 'create') return null

        const name = intent.target.name
        if (constraint.toLowerCase().includes('camelcase')) {
            // Check if name starts with lowercase and has no underscores/hyphens
            if (!/^[a-z][a-zA-Z0-9]*$/.test(name) && name.length > 0) {
                return this.makeConflict(constraint, intent, 'warning',
                    `Name "${name}" does not follow camelCase convention`,
                    `Rename to ${this.toCamelCase(name)}`)
            }
        }
        return null
    }

    /** Complex constraints — keyword overlap heuristic (no AI call) */
    private checkComplex(constraint: string, intent: Intent): Conflict | null {
        const constraintWords = this.extractKeywords(constraint)
        const intentWords = [
            ...this.extractKeywords(intent.target.name),
            ...this.extractKeywords(intent.reason)
        ]
        const overlap = constraintWords.filter(w =>
            intentWords.some(iw => iw === w || iw.includes(w) || w.includes(iw))
        )

        // Only flag if significant keyword overlap suggests relevance
        if (overlap.length >= 2) {
            return this.makeConflict(constraint, intent, 'warning',
                `Intent may conflict with constraint: "${constraint}" (keywords: ${overlap.join(', ')})`,
                `Review the constraint before proceeding`)
        }
        return null
    }

    // ── Helpers ───────────────────────────────────────────────────

    private makeConflict(
        constraint: string,
        intent: Intent,
        severity: 'error' | 'warning',
        message: string,
        suggestedFix?: string
    ): Conflict {
        return {
            type: 'constraint-violation',
            severity,
            message,
            relatedIntent: intent,
            suggestedFix,
        }
    }

    private extractKeywords(text: string): string[] {
        const stopWords = new Set([
            'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'and',
            'or', 'is', 'are', 'was', 'be', 'not', 'no', 'from', 'with',
            'all', 'must', 'should', 'can', 'cannot', 'will', 'this', 'that',
        ])
        return text
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2 && !stopWords.has(w))
    }

    private toCamelCase(name: string): string {
        return name
            .replace(/[-_]+(.)/g, (_, c) => c.toUpperCase())
            .replace(/^[A-Z]/, c => c.toLowerCase())
    }
}
