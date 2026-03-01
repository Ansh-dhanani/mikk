import * as path from 'node:path'
import type { MikkContract, MikkLock } from '@getmikk/core'

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
        lines.push(`    subgraph mod_${this.sanitizeId(moduleId)}["📦 Module: ${module.name}"]`)

        const moduleFunctions = Object.values(this.lock.functions).filter(f => f.moduleId === moduleId)

        // Group functions by file
        const functionsByFile = new Map<string, typeof moduleFunctions>()
        for (const fn of moduleFunctions) {
            if (!functionsByFile.has(fn.file)) {
                functionsByFile.set(fn.file, [])
            }
            functionsByFile.get(fn.file)!.push(fn)
        }

        // Add file subgraphs
        for (const [filePath, fns] of functionsByFile) {
            const fileName = path.basename(filePath)
            lines.push(`        subgraph file_${this.sanitizeId(filePath)}["📄 ${fileName}"]`)
            for (const fn of fns) {
                const icon = fn.calledBy.length === 0 ? '⚡' : 'λ' // ⚡ for entry points (called by nothing internal)
                lines.push(`            ${this.sanitizeId(fn.id)}["${icon} ${fn.name}"]`)
            }
            lines.push('        end')
        }

        lines.push('    end')
        lines.push('')

        // Add call edges
        for (const fn of moduleFunctions) {
            for (const callTarget of fn.calls) {
                const targetFn = this.lock.functions[callTarget]
                if (targetFn) {
                    if (targetFn.moduleId === moduleId) {
                        // Internal call
                        lines.push(`    ${this.sanitizeId(fn.id)} --> ${this.sanitizeId(callTarget)}`)
                    } else {
                        // External call
                        const targetMod = targetFn.moduleId
                        lines.push(`    ${this.sanitizeId(fn.id)} -.->|"calls"| ext_${this.sanitizeId(callTarget)}["🔗 ${targetFn.name}<br/>(${targetMod})"]`)
                    }
                }
            }
        }

        lines.push('')
        lines.push('    classDef default fill:#f9f9f9,stroke:#333,stroke-width:1px')
        lines.push('    classDef external fill:#ecf0f1,stroke:#bdc3c7,stroke-dasharray: 5 5')

        return lines.join('\n')
    }

    private sanitizeId(id: string): string {
        return id.replace(/[^a-zA-Z0-9_]/g, '_')
    }
}
