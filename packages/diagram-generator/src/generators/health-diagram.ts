import type { MikkContract, MikkLock } from '@getmikk/core'

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
        lines.push('%%{init: {"theme": "base", "themeVariables": {"primaryColor": "#1e293b", "primaryTextColor": "#e2e8f0", "lineColor": "#64748b", "secondaryColor": "#334155", "tertiaryColor": "#475569", "background": "#0f172a", "mainBkg": "#1e293b", "nodeBorder": "#475569"}}}%%')
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

        // Add inter-module dependency edges for context (function calls + file imports)
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
        for (const file of Object.values(this.lock.files)) {
            if (!file.imports) continue
            for (const importedPath of file.imports) {
                const importedFile = this.lock.files[importedPath]
                if (importedFile && file.moduleId !== importedFile.moduleId) {
                    const key = `${file.moduleId}|${importedFile.moduleId}`
                    if (!moduleEdges.has(key)) {
                        moduleEdges.add(key)
                        lines.push(`    ${this.sanitizeId(file.moduleId)} -.-> ${this.sanitizeId(importedFile.moduleId)}`)
                    }
                }
            }
        }

        lines.push('')
        lines.push('    classDef healthy fill:#22c55e,stroke:#4ade80,color:#f0fdf4')
        lines.push('    classDef warning fill:#f59e0b,stroke:#fbbf24,color:#1e293b')
        lines.push('    classDef critical fill:#ef4444,stroke:#f87171,color:#fef2f2')
        lines.push('')
        for (const assignment of classAssignments) {
            lines.push(assignment)
        }

        return lines.join('\n')
    }

    private computeMetrics(moduleId: string) {
        const moduleFunctions = Object.values(this.lock.functions).filter(f => f.moduleId === moduleId)
        const moduleFiles = Object.values(this.lock.files).filter(f => f.moduleId === moduleId)
        const functionCount = moduleFunctions.length

        // Coupling: count of external calls + external file imports
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
        for (const file of moduleFiles) {
            if (!file.imports) continue
            for (const importedPath of file.imports) {
                const importedFile = this.lock.files[importedPath]
                if (importedFile) {
                    if (importedFile.moduleId === moduleId) internalCalls++
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
