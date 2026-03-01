import type { MikkContract, MikkLock } from '@ansh-dhanani/core'

/**
 * HealthDiagramGenerator — generates a module health dashboard showing
 * coupling, cohesion, and complexity metrics.
 * Outputs: .mikk/diagrams/health.mmd
 */
export class HealthDiagramGenerator {
    constructor(
        private contract: MikkContract,
        private lock: MikkLock
    ) { }

    generate(): string {
        const lines: string[] = []
        lines.push('graph TD')
        lines.push('')

        const classAssignments: string[] = []

        for (const module of this.contract.declared.modules) {
            const metrics = this.computeMetrics(module.id)
            const healthIcon = metrics.health > 0.7 ? '🟢' : metrics.health > 0.4 ? '🟡' : '🔴'
            const healthClass = metrics.health > 0.7 ? 'healthy' : metrics.health > 0.4 ? 'warning' : 'critical'
            const sid = this.sanitizeId(module.id)

            lines.push(`    ${sid}["${healthIcon} ${module.name}<br/>Cohesion: ${(metrics.cohesion * 100).toFixed(0)}%<br/>Coupling: ${metrics.coupling}<br/>Functions: ${metrics.functionCount}"]`)
            classAssignments.push(`    class ${sid} ${healthClass}`)
        }

        // Add inter-module dependency edges for context
        const moduleEdges = new Set<string>()
        for (const fn of Object.values(this.lock.functions)) {
            for (const callTarget of fn.calls) {
                const targetFn = this.lock.functions[callTarget]
                if (targetFn && fn.moduleId !== targetFn.moduleId) {
                    const key = `${fn.moduleId}|${targetFn.moduleId}`
                    if (!moduleEdges.has(key)) {
                        moduleEdges.add(key)
                        lines.push(`    ${this.sanitizeId(fn.moduleId)} -.-> ${this.sanitizeId(targetFn.moduleId)}`)
                    }
                }
            }
        }

        lines.push('')
        lines.push('    classDef healthy fill:#27ae60,stroke:#2c3e50,color:#fff')
        lines.push('    classDef warning fill:#f39c12,stroke:#2c3e50,color:#fff')
        lines.push('    classDef critical fill:#e74c3c,stroke:#2c3e50,color:#fff')
        lines.push('')
        for (const assignment of classAssignments) {
            lines.push(assignment)
        }

        return lines.join('\n')
    }

    private computeMetrics(moduleId: string) {
        const moduleFunctions = Object.values(this.lock.functions).filter(f => f.moduleId === moduleId)
        const functionCount = moduleFunctions.length

        // Coupling: count of external calls
        let externalCalls = 0
        let internalCalls = 0
        for (const fn of moduleFunctions) {
            for (const call of fn.calls) {
                const target = this.lock.functions[call]
                if (target) {
                    if (target.moduleId === moduleId) internalCalls++
                    else externalCalls++
                }
            }
        }

        // Cohesion: ratio of internal to total calls
        const totalCalls = internalCalls + externalCalls
        const cohesion = totalCalls === 0 ? 0.5 : internalCalls / totalCalls

        // Health: weighted score
        const health = cohesion * 0.6 + (functionCount > 0 ? Math.min(1, 10 / functionCount) * 0.4 : 0.4)

        return { cohesion, coupling: externalCalls, functionCount, health }
    }

    private sanitizeId(id: string): string {
        return id.replace(/[^a-zA-Z0-9_]/g, '_')
    }
}
