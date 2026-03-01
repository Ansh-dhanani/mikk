import type { MikkContract, MikkLock } from '@ansh-dhanani/core'

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
        lines.push('    classDef publicApi fill:#27ae60,stroke:#2c3e50,color:#fff')
        lines.push('    classDef internalApi fill:#7f8c8d,stroke:#2c3e50,color:#fff')

        return lines.join('\n')
    }

    private sanitizeId(id: string): string {
        return id.replace(/[^a-zA-Z0-9_]/g, '_')
    }
}
