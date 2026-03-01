import type { MikkContract, MikkLock } from '@ansh-dhanani/core'

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
        lines.push('    classDef changed fill:#e74c3c,stroke:#c0392b,color:#fff')
        lines.push('    classDef impacted fill:#e67e22,stroke:#d35400,color:#fff')

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
