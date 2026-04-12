import type { DependencyGraph, GraphNode } from './types.js'
import type { MikkLock } from '../contract/schema.js'
import { RiskEngine } from './risk-engine.js'
import { ImpactAnalyzer } from './impact-analyzer.js'

/**
 * RiskExplainer — produces human-readable reasoning chains for risk scores.
 *
 * The existing RiskEngine produces a number (0-100). Agents receive that
 * number but have no way to understand WHY a node is high-risk or what to
 * do about it. This class fills that gap.
 *
 * It re-runs the risk computation with full audit trail, then formats the
 * result as a structured explanation agents can reason about and present
 * to developers.
 */
export class RiskExplainer {
    private riskEngine: RiskEngine
    private impactAnalyzer: ImpactAnalyzer

    constructor(
        private graph: DependencyGraph,
        private lock: MikkLock,
    ) {
        this.riskEngine = new RiskEngine(graph)
        this.impactAnalyzer = new ImpactAnalyzer(graph)
    }

    explain(nodeId: string): RiskExplanation {
        const node = this.graph.nodes.get(nodeId)
        if (!node) {
            return {
                nodeId,
                name: nodeId,
                file: '',
                riskScore: 0,
                riskLevel: 'LOW',
                summary: 'Node not found in graph.',
                factors: [],
                hotPaths: [],
                recommendations: ['Run mikk analyze to rebuild the graph.'],
            }
        }

        const fn = this.lock.functions[nodeId]
        const riskScore = this.riskEngine.scoreNode(nodeId)
        const riskLevel = riskScore >= 80 ? 'CRITICAL' : riskScore >= 60 ? 'HIGH' : riskScore >= 40 ? 'MEDIUM' : 'LOW'

        // Collect all contributing factors with their weights
        const factors: RiskFactor[] = []

        // Connectivity factor
        const callerCount = (this.graph.inEdges.get(nodeId) ?? []).filter(e => e.type === 'calls').length
        const calleeCount = (this.graph.outEdges.get(nodeId) ?? []).filter(e => e.type === 'calls').length
        if (callerCount > 0) {
            factors.push({
                name: 'Fan-in (callers)',
                contribution: Math.round(callerCount * 1.5),
                detail: `${callerCount} function(s) call this directly — changes propagate upward to all of them.`,
                severity: callerCount > 10 ? 'high' : callerCount > 3 ? 'medium' : 'low',
            })
        }
        if (calleeCount > 0) {
            factors.push({
                name: 'Fan-out (callees)',
                contribution: Math.round(calleeCount * 0.5),
                detail: `Calls ${calleeCount} other function(s) — bugs here can cascade downward.`,
                severity: 'low',
            })
        }

        // Module boundary factor
        const incomingModules = new Set(
            (this.graph.inEdges.get(nodeId) ?? [])
                .map(e => this.graph.nodes.get(e.from)?.moduleId)
                .filter(Boolean)
        )
        if (incomingModules.size > 1) {
            factors.push({
                name: 'Cross-module dependency',
                contribution: 15,
                detail: `Used by ${incomingModules.size} different modules (${[...incomingModules].join(', ')}). Cross-module callers can't be updated atomically.`,
                severity: 'high',
            })
        }

        // Domain sensitivity factor
        const nameAndFile = `${node.name} ${node.file}`.toLowerCase()
        if (/auth|login|jwt|verify|token|crypt|hash|password/.test(nameAndFile)) {
            factors.push({
                name: 'Security-sensitive domain',
                contribution: 30,
                detail: 'Function name/file suggests auth, crypto, or token logic. Regressions here are high-severity security issues.',
                severity: 'high',
            })
        }
        if (/db|query|sql|insert|update|delete|redis|cache|transaction/.test(nameAndFile)) {
            factors.push({
                name: 'State-mutation domain',
                contribution: 20,
                detail: 'Function name/file suggests database or cache mutation. Errors affect persistent state.',
                severity: 'medium',
            })
        }

        // Export factor
        if (node.metadata?.isExported) {
            factors.push({
                name: 'Public API surface',
                contribution: 15,
                detail: 'Exported — changes become breaking changes for all consumers, including external packages.',
                severity: 'medium',
            })
        }

        // Error handling gap
        const errorHandling = fn?.errorHandling ?? []
        if (callerCount > 3 && errorHandling.length === 0) {
            factors.push({
                name: 'No error handling',
                contribution: 0,
                detail: `Called by ${callerCount} functions but has no try-catch or throw. Unhandled exceptions propagate to all callers.`,
                severity: 'medium',
            })
        }

        // Depth factor (BFS depth from node in impact graph)
        const impact = this.impactAnalyzer.analyze([nodeId])
        if (impact.depth > 3) {
            factors.push({
                name: 'Deep dependency chain',
                contribution: Math.round(impact.depth * 2),
                detail: `Changes ripple ${impact.depth} hops through the graph, affecting ${impact.impacted.length} downstream node(s).`,
                severity: impact.depth > 6 ? 'high' : 'medium',
            })
        }

        // Find hot call paths (shortest paths from this node to critical nodes)
        const hotPaths = this.findHotPaths(nodeId, impact.classified.critical.slice(0, 3))

        // Recommendations
        const recommendations = this.buildRecommendations(riskLevel, factors, fn, callerCount)

        const summary = this.buildSummary(node, riskLevel, riskScore, factors, callerCount, impact.impacted.length)

        return {
            nodeId,
            name: node.name,
            file: node.file,
            riskScore,
            riskLevel,
            summary,
            factors: factors.sort((a, b) => b.contribution - a.contribution),
            hotPaths,
            recommendations,
        }
    }

