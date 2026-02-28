import type { MikkContract, MikkLock } from '@mikk/core'
import { IntentSchema, type Intent } from './types.js'

/**
 * IntentInterpreter — converts a raw user prompt into structured
 * candidate intents. Currently uses heuristics; can be swapped
 * for an AI-powered interpreter.
 */
export class IntentInterpreter {
    constructor(
        private contract: MikkContract,
        private lock: MikkLock
    ) { }

    /** Parse raw prompt into candidate intents */
    async interpret(prompt: string): Promise<Intent[]> {
        const intents: Intent[] = []
        const promptLower = prompt.toLowerCase()

        // Heuristic-based intent detection
        if (promptLower.includes('add') || promptLower.includes('create')) {
            intents.push(this.createIntent('create', prompt))
        }
        if (promptLower.includes('modify') || promptLower.includes('change') || promptLower.includes('update')) {
            intents.push(this.createIntent('modify', prompt))
        }
        if (promptLower.includes('delete') || promptLower.includes('remove')) {
            intents.push(this.createIntent('delete', prompt))
        }
        if (promptLower.includes('refactor') || promptLower.includes('restructure')) {
            intents.push(this.createIntent('refactor', prompt))
        }
        if (promptLower.includes('move')) {
            intents.push(this.createIntent('move', prompt))
        }

        // If no action detected, assume modify
        if (intents.length === 0) {
            intents.push(this.createIntent('modify', prompt))
        }

        return intents
    }

    private createIntent(action: Intent['action'], prompt: string): Intent {
        // Try to find the target from the prompt
        const targetModule = this.findMatchingModule(prompt)
        const targetFunction = this.findMatchingFunction(prompt)

        return {
            action,
            target: {
                type: targetFunction ? 'function' : targetModule ? 'module' : 'file',
                name: targetFunction?.name || targetModule?.name || this.extractName(prompt),
                moduleId: targetModule?.id || targetFunction?.moduleId,
                filePath: targetFunction?.file,
            },
            reason: prompt,
            confidence: targetFunction ? 0.8 : targetModule ? 0.6 : 0.3,
        }
    }

    private findMatchingModule(prompt: string): { id: string; name: string } | null {
        const promptLower = prompt.toLowerCase()
        for (const module of this.contract.declared.modules) {
            if (promptLower.includes(module.id) || promptLower.includes(module.name.toLowerCase())) {
                return { id: module.id, name: module.name }
            }
        }
        return null
    }

    private findMatchingFunction(prompt: string): { name: string; file: string; moduleId: string } | null {
        const promptLower = prompt.toLowerCase()
        for (const fn of Object.values(this.lock.functions)) {
            if (promptLower.includes(fn.name.toLowerCase())) {
                return { name: fn.name, file: fn.file, moduleId: fn.moduleId }
            }
        }
        return null
    }

    private extractName(prompt: string): string {
        const words = prompt.split(' ')
        // Return the last quoted word or the last capitalized word
        for (const word of words) {
            if (word.startsWith('"') || word.startsWith("'")) {
                return word.replace(/['"]/g, '')
            }
        }
        return words[words.length - 1]
    }
}
