import type { MikkContract, MikkLock } from '@ansh_dhanani/core'

/**
 * DependencyMatrixGenerator — generates an N×N dependency matrix
 * showing how many cross-module calls exist between each pair of modules.
 * Useful for spotting hidden coupling between modules.
 *
 * Output: a Mermaid block diagram with a matrix-like layout or
 * a structured text table that can be rendered in documentation.
 */
export class DependencyMatrixGenerator {
    constructor(
        private contract: MikkContract,
        private lock: MikkLock
    ) { }

    /**
     * Generate a Mermaid diagram showing the dependency matrix.
     * Uses a graph with weighted edges between all module pairs.
     */
    generate(): string {
        const modules = this.contract.declared.modules
        const matrix = this.computeMatrix()
        const lines: string[] = []

        lines.push('graph LR')
        lines.push('')

        // Module nodes
        for (const mod of modules) {
            const fnCount = Object.values(this.lock.functions)
                .filter(f => f.moduleId === mod.id).length
            lines.push(`    ${this.sanitizeId(mod.id)}["${mod.name}<br/>${fnCount} fn"]`)
        }
        lines.push('')

        // Weighted edges
        for (const [key, count] of matrix) {
            const [fromId, toId] = key.split('|')
            if (count > 0) {
                const thickness = count > 10 ? '==>' : count > 3 ? '-->' : '-.->'
                lines.push(`    ${this.sanitizeId(fromId)} ${thickness}|${count}| ${this.sanitizeId(toId)}`)
            }
        }

        lines.push('')
        lines.push('    classDef default fill:#ecf0f1,stroke:#34495e,color:#2c3e50')

        return lines.join('\n')
    }

    /**
     * Generate a markdown table showing the N×N dependency matrix.
     * Useful for claude.md or documentation.
     */
    generateTable(): string {
        const modules = this.contract.declared.modules
        const matrix = this.computeMatrix()
        const lines: string[] = []

        // Header
        lines.push('| From \\ To | ' + modules.map(m => m.name).join(' | ') + ' |')
        lines.push('| --- | ' + modules.map(() => '---').join(' | ') + ' |')

        // Rows
        for (const fromMod of modules) {
            const cells = modules.map(toMod => {
                if (fromMod.id === toMod.id) return '-'
                const count = matrix.get(`${fromMod.id}|${toMod.id}`) || 0
                return count > 0 ? String(count) : '0'
            })
            lines.push(`| **${fromMod.name}** | ${cells.join(' | ')} |`)
        }

        return lines.join('\n')
    }

    private computeMatrix(): Map<string, number> {
        const counts = new Map<string, number>()

        for (const fn of Object.values(this.lock.functions)) {
            for (const callTarget of fn.calls) {
                const targetFn = this.lock.functions[callTarget]
                if (targetFn && fn.moduleId !== targetFn.moduleId) {
                    const key = `${fn.moduleId}|${targetFn.moduleId}`
                    counts.set(key, (counts.get(key) || 0) + 1)
                }
            }
        }

        return counts
    }

    private sanitizeId(id: string): string {
        return id.replace(/[^a-zA-Z0-9_]/g, '_')
    }
}
