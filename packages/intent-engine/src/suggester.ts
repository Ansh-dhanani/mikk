import type { MikkContract, MikkLock } from '@ansh_dhanani/core'
import type { Intent, Suggestion } from './types.js'

/**
 * Suggester — given validated intents, produces implementation suggestions
 * with affected files, new files, and estimated impact.
 */
export class Suggester {
    constructor(
        private contract: MikkContract,
        private lock: MikkLock
    ) { }

    /** Generate suggestions for a list of intents */
    suggest(intents: Intent[]): Suggestion[] {
        return intents.map(intent => this.suggestForIntent(intent))
    }

    private suggestForIntent(intent: Intent): Suggestion {
        const affectedFiles: string[] = []
        const newFiles: string[] = []

        switch (intent.action) {
            case 'create': {
                // Find the target module's directory pattern
                const module = this.contract.declared.modules.find(m => m.id === intent.target.moduleId)
                if (module) {
                    const dir = module.paths[0]?.replace('/**', '') || 'src'
                    newFiles.push(`${dir}/${intent.target.name}.ts`)
                } else {
                    newFiles.push(`src/${intent.target.name}.ts`)
                }
                break
            }
            case 'modify': {
                if (intent.target.filePath) {
                    affectedFiles.push(intent.target.filePath)
                } else {
                    // Find files by function name
                    const fn = Object.values(this.lock.functions).find(
                        f => f.name === intent.target.name
                    )
                    if (fn) {
                        affectedFiles.push(fn.file)
                        // Add callers
                        for (const callerId of fn.calledBy) {
                            const caller = this.lock.functions[callerId]
                            if (caller) affectedFiles.push(caller.file)
                        }
                    }
                }
                break
            }
            case 'delete': {
                if (intent.target.filePath) {
                    affectedFiles.push(intent.target.filePath)
                }
                break
            }
            case 'refactor':
            case 'move': {
                if (intent.target.filePath) {
                    affectedFiles.push(intent.target.filePath)
                }
                // Add all files that import from the target
                const fn = Object.values(this.lock.functions).find(
                    f => f.name === intent.target.name
                )
                if (fn) {
                    for (const callerId of fn.calledBy) {
                        const caller = this.lock.functions[callerId]
                        if (caller && !affectedFiles.includes(caller.file)) {
                            affectedFiles.push(caller.file)
                        }
                    }
                }
                break
            }
        }

        return {
            intent,
            affectedFiles: [...new Set(affectedFiles)],
            newFiles,
            estimatedImpact: affectedFiles.length + newFiles.length,
            implementation: this.generateDescription(intent),
        }
    }

    private generateDescription(intent: Intent): string {
        switch (intent.action) {
            case 'create':
                return `Create new ${intent.target.type} "${intent.target.name}" in module ${intent.target.moduleId || 'auto-detected'}`
            case 'modify':
                return `Modify ${intent.target.type} "${intent.target.name}" — ${intent.reason}`
            case 'delete':
                return `Delete ${intent.target.type} "${intent.target.name}" and update all references`
            case 'refactor':
                return `Refactor ${intent.target.type} "${intent.target.name}" in place`
            case 'move':
                return `Move ${intent.target.type} "${intent.target.name}" to new location`
        }
    }
}
