import type { MikkContract, MikkLock } from '@getmikk/core'

/**
 * CapsuleDiagramGenerator — generates capsule diagrams that show
 * the public API surface of a module (what it exports to the world).
 * Outputs: .mikk/diagrams/capsules/{moduleId}.mmd
 */
export class CapsuleDiagramGenerator {
    constructor(
        private contract: MikkContract,
        private lock: MikkLock
    ) { }

    generate(moduleId: string): string {
        const module = this.contract.declared.modules.find(m => m.id === moduleId)
        if (!module) return `%% Module "${moduleId}" not found`

        const lines: string[] = []
        lines.push('%%{init: {"theme": "base", "themeVariables": {"primaryColor": "#1e293b", "primaryTextColor": "#e2e8f0", "lineColor": "#64748b", "secondaryColor": "#334155", "tertiaryColor": "#475569", "background": "#0f172a", "mainBkg": "#1e293b", "nodeBorder": "#475569"}}}%%')
        lines.push('graph LR')
        lines.push('')

        // Module capsule (subgraph)
        lines.push(`    subgraph ${this.sanitizeId(moduleId)}["📦 ${module.name}"]`)
        lines.push(`        direction TB`)

        // Find exported functions (those called by functions in other modules)
        const moduleFunctions = Object.values(this.lock.functions).filter(f => f.moduleId === moduleId)
        const exportedFns = moduleFunctions.filter(fn =>
            fn.calledBy.some(callerId => {
                const caller = this.lock.functions[callerId]
                return caller && caller.moduleId !== moduleId
            })
        )

        // Internal functions
        const internalFns = moduleFunctions.filter(fn => !exportedFns.includes(fn))

        if (exportedFns.length > 0) {
            lines.push(`        subgraph public["🔓 Public API"]`)
            for (const fn of exportedFns) {
                lines.push(`            ${this.sanitizeId(fn.id)}["${fn.name}"]`)
            }
            lines.push('        end')
        }

        if (internalFns.length > 0 && internalFns.length <= 10) {
            lines.push(`        subgraph internal["🔒 Internal"]`)
            for (const fn of internalFns) {
                lines.push(`            ${this.sanitizeId(fn.id)}["${fn.name}"]`)
            }
            lines.push('        end')
        } else if (internalFns.length > 10) {
            lines.push(`        internal["🔒 ${internalFns.length} internal functions"]`)
        }

        lines.push('    end')
        lines.push('')

        // Show external consumers
        for (const fn of exportedFns) {
            for (const callerId of fn.calledBy) {
                const caller = this.lock.functions[callerId]
                if (caller && caller.moduleId !== moduleId) {
                    lines.push(`    ext_${this.sanitizeId(callerId)}["${caller.name}<br/>(${caller.moduleId})"] --> ${this.sanitizeId(fn.id)}`)
                }
            }
        }

        lines.push('')
        lines.push('    classDef publicApi fill:#22c55e,stroke:#4ade80,color:#f0fdf4')
        lines.push('    classDef internalApi fill:#64748b,stroke:#94a3b8,color:#f1f5f9')

        // Apply classes to nodes
        for (const fn of exportedFns) {
            lines.push(`    class ${this.sanitizeId(fn.id)} publicApi`)
        }
        for (const fn of internalFns) {
            if (internalFns.length <= 10) {
                lines.push(`    class ${this.sanitizeId(fn.id)} internalApi`)
            }
        }
        // Apply to the summary node if used
        if (internalFns.length > 10) {
            lines.push('    class internal internalApi')
        }

        return lines.join('\n')
    }

    private sanitizeId(id: string): string {
        return id.replace(/[^a-zA-Z0-9_]/g, '_')
    }
}
