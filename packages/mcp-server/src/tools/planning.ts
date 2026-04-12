import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
    ScopeAnalyzer, RiskExplainer, ImpactAnalyzer, BoundaryChecker,
} from '@getmikk/core'
import { loadContractAndLock, buildGraphFromLock } from './shared.js'

export function registerPlanningTools(server: McpServer, projectRoot: string) {

    // ── mikk_scope_check ─────────────────────────────────────────────────────
    // The missing inverse of mikk_impact_analysis:
    //   impact asks "what breaks if I change X?"
    //   scope  asks "what do I need to touch to accomplish Y?"
    server.tool(
        'mikk_scope_check',
        'Determine the MINIMUM set of files and functions to touch to accomplish a task. The inverse of mikk_impact_analysis — where impact asks "what breaks?", scope asks "what do I need?". Returns editFiles (files to modify, ranked by relevance) and readFiles (context-only). WHEN TO USE: At the start of any non-trivial task before opening files. AFTER THIS: Use mikk_before_edit on the editFiles to validate constraints.',
        {
            task: z.string().min(5).describe('Describe the task you want to accomplish (e.g., "add rate limiting to the auth endpoints")'),
            maxFiles: z.number().int().min(1).max(20).optional().default(8).describe('Max files to return (default: 8)'),
            maxHops: z.number().int().min(1).max(6).optional().default(3).describe('BFS depth for dependency traversal (default: 3)'),
        },
        async (args: any): Promise<any> => {
            const { task, maxFiles, maxHops } = args as any
            const { lock, staleness } = await loadContractAndLock(projectRoot)
            const graph = buildGraphFromLock(lock)
            const analyzer = new ScopeAnalyzer(graph, lock)
            const result = analyzer.analyze(task, maxFiles, maxHops)
            return { content: [{ type: 'text' as const, text: JSON.stringify({
                task,
                editFiles: result.editFiles.map(f => ({
                    file: f.file,
                    relevanceScore: f.score,
                    functions: f.functions,
                    hint: `Primary edit target — start here`,
                })),
                readFiles: result.readFiles.map(f => ({
                    file: f.file,
                    relevanceScore: f.score,
                    hint: `Context only — read but likely do not modify`,
                })),
                anchorFunctions: result.anchorFunctions,
                stats: {
                    totalFilesConsidered: result.totalFilesConsidered,
                    editCount: result.editFiles.length,
                    readCount: result.readFiles.length,
                },
                warning: staleness,
                hint: result.hint + '\n\nNext: Run mikk_before_edit on the editFiles to check constraint violations before starting.',
            }, null, 2) }] }
        },
    )

    // ── mikk_explain_risk ────────────────────────────────────────────────────
    // Agents receive risk scores (0-100) with no explanation. This tool
    // tells them WHY a node is high-risk and what to do about it.
    server.tool(
        'mikk_explain_risk',
        'Explain WHY a function or file has the risk score it does. Returns scored risk factors (fan-in, cross-module deps, domain sensitivity, export surface, error handling gaps, circular depth), hot call paths to critical downstream nodes, and concrete recommendations. WHEN TO USE: When mikk_before_edit or mikk_impact_analysis shows a critical/high risk node and you need to understand why before changing it.',
        {
            name: z.string().describe('Function name or file path to explain risk for (e.g., "verifyToken" or "src/auth/jwt.ts")'),
            mode: z.enum(['function', 'file']).optional().default('function').describe('"function" explains a single function; "file" explains all functions in a file sorted by risk'),
        },
        async (args: any): Promise<any> => {
            const { name, mode } = args as any
            const { lock, staleness } = await loadContractAndLock(projectRoot)
            const graph = buildGraphFromLock(lock)
            const explainer = new RiskExplainer(graph, lock)

            if (mode === 'file') {
                const normalizedFile = name.replace(/\\/g, '/')
                const explanations = explainer.explainFile(normalizedFile)
                if (explanations.length === 0)
                    return { content: [{ type: 'text' as const, text: `No functions found in "${normalizedFile}". Check path with mikk_list_files.` }], isError: true }
                return { content: [{ type: 'text' as const, text: JSON.stringify({
                    file: normalizedFile,
                    functionCount: explanations.length,
                    overallMaxRisk: Math.max(...explanations.map(e => e.riskScore)),
                    overallLevel: explanations[0]?.riskLevel ?? 'LOW',
                    functions: explanations.map(e => ({
                        name: e.name, riskScore: e.riskScore, riskLevel: e.riskLevel, summary: e.summary,
                        topFactor: e.factors[0] ?? null,
                        recommendations: e.recommendations,
                    })),
                    warning: staleness,
                    hint: 'Use mikk_explain_risk with mode="function" on any specific function for the full breakdown.',
                }, null, 2) }] }
            }

            // mode === 'function'
            const fn = Object.values(lock.functions).find(f => f.name === name || f.name.endsWith(`.${name}`) || f.id.includes(name))
            if (!fn) return { content: [{ type: 'text' as const, text: `Function "${name}" not found. Use mikk_search_functions to find the correct name.` }], isError: true }
            const explanation = explainer.explain(fn.id)
            return { content: [{ type: 'text' as const, text: JSON.stringify({
                ...explanation,
                file: fn.file, module: fn.moduleId,
                warning: staleness,
                hint: explanation.riskScore >= 60
                    ? 'HIGH RISK: Add tests before modifying. Use mikk_before_edit. Consider mikk_scope_check to find a safer entry point.'
                    : 'Review recommendations before making changes.',
            }, null, 2) }] }
        },
    )

    // ── mikk_change_plan ─────────────────────────────────────────────────────
    // One-shot pre-flight: scope → risk → impact → constraint check in one call.
    // Replaces the need to chain 3-4 tools manually for every non-trivial change.
    server.tool(
        'mikk_change_plan',
        'One-shot pre-flight for any non-trivial change: runs scope analysis → risk explanation → blast radius → constraint check in a single call. Returns a structured plan with executionOrder, riskSummary, violationSummary, and a CLEAR or BLOCKED verdict. WHEN TO USE: Before starting any task that touches more than 1 file. This is the recommended starting point for complex changes.',
        {
            task: z.string().min(5).describe('Describe the change you want to make'),
            maxFiles: z.number().int().min(1).max(15).optional().default(6),
        },
        async (args: any): Promise<any> => {
            const { task, maxFiles } = args as any
            const { contract, lock, staleness } = await loadContractAndLock(projectRoot)
            const graph = buildGraphFromLock(lock)

            // 1. Scope — what files do I need to touch?
            const scopeAnalyzer = new ScopeAnalyzer(graph, lock)
            const scope = scopeAnalyzer.analyze(task, maxFiles, 3)

            // 2. Risk — how risky are the files I need to edit?
            const riskExplainer = new RiskExplainer(graph, lock)
            const riskSummary = scope.editFiles.map(ef => {
                const fnsInFile = Object.values(lock.functions).filter(f => f.file === ef.file)
                const topRisk = fnsInFile.length > 0
                    ? fnsInFile.map(fn => riskExplainer.explain(fn.id)).sort((a, b) => b.riskScore - a.riskScore)[0]
                    : null
                return {
                    file: ef.file,
                    topFunction: topRisk?.name ?? null,
                    riskScore: topRisk?.riskScore ?? 0,
                    riskLevel: topRisk?.riskLevel ?? 'LOW',
                    topRiskFactor: topRisk?.factors[0]?.name ?? null,
                    recommendation: topRisk?.recommendations[0] ?? null,
                }
            })

            // 3. Blast radius — how many downstream nodes will be affected?
            const impactAnalyzer = new ImpactAnalyzer(graph)
            const editFileNodes = scope.editFiles.flatMap(ef =>
                [...graph.nodes.values()].filter(n => n.file === ef.file)
            )
            const impact = editFileNodes.length > 0 ? impactAnalyzer.analyze(editFileNodes.map(n => n.id)) : null

            // 4. Constraints — will this violate architectural rules?
            const checker = new BoundaryChecker(contract, lock)
            const boundaryResult = checker.check()
            const relevantViolations = boundaryResult.violations.filter(v =>
                scope.editFiles.some(ef => v.from.file === ef.file || v.from.file.endsWith('/' + ef.file))
            )

            // 5. Verdict
            const maxRisk = Math.max(0, ...riskSummary.map(r => r.riskScore))
            const hasViolations = relevantViolations.length > 0
            const verdict = hasViolations ? 'BLOCKED' : maxRisk >= 80 ? 'HIGH_RISK' : 'CLEAR'

            return { content: [{ type: 'text' as const, text: JSON.stringify({
                task,
                verdict,
                verdictDetail: verdict === 'BLOCKED'
                    ? `${relevantViolations.length} constraint violation(s) must be resolved before proceeding.`
                    : verdict === 'HIGH_RISK'
                    ? `Max risk score ${maxRisk}/100. Proceed with extra care — add tests first.`
                    : 'No blocking issues. Follow the execution order below.',

                executionOrder: scope.editFiles.map((ef, i) => ({
                    step: i + 1, file: ef.file,
                    functions: ef.functions,
                    risk: riskSummary.find(r => r.file === ef.file) ?? null,
                })),

                readForContext: scope.readFiles.map(f => f.file),

                blastRadius: impact ? {
                    impactedNodes: impact.impacted.length,
                    depth: impact.depth,
                    classified: { critical: impact.classified.critical.length, high: impact.classified.high.length, medium: impact.classified.medium.length },
                } : null,

                constraints: {
                    status: hasViolations ? 'fail' : 'pass',
                    violations: relevantViolations.map(v => ({
                        rule: v.rule, severity: v.severity,
                        message: `"${v.from.functionName}" in ${v.from.moduleName} → "${v.to.functionName}" in ${v.to.moduleName}`,
                    })),
                },

                riskSummary,
                anchorFunctions: scope.anchorFunctions,
                warning: staleness,
                hint: verdict === 'CLEAR'
                    ? 'Run mikk_before_edit on each file as you begin editing it.'
                    : verdict === 'HIGH_RISK'
                    ? 'Run mikk_explain_risk on the highest-risk function before making changes.'
                    : 'Address constraint violations (mikk_get_constraints) before editing.',
            }, null, 2) }] }
        },
    )
}
