import { 
    MikkContract, MikkLock, GraphBuilder, ImpactAnalyzer 
} from '@getmikk/core'
import { IntentInterpreter } from './interpreter.js'
import { ConflictDetector } from './conflict-detector.js'
import { Suggester } from './suggester.js'
import { DecisionEngine } from './decision-engine.js'
import { ExplanationEngine } from './explanation-engine.js'
import type { PreflightResult } from './types.js'

/**
 * PreflightPipeline — orchestrates the full intent pipeline:
 * interpret → impact/risk analysis → decide → explain → conflict-detect → suggest.
 */
export class PreflightPipeline {
    private interpreter:     IntentInterpreter
    private conflictDetector: ConflictDetector
    private suggester:       Suggester
    private decisionEngine:  DecisionEngine
    private explanationEngine: ExplanationEngine

    constructor(
        private contract: MikkContract,
        private lock: MikkLock,
    ) {
        this.interpreter      = new IntentInterpreter(contract, lock)
        this.conflictDetector = new ConflictDetector(contract, lock)
        this.suggester        = new Suggester(contract, lock)
        this.decisionEngine   = new DecisionEngine(contract)
        // Pass lock so ExplanationEngine can resolve module names accurately
        this.explanationEngine = new ExplanationEngine(lock)
    }

    /** Run the full preflight pipeline for a natural-language prompt. */
    async run(prompt: string): Promise<PreflightResult> {
        // 1. Interpret prompt → structured intents
        const intents = await this.interpreter.interpret(prompt)

        // 2. Build graph from lock (no file re-parsing) and run impact analysis
        const graph    = new GraphBuilder().buildFromLock(this.lock)
        const analyzer = new ImpactAnalyzer(graph)

        // Build name→node index once (O(n)) instead of scanning per intent (O(intents×n))
        const nodeByNameLower = new Map<string, string>()
        for (const [id, node] of graph.nodes) {
            nodeByNameLower.set(node.name.toLowerCase(), id)
        }

        const targetIds: string[] = []
        for (const intent of intents) {
            const id = nodeByNameLower.get(intent.target.name.toLowerCase())
            if (id) {
                const node = graph.nodes.get(id)!
                if (intent.target.type !== 'function' || node.type === 'function') {
                    targetIds.push(id)
                }
            }
        }

        const impact = analyzer.analyze(targetIds)

        // 3. Decide and explain
        const decision    = this.decisionEngine.evaluate(impact)
        const explanation = this.explanationEngine.explain(impact, decision)

        // 4. Static conflict detection
        const conflicts = this.conflictDetector.detect(intents)

        // 5. Low-confidence rejection
        const maxConf = intents.length > 0
            ? Math.max(...intents.map(i => i.confidence))
            : 0

        if (maxConf < 0.4 && intents.length > 0) {
            conflicts.conflicts.push({
                type:           'low-confidence',
                severity:       'warning',
                message:        `Low confidence (${(maxConf * 100).toFixed(0)}%) — matching to existing code was ambiguous.`,
                relatedIntent:  intents[0],
                suggestedFix:   'Be more specific about the function or module name.',
            })
        }

        // 6. Implementation suggestions
        const suggestions = this.suggester.suggest(intents)

        return {
            intents,
            conflicts,
            suggestions,
            decision,
            explanation,
            approved: !conflicts.hasConflicts && decision.status !== 'BLOCKED' && maxConf >= 0.4,
        }
    }
}
