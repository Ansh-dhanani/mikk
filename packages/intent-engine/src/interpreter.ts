import type { MikkContract, MikkLock } from '@ansh_dhanani/core'
import { IntentSchema, type Intent } from './types.js'

/**
 * IntentInterpreter — parses a natural-language prompt into structured
 * intents using heuristic keyword matching and fuzzy matching against
 * the lock file's function/module names.
 */
export class IntentInterpreter {
    constructor(
        private contract: MikkContract,
        private lock: MikkLock
    ) { }

    async interpret(prompt: string): Promise<Intent[]> {
        const intents: Intent[] = []
        const promptLower = prompt.toLowerCase()

        // Detect action verbs
        const actions: Intent['action'][] = []
        if (promptLower.includes('add') || promptLower.includes('create') ||
            promptLower.includes('new') || promptLower.includes('implement')) {
            actions.push('create')
        }
        if (promptLower.includes('modify') || promptLower.includes('change') ||
            promptLower.includes('update') || promptLower.includes('fix') ||
            promptLower.includes('edit') || promptLower.includes('patch')) {
            actions.push('modify')
        }
        if (promptLower.includes('delete') || promptLower.includes('remove') ||
            promptLower.includes('drop')) {
            actions.push('delete')
        }
        if (promptLower.includes('refactor') || promptLower.includes('restructure') ||
            promptLower.includes('clean up') || promptLower.includes('reorganize')) {
            actions.push('refactor')
        }
        if (promptLower.includes('move') || promptLower.includes('migrate') ||
            promptLower.includes('relocate')) {
            actions.push('move')
        }

        // Default to modify if no action is detected
        if (actions.length === 0) {
            actions.push('modify')
        }

        // Find the best matching target — try functions first, then modules
        const matchedFunctions = this.findMatchingFunctions(prompt)
        const matchedModule = this.findMatchingModule(prompt)

        for (const action of actions) {
            if (matchedFunctions.length > 0) {
                // Create an intent for each matched function (up to 3)
                for (const fn of matchedFunctions.slice(0, 3)) {
                    intents.push({
                        action,
                        target: {
                            type: 'function',
                            name: fn.name,
                            moduleId: fn.moduleId,
                            filePath: fn.file,
                        },
                        reason: prompt,
                        confidence: fn.score,
                    })
                }
            } else if (matchedModule) {
                intents.push({
                    action,
                    target: {
                        type: 'module',
                        name: matchedModule.name,
                        moduleId: matchedModule.id,
                    },
                    reason: prompt,
                    confidence: matchedModule.score,
                })
            } else {
                // No match — use extracted name
                intents.push({
                    action,
                    target: {
                        type: this.inferTargetType(prompt),
                        name: this.extractName(prompt),
                    },
                    reason: prompt,
                    confidence: 0.3,
                })
            }
        }

        return intents
    }

    // ── Fuzzy Matching ───────────────────────────────────────────

    private findMatchingFunctions(prompt: string): Array<{ name: string; file: string; moduleId: string; score: number }> {
        const promptLower = prompt.toLowerCase()
        const keywords = this.extractKeywords(prompt)
        const results: Array<{ name: string; file: string; moduleId: string; score: number }> = []

        for (const fn of Object.values(this.lock.functions)) {
            let score = 0
            const fnNameLower = fn.name.toLowerCase()
            const fileLower = fn.file.toLowerCase()

            // Exact name match in prompt → very high score
            if (promptLower.includes(fnNameLower) && fnNameLower.length > 3) {
                score += 0.9
            }

            // Keyword matches in function name
            for (const kw of keywords) {
                if (fnNameLower.includes(kw)) score += 0.3
                if (fileLower.includes(kw)) score += 0.15
            }

            // CamelCase decomposition partial matches
            const fnWords = this.splitCamelCase(fn.name).map(w => w.toLowerCase())
            for (const kw of keywords) {
                if (fnWords.some(w => w.startsWith(kw) || kw.startsWith(w))) {
                    score += 0.2
                }
            }

            // Cap score at 1.0
            if (score > 0.3) {
                results.push({
                    name: fn.name,
                    file: fn.file,
                    moduleId: fn.moduleId,
                    score: Math.min(score, 1.0),
                })
            }
        }

        // Sort by score descending
        return results.sort((a, b) => b.score - a.score)
    }

    private findMatchingModule(prompt: string): { id: string; name: string; score: number } | null {
        const promptLower = prompt.toLowerCase()
        const keywords = this.extractKeywords(prompt)
        let bestMatch: { id: string; name: string; score: number } | null = null

        for (const module of this.contract.declared.modules) {
            let score = 0
            const moduleLower = module.name.toLowerCase()
            const moduleIdLower = module.id.toLowerCase()

            // Direct ID or name match
            if (promptLower.includes(moduleIdLower)) score += 0.8
            if (promptLower.includes(moduleLower)) score += 0.7

            // Keyword matches
            for (const kw of keywords) {
                if (moduleLower.includes(kw)) score += 0.2
                if (moduleIdLower.includes(kw)) score += 0.2
            }

            if (score > (bestMatch?.score || 0)) {
                bestMatch = { id: module.id, name: module.name, score: Math.min(score, 1.0) }
            }
        }

        return bestMatch && bestMatch.score > 0.3 ? bestMatch : null
    }

    // ── Helpers ───────────────────────────────────────────────────

    private inferTargetType(prompt: string): Intent['target']['type'] {
        const lower = prompt.toLowerCase()
        if (lower.includes('function') || lower.includes('method')) return 'function'
        if (lower.includes('class')) return 'class'
        if (lower.includes('module') || lower.includes('package')) return 'module'
        return 'file'
    }

    private extractName(prompt: string): string {
        // Try quoted strings first
        const quoted = prompt.match(/["'`]([^"'`]+)["'`]/)
        if (quoted) return quoted[1]

        // Try backtick code references
        const code = prompt.match(/`([^`]+)`/)
        if (code) return code[1]

        // Fall back to last meaningful word
        const words = prompt.split(/\s+/).filter(w => w.length > 2)
        return words[words.length - 1] || 'unknown'
    }

    private extractKeywords(text: string): string[] {
        const stopWords = new Set([
            'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'and',
            'or', 'is', 'are', 'was', 'be', 'not', 'no', 'from', 'with',
            'add', 'create', 'modify', 'change', 'update', 'delete', 'remove',
            'fix', 'move', 'refactor', 'new', 'old', 'all', 'this', 'that',
            'should', 'can', 'will', 'must', 'need', 'want', 'please',
        ])
        return text
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2 && !stopWords.has(w))
    }

    private splitCamelCase(name: string): string[] {
        return name
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
            .split(/[\s_-]+/)
            .filter(w => w.length > 0)
    }
}
