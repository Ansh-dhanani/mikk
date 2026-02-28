import type { MikkContract, MikkLock } from '@mikk/core'

/**
 * ModuleDiagramGenerator — generates a detailed Mermaid diagram for a
 * single module, showing its internal files and function call graph.
 * Outputs: .mikk/diagrams/modules/{moduleId}.mmd
 */
export class ModuleDiagramGenerator {
    constructor(
        private contract: MikkContract,
        private lock: MikkLock
    ) { }

    generate(moduleId: string): string {
        const module = this.contract.declared.modules.find(m => m.id === moduleId)
        if (!module) return `%% Module "${moduleId}" not found`

        const lines: string[] = []
        lines.push(`graph TD`)
        lines.push(`    subgraph ${this.sanitizeId(moduleId)}["${module.name}"]`)

        // Add function nodes
        const moduleFunctions = Object.values(this.lock.functions).filter(f => f.moduleId === moduleId)

        for (const fn of moduleFunctions) {
            const icon = fn.calledBy.length === 0 ? '🔹' : '⚡'
            lines.push(`        ${this.sanitizeId(fn.id)}["${icon} ${fn.name}<br/>${fn.file}:${fn.startLine}"]`)
        }

        lines.push('    end')
        lines.push('')

        // Add internal call edges
        for (const fn of moduleFunctions) {
            for (const callTarget of fn.calls) {
                const targetFn = this.lock.functions[callTarget]
                if (targetFn && targetFn.moduleId === moduleId) {
                    lines.push(`    ${this.sanitizeId(fn.id)} --> ${this.sanitizeId(callTarget)}`)
                }
            }
        }

        // Add external call edges (to other modules)
        for (const fn of moduleFunctions) {
            for (const callTarget of fn.calls) {
                const targetFn = this.lock.functions[callTarget]
                if (targetFn && targetFn.moduleId !== moduleId) {
                    lines.push(`    ${this.sanitizeId(fn.id)} -.->|"calls"| ext_${this.sanitizeId(callTarget)}["🔗 ${targetFn.name}<br/>(${targetFn.moduleId})"]`)
                }
            }
        }

        lines.push('')
        lines.push('    classDef internal fill:#27ae60,stroke:#2c3e50,color:#fff')
        lines.push('    classDef external fill:#95a5a6,stroke:#2c3e50,color:#fff')

        return lines.join('\n')
    }

    private sanitizeId(id: string): string {
        return id.replace(/[^a-zA-Z0-9_]/g, '_')
    }
}
