import type { MikkContract, MikkLock } from '@ansh-dhanani/core'

/**
 * FlowDiagramGenerator — generates sequence diagrams for specific
 * function call flows (e.g., "show me the HTTP request → response flow").
 * Outputs: .mikk/diagrams/flows/{flowName}.mmd
 */
export class FlowDiagramGenerator {
    constructor(
        private lock: MikkLock
    ) { }

    /** Generate a sequence diagram starting from a function */
    generate(startFunctionId: string, maxDepth: number = 5): string {
        const lines: string[] = []
        lines.push('sequenceDiagram')
        lines.push('')

        const visited = new Set<string>()
        this.traceFlow(startFunctionId, lines, visited, 0, maxDepth)

        if (lines.length <= 2) {
            lines.push(`    Note over ${this.sanitizeId(startFunctionId)}: No outgoing calls found`)
        }

        return lines.join('\n')
    }

    /** Generate a flow diagram showing all entry points grouped by module */
    generateEntryPoints(): string {
        const lines: string[] = []
        lines.push('graph TD')
        lines.push('')

        // Find functions with no callers (entry points)
        const allFunctions = Object.values(this.lock.functions)
        const entryPoints = allFunctions.filter(fn => fn.calledBy.length === 0)

        // Group entry points by module
        const entryByModule = new Map<string, typeof entryPoints>()
        for (const fn of entryPoints) {
            if (!entryByModule.has(fn.moduleId)) {
                entryByModule.set(fn.moduleId, [])
            }
            entryByModule.get(fn.moduleId)!.push(fn)
        }

        for (const [modId, fns] of entryByModule) {
            lines.push(`    subgraph mod_${this.sanitizeId(modId)}["📦 ${modId}"]`)
            for (const fn of fns) {
                lines.push(`        ${this.sanitizeId(fn.id)}["🚀 ${fn.name}<br/>(Entry)"]`)
            }
            lines.push('    end')
        }

        lines.push('')

        // Show first-level calls from entry points
        for (const fn of entryPoints) {
            const outEdges = fn.calls
            for (const targetId of outEdges) {
                const targetFn = this.lock.functions[targetId]
                if (targetFn) {
                    lines.push(`    ${this.sanitizeId(fn.id)} --> ${this.sanitizeId(targetId)}["${targetFn.name}"]`)
                }
            }
        }

        lines.push('')
        lines.push('    classDef default fill:#f9f9f9,stroke:#333')

        return lines.join('\n')
    }

    private traceFlow(
        fnId: string,
        lines: string[],
        visited: Set<string>,
        depth: number,
        maxDepth: number
    ): void {
        if (depth >= maxDepth || visited.has(fnId)) return
        visited.add(fnId)

        const fn = this.lock.functions[fnId]
        if (!fn) return

        const participant = this.getParticipantName(fn.moduleId, fn.name)

        for (const callTarget of fn.calls) {
            const targetFn = this.lock.functions[callTarget]
            if (!targetFn) continue

            const targetParticipant = this.getParticipantName(targetFn.moduleId, targetFn.name)
            lines.push(`    ${participant}->>+${targetParticipant}: ${fn.name}() → ${targetFn.name}()`)
            this.traceFlow(callTarget, lines, visited, depth + 1, maxDepth)
            lines.push(`    ${targetParticipant}-->>-${participant}: return`)
        }
    }

    private getParticipantName(moduleId: string, fnName: string): string {
        return this.sanitizeId(`${moduleId}_${fnName}`)
    }

    private sanitizeId(id: string): string {
        return id.replace(/[^a-zA-Z0-9_]/g, '_')
    }
}
