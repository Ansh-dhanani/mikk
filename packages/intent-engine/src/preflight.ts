import type { MikkContract, MikkLock } from '@ansh-dhanani/core'
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

        // 3. Generate suggestions
        const suggestions = this.suggester.suggest(intents)

        return {
            intents,
            conflicts,
            suggestions,
            approved: !conflicts.hasConflicts,
        }
    }
}
