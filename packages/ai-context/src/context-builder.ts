import type { MikkContract, MikkLock } from '@mikk/core'
import type { AIContext, ContextQuery, ContextModule, ContextFunction } from './types.js'

/**
 * ContextBuilder — builds structured architectural context from
 * the contract and lock file for AI model consumption.
 */
export class ContextBuilder {
    constructor(
        private contract: MikkContract,
        private lock: MikkLock
    ) { }

    /** Build AI context for a given query */
    build(query: ContextQuery): AIContext {
        const relevantModules = this.findRelevantModules(query)
        const contextModules = relevantModules.map(modId => this.buildModuleContext(modId, query))

        return {
            project: {
                name: this.contract.project.name,
                language: this.contract.project.language,
                description: this.contract.project.description,
                moduleCount: this.contract.declared.modules.length,
                functionCount: Object.keys(this.lock.functions).length,
            },
            modules: contextModules,
            constraints: this.contract.declared.constraints,
            decisions: this.contract.declared.decisions.map(d => ({
                title: d.title,
                reason: d.reason,
            })),
            prompt: this.generatePrompt(query, contextModules),
        }
    }

    /** Find which modules are relevant to the query */
    private findRelevantModules(query: ContextQuery): string[] {
        // If specific modules requested, use those
        if (query.focusModules && query.focusModules.length > 0) {
            return query.focusModules
        }

        // If specific files requested, find their modules
        if (query.focusFiles && query.focusFiles.length > 0) {
            const moduleIds = new Set<string>()
            for (const file of query.focusFiles) {
                const lockFile = this.lock.files[file]
                if (lockFile) moduleIds.add(lockFile.moduleId)
            }
            return [...moduleIds]
        }

        // Otherwise, try to match task keywords against module names
        const taskLower = query.task.toLowerCase()
        const matched = this.contract.declared.modules
            .filter(m =>
                taskLower.includes(m.id.toLowerCase()) ||
                taskLower.includes(m.name.toLowerCase())
            )
            .map(m => m.id)

        // If nothing matched, include all modules
        return matched.length > 0 ? matched : this.contract.declared.modules.map(m => m.id)
    }

    /** Build context for a single module */
    private buildModuleContext(moduleId: string, query: ContextQuery): ContextModule {
        const module = this.contract.declared.modules.find(m => m.id === moduleId)
        const maxFunctions = query.maxFunctions || 50

        // Get all functions in this module
        const moduleFunctions = Object.values(this.lock.functions)
            .filter(fn => fn.moduleId === moduleId)
            .slice(0, maxFunctions)

        const contextFunctions: ContextFunction[] = moduleFunctions.map(fn => ({
            name: fn.name,
            file: fn.file,
            startLine: fn.startLine,
            endLine: fn.endLine,
            calls: query.includeCallGraph !== false ? fn.calls : [],
            calledBy: query.includeCallGraph !== false ? fn.calledBy : [],
        }))

        // Get files in this module
        const moduleFiles = Object.values(this.lock.files)
            .filter(f => f.moduleId === moduleId)
            .map(f => f.path)

        return {
            id: moduleId,
            name: module?.name || moduleId,
            description: module?.description || '',
            intent: module?.intent,
            functions: contextFunctions,
            files: moduleFiles,
        }
    }

    /** Generate the AI prompt from context */
    private generatePrompt(query: ContextQuery, modules: ContextModule[]): string {
        const lines: string[] = []

        lines.push('ARCHITECTURAL CONTEXT FOR THIS TASK:')
        lines.push('')
        lines.push(`Project: ${this.contract.project.name} (${this.contract.project.language})`)
        lines.push(`Description: ${this.contract.project.description}`)
        lines.push('')

        for (const mod of modules) {
            lines.push(`## Module: ${mod.name} (${mod.id})`)
            lines.push(mod.description)
            if (mod.intent) lines.push(`Intent: ${mod.intent}`)
            lines.push('')

            if (mod.functions.length > 0) {
                lines.push('Functions:')
                for (const fn of mod.functions) {
                    const callStr = fn.calls.length > 0 ? ` → calls: ${fn.calls.join(', ')}` : ''
                    lines.push(`  - ${fn.name} (${fn.file}:${fn.startLine}-${fn.endLine})${callStr}`)
                }
                lines.push('')
            }
        }

        if (this.contract.declared.constraints.length > 0) {
            lines.push('CONSTRAINTS (you MUST respect these):')
            for (const c of this.contract.declared.constraints) {
                lines.push(`  • ${c}`)
            }
            lines.push('')
        }

        if (this.contract.declared.decisions.length > 0) {
            lines.push('ARCHITECTURAL DECISIONS:')
            for (const d of this.contract.declared.decisions) {
                lines.push(`  • ${d.title}: ${d.reason}`)
            }
            lines.push('')
        }

        return lines.join('\n')
    }
}
