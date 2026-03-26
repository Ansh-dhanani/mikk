import { 
    MikkContract, MikkLock, GraphBuilder, ImpactAnalyzer 
} from '@getmikk/core'
import { IntentInterpreter } from './interpreter.js'
import { ConflictDetector } from './conflict-detector.js'
import { Suggester } from './suggester.js'
import { DecisionEngine } from './decision-engine.js'
import { ExplanationEngine } from './explanation-engine.js'
import type { PreflightResult, DecisionResult, Explanation } from './types.js'

/**
 * PreflightPipeline — orchestrates the full intent pipeline:
 * interpret → analyze (impact/risk) → decide → explain → conflict-detect → suggest.
 */
export class PreflightPipeline {
    private interpreter: IntentInterpreter
    private conflictDetector: ConflictDetector
    private suggester: Suggester
    private decisionEngine: DecisionEngine
    private explanationEngine: ExplanationEngine

    constructor(
        private contract: MikkContract,
        private lock: MikkLock
    ) {
        this.interpreter = new IntentInterpreter(contract, lock)
        this.conflictDetector = new ConflictDetector(contract, lock)
        this.suggester = new Suggester(contract, lock)
        this.decisionEngine = new DecisionEngine(contract)
        this.explanationEngine = new ExplanationEngine()
    }

    /** Run the full preflight pipeline */
    async run(prompt: string): Promise<PreflightResult> {
        // 1. Interpret prompt into structured intents
        const intents = await this.interpreter.interpret(prompt)

        // 2. Perform Quantitative Impact Analysis
        const graph = new GraphBuilder().buildFromLock(this.lock)
        const analyzer = new ImpactAnalyzer(graph)
        
        // Find node IDs for the intents
        const targetIds: string[] = []
        for (const intent of intents) {
            // Find better match by checking both name and type
            // In Mikk 2.0, we have IDs like fn:src/file.ts:name
            const matchedNode = [...graph.nodes.values()].find(n => 
                n.name.toLowerCase() === intent.target.name.toLowerCase() && 
                (intent.target.type === 'function' ? n.type === 'function' : true)
            )
            if (matchedNode) targetIds.push(matchedNode.id)
        }

        const impact = analyzer.analyze(targetIds)

        // 3. Decide and Explain
        const decision = this.decisionEngine.evaluate(impact)
        const explanation = this.explanationEngine.explain(impact, decision)

        // 4. Check for Static Conflicts
        const conflicts = this.conflictDetector.detect(intents)

        // 5. Low-confidence rejection / Supplemental warnings
        const maxConfidence = intents.length > 0
            ? Math.max(...intents.map(i => i.confidence))
            : 0
        if (maxConfidence < 0.4 && intents.length > 0) {
            conflicts.conflicts.push({
                type: 'low-confidence',
                severity: 'warning',
                message: `Low confidence (${(maxConfidence * 100).toFixed(0)}%) — matching to existing code was ambiguous.`,
                relatedIntent: intents[0],
                suggestedFix: 'Be more specific about the function or module name.',
            })
        }

        // 6. Generate implementation suggestions
        const suggestions = this.suggester.suggest(intents)

        return {
            intents,
            conflicts,
            suggestions,
            decision,
            explanation,
            approved: !conflicts.hasConflicts && decision.status !== 'BLOCKED' && maxConfidence >= 0.4,
        }
    }
}
