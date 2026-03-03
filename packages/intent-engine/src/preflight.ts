import type { MikkContract, MikkLock } from '@getmikk/core'
import { IntentInterpreter } from './interpreter.js'
import { ConflictDetector } from './conflict-detector.js'
import { Suggester } from './suggester.js'
import type { PreflightResult } from './types.js'

/**
 * PreflightPipeline — orchestrates the full intent pipeline:
 * interpret → conflict-detect → suggest.
 * Single function call for the CLI.
 */
export class PreflightPipeline {
    private interpreter: IntentInterpreter
    private conflictDetector: ConflictDetector
    private suggester: Suggester

    constructor(
        private contract: MikkContract,
        private lock: MikkLock
    ) {
        this.interpreter = new IntentInterpreter(contract, lock)
        this.conflictDetector = new ConflictDetector(contract, lock)
        this.suggester = new Suggester(contract, lock)
    }

    /** Run the full preflight pipeline */
    async run(prompt: string): Promise<PreflightResult> {
        // 1. Interpret prompt into structured intents
        const intents = await this.interpreter.interpret(prompt)

        // 2. Check for conflicts
        const conflicts = this.conflictDetector.detect(intents)

        // 3. Low-confidence rejection: if the best intent has very low confidence,
        //    add a warning so the AI doesn't blindly proceed
        const maxConfidence = intents.length > 0
            ? Math.max(...intents.map(i => i.confidence))
            : 0
        if (maxConfidence < 0.4 && intents.length > 0) {
            conflicts.conflicts.push({
                type: 'low-confidence',
                severity: 'warning',
                message: `Low confidence (${(maxConfidence * 100).toFixed(0)}%) — the intent could not be reliably matched to existing code. The suggestion may be inaccurate.`,
                relatedIntent: intents[0],
                suggestedFix: 'Be more specific about the function or module name in your prompt.',
            })
        }

        // 4. Generate suggestions
        const suggestions = this.suggester.suggest(intents)

        return {
            intents,
            conflicts,
            suggestions,
            approved: !conflicts.hasConflicts && maxConfidence >= 0.4,
        }
    }
}