    explainFile(filePath: string): RiskExplanation[] {
        const fns = Object.values(this.lock.functions)
            .filter(fn => fn.file === filePath || fn.file.endsWith('/' + filePath))
        return fns
            .map(fn => this.explain(fn.id))
            .sort((a, b) => b.riskScore - a.riskScore)
    }

    private findHotPaths(nodeId: string, criticalTargets: Array<{ nodeId: string; label: string }>): HotPath[] {
        const paths: HotPath[] = []

        for (const target of criticalTargets) {
            const path = this.bfsPath(nodeId, target.nodeId)
            if (path.length > 0) {
                paths.push({
                    to: target.label,
                    toId: target.nodeId,
                    hops: path.length - 1,
                    path: path.map(id => this.graph.nodes.get(id)?.name ?? id),
                })
            }
        }

        return paths
    }

    private bfsPath(from: string, to: string): string[] {
        const visited = new Set<string>([from])
        const queue: Array<[string, string[]]> = [[from, [from]]]
        let head = 0

        while (head < queue.length) {
            const [cur, path] = queue[head++]
            for (const edge of this.graph.outEdges.get(cur) ?? []) {
                if (edge.type !== 'calls') continue
                if (edge.to === to) return [...path, to]
                if (!visited.has(edge.to)) {
                    visited.add(edge.to)
                    queue.push([edge.to, [...path, edge.to]])
                }
            }
        }
        return []
    }

    private buildSummary(
        node: GraphNode,
        riskLevel: string,
        riskScore: number,
        factors: RiskFactor[],
        callerCount: number,
        impactedCount: number,
    ): string {
        const topFactor = factors[0]
        const base = `${node.name} is ${riskLevel} risk (score ${riskScore}/100).`
        const reason = topFactor
            ? ` Primary driver: ${topFactor.name.toLowerCase()} (+${topFactor.contribution} pts).`
            : ''
        const impact = impactedCount > 0
            ? ` Changing it affects ${impactedCount} downstream node(s) across up to ${callerCount} direct caller(s).`
            : ''
        return base + reason + impact
    }

    private buildRecommendations(
        riskLevel: string,
        factors: RiskFactor[],
        fn: MikkLock['functions'][string] | undefined,
        callerCount: number,
    ): string[] {
        const recs: string[] = []

        if (riskLevel === 'CRITICAL' || riskLevel === 'HIGH') {
            recs.push('Run mikk_before_edit and mikk_validate_edit before making any changes.')
            recs.push('Use mikk_find_usages to review all callers before modifying the signature.')
        }
        if (factors.some(f => f.name === 'Security-sensitive domain')) {
            recs.push('Any change to auth/crypto logic requires a security review. Update tests first.')
        }
        if (factors.some(f => f.name === 'No error handling') && callerCount > 3) {
            recs.push('Add try-catch or document throws before adding more callers.')
        }
        if (factors.some(f => f.name === 'Cross-module dependency')) {
            recs.push('Consider wrapping in a stable adapter layer to decouple cross-module consumers.')
        }
        if (factors.some(f => f.name === 'Public API surface')) {
            recs.push('If changing the signature, bump the version and update CHANGELOG.md.')
        }
        if (recs.length === 0) {
            recs.push('Risk is manageable. Still run mikk_before_edit as a sanity check.')
        }

        return recs
    }
}

export interface RiskFactor {
    name: string
    contribution: number
    detail: string
    severity: 'high' | 'medium' | 'low'
}

export interface HotPath {
    to: string
    toId: string
    hops: number
    path: string[]
}

export interface RiskExplanation {
    nodeId: string
    name: string
    file: string
    riskScore: number
    riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
    summary: string
    factors: RiskFactor[]
    hotPaths: HotPath[]
    recommendations: string[]
}
