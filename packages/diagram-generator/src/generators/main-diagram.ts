import type { MikkContract, MikkLock } from '@ansh_dhanani/core'

/**
 * MainDiagramGenerator — generates the top-level Mermaid diagram
 * showing all modules and their interconnections.
 * Outputs: .mikk/diagrams/main.mmd
 */
export class MainDiagramGenerator {
    constructor(
        private contract: MikkContract,
        private lock: MikkLock
    ) { }

    generate(): string {
        const lines: string[] = []
        lines.push('graph TD')
        lines.push('')

        // Add module nodes
        for (const module of this.contract.declared.modules) {
            const lockModule = this.lock.modules[module.id]
            const fileCount = lockModule?.files.length || 0
            const fnCount = Object.values(this.lock.functions).filter(f => f.moduleId === module.id).length
            lines.push(`    ${this.sanitizeId(module.id)}["📦 ${module.name}<br/>${fileCount} files, ${fnCount} functions"]`)
        }

        lines.push('')

        // Add inter-module edges based on cross-module function calls
        const moduleEdges = new Map<string, Set<string>>()

        for (const fn of Object.values(this.lock.functions)) {
            for (const callTarget of fn.calls) {
                const targetFn = this.lock.functions[callTarget]
                if (targetFn && fn.moduleId !== targetFn.moduleId) {
                    const edgeKey = `${fn.moduleId}→${targetFn.moduleId}`
                    if (!moduleEdges.has(edgeKey)) {
                        moduleEdges.set(edgeKey, new Set())
                    }
                    moduleEdges.get(edgeKey)!.add(`${fn.name}→${targetFn.name}`)
                }
            }
        }

        for (const [edge, calls] of moduleEdges) {
            const [from, to] = edge.split('→')
            lines.push(`    ${this.sanitizeId(from)} -->|${calls.size} calls| ${this.sanitizeId(to)}`)
        }

        // Style
        lines.push('')
        lines.push('    classDef module fill:#4a90d9,stroke:#2c3e50,color:#fff,stroke-width:2px')
        for (const module of this.contract.declared.modules) {
            lines.push(`    class ${this.sanitizeId(module.id)} module`)
        }

        return lines.join('\n')
    }

    private sanitizeId(id: string): string {
        return id.replace(/[^a-zA-Z0-9_]/g, '_')
    }
}
