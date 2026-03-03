import type { MikkContract, MikkLock } from '@getmikk/core'

/**
 * ImpactDiagramGenerator — generates a Mermaid diagram showing the
 * impact of changes in specific files/functions.
 * Outputs: .mikk/diagrams/impact/{filename}.mmd
 */
export class ImpactDiagramGenerator {
    constructor(
        private lock: MikkLock
    ) { }

    generate(changedNodeIds: string[], impactedNodeIds: string[]): string {
        const lines: string[] = []
        lines.push('%%{init: {"theme": "base", "themeVariables": {"primaryColor": "#1e293b", "primaryTextColor": "#e2e8f0", "lineColor": "#64748b", "secondaryColor": "#334155", "tertiaryColor": "#475569", "background": "#0f172a", "mainBkg": "#1e293b", "nodeBorder": "#475569"}}}%%')
        lines.push('graph LR')
        lines.push('')

        // Changed nodes (red)
        for (const id of changedNodeIds) {
            const fn = this.lock.functions[id]
            if (fn) {
                lines.push(`    ${this.sanitizeId(id)}["🔴 ${fn.name}<br/>${fn.file}"]`)
            }
        }

        // Impacted nodes (orange)
        for (const id of impactedNodeIds) {
            const fn = this.lock.functions[id]
            if (fn) {
                lines.push(`    ${this.sanitizeId(id)}["🟠 ${fn.name}<br/>${fn.file}"]`)
            }
        }

        lines.push('')

        // Draw edges showing the impact chain
        const allIds = new Set([...changedNodeIds, ...impactedNodeIds])
        for (const id of allIds) {
            const fn = this.lock.functions[id]
            if (!fn) continue
            for (const callerId of fn.calledBy) {
                if (allIds.has(callerId)) {
                    lines.push(`    ${this.sanitizeId(callerId)} --> ${this.sanitizeId(id)}`)
                }
            }
        }

        lines.push('')
        lines.push('    classDef changed fill:#ef4444,stroke:#f87171,color:#fef2f2')
        lines.push('    classDef impacted fill:#f59e0b,stroke:#fbbf24,color:#1e293b')

        for (const id of changedNodeIds) {
            lines.push(`    class ${this.sanitizeId(id)} changed`)
        }
        for (const id of impactedNodeIds) {
            lines.push(`    class ${this.sanitizeId(id)} impacted`)
        }

        return lines.join('\n')
    }

    private sanitizeId(id: string): string {
        return id.replace(/[^a-zA-Z0-9_]/g, '_')
    }
}
