import * as path from 'node:path'
import type { MikkContract, MikkLock } from '@getmikk/core'

/** Maximum functions to show in a single module diagram before collapsing */
const MAX_FUNCTIONS_PER_DIAGRAM = 40

/** Maximum files to show as subgraphs before collapsing smallest ones */
const MAX_FILES_PER_DIAGRAM = 15

/**
 * ModuleDiagramGenerator — generates a detailed Mermaid diagram for a
 * single module, showing its internal files and function call graph.
 * For large modules, collapses internal-only functions to keep diagrams readable.
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

        const moduleFunctions = Object.values(this.lock.functions).filter(f => f.moduleId === moduleId)

        // If the module is very large, only show "important" functions:
        // - Exported functions (called by other modules)
        // - Entry points (called by nothing internal)
        // - Functions that call or are called by other modules
        // - Top-N most-connected functions
        let visibleFunctions = moduleFunctions
        let collapsedCount = 0

        if (moduleFunctions.length > MAX_FUNCTIONS_PER_DIAGRAM) {
            const importantFns = new Set<string>()

            for (const fn of moduleFunctions) {
                // Entry points — nothing internal calls them
                const isEntryPoint = fn.calledBy.length === 0
                // Cross-module caller or callee
                const hasCrossModuleCalls = fn.calls.some(id => {
                    const target = this.lock.functions[id]
                    return target && target.moduleId !== moduleId
                })
                const isCalledCrossModule = fn.calledBy.some(id => {
                    const caller = this.lock.functions[id]
                    return caller && caller.moduleId !== moduleId
                })
                // Exported
                const isExported = fn.isExported

                if (isEntryPoint || hasCrossModuleCalls || isCalledCrossModule || isExported) {
                    importantFns.add(fn.id)
                }
            }

            // If still too many, pick the most connected ones
            if (importantFns.size > MAX_FUNCTIONS_PER_DIAGRAM) {
                const sorted = [...importantFns]
                    .map(id => ({ id, connections: (this.lock.functions[id]?.calls.length || 0) + (this.lock.functions[id]?.calledBy.length || 0) }))
                    .sort((a, b) => b.connections - a.connections)
                    .slice(0, MAX_FUNCTIONS_PER_DIAGRAM)
                    .map(x => x.id)
                importantFns.clear()
                for (const id of sorted) importantFns.add(id)
            }

            // If too few important functions, add the most connected ones
            if (importantFns.size < Math.min(10, moduleFunctions.length)) {
                const sorted = moduleFunctions
                    .filter(fn => !importantFns.has(fn.id))
                    .sort((a, b) => (b.calls.length + b.calledBy.length) - (a.calls.length + a.calledBy.length))
                for (const fn of sorted) {
                    if (importantFns.size >= MAX_FUNCTIONS_PER_DIAGRAM) break
                    importantFns.add(fn.id)
                }
            }

            visibleFunctions = moduleFunctions.filter(fn => importantFns.has(fn.id))
            collapsedCount = moduleFunctions.length - visibleFunctions.length
        }

        const lines: string[] = []
        lines.push('%%{init: {"theme": "base", "themeVariables": {"primaryColor": "#1e293b", "primaryTextColor": "#e2e8f0", "lineColor": "#64748b", "secondaryColor": "#334155", "tertiaryColor": "#475569", "background": "#0f172a", "mainBkg": "#1e293b", "nodeBorder": "#475569"}}}%%')
        lines.push(`graph TD`)
        lines.push(`    subgraph mod_${this.sanitizeId(moduleId)}["📦 Module: ${module.name}${collapsedCount > 0 ? ` (${collapsedCount} internal functions collapsed)` : ''}"]`)

        // Group functions by file
        const functionsByFile = new Map<string, typeof visibleFunctions>()
        for (const fn of visibleFunctions) {
            if (!functionsByFile.has(fn.file)) {
                functionsByFile.set(fn.file, [])
            }
            functionsByFile.get(fn.file)!.push(fn)
        }

        // If too many files, collapse the smallest ones into a summary node
        let filesToRender = [...functionsByFile.entries()]
        let collapsedFiles = 0
        if (filesToRender.length > MAX_FILES_PER_DIAGRAM) {
            // Sort by function count, keep the largest files
            filesToRender.sort((a, b) => b[1].length - a[1].length)
            const kept = filesToRender.slice(0, MAX_FILES_PER_DIAGRAM)
            const dropped = filesToRender.slice(MAX_FILES_PER_DIAGRAM)
            collapsedFiles = dropped.length
            const droppedFnCount = dropped.reduce((sum, [, fns]) => sum + fns.length, 0)
            filesToRender = kept

            // Add a summary node for collapsed files
            lines.push(`        collapsed_files["📁 +${collapsedFiles} more files (${droppedFnCount} functions)"]`)
        }

        // Add file subgraphs
        for (const [filePath, fns] of filesToRender) {
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

        // Add call edges (only for visible functions)
        const visibleIds = new Set(visibleFunctions.map(fn => fn.id))
        for (const fn of visibleFunctions) {
            for (const callTarget of fn.calls) {
                const targetFn = this.lock.functions[callTarget]
                if (targetFn) {
                    if (targetFn.moduleId === moduleId && visibleIds.has(callTarget)) {
                        // Internal call (both visible)
                        lines.push(`    ${this.sanitizeId(fn.id)} --> ${this.sanitizeId(callTarget)}`)
                    } else if (targetFn.moduleId !== moduleId) {
                        // External call
                        const targetMod = targetFn.moduleId
                        lines.push(`    ${this.sanitizeId(fn.id)} -.->|"calls"| ext_${this.sanitizeId(callTarget)}["🔗 ${targetFn.name}<br/>(${targetMod})"]`)
                    }
                }
            }
        }

        lines.push('')
        lines.push('    classDef default fill:#334155,stroke:#64748b,color:#e2e8f0,stroke-width:1px')
        lines.push('    classDef external fill:#1e293b,stroke:#475569,color:#94a3b8,stroke-dasharray: 5 5')

        return lines.join('\n')
    }

    private sanitizeId(id: string): string {
        return id.replace(/[^a-zA-Z0-9_]/g, '_')
    }
}
