import type { MikkContract, MikkLock } from '@getmikk/core'
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

        // Find the best matching target — try functions first, then classes, then modules
        const matchedFunctions = this.findMatchingFunctions(prompt)
        const matchedClasses = this.findMatchingClasses(prompt)
        const matchedModule = this.findMatchingModule(prompt)

        // If prompt mentions "class" and we have a class match, prefer class-level targeting
        const prefersClass = promptLower.includes('class') && matchedClasses.length > 0

        for (const action of actions) {
            let resolvedAction = action

            // Smart reclassification:
            // - If action is "create" but a SPECIFIC FUNCTION already matches → "modify"
            //   (e.g., "add error handling to createZap" where createZap exists)
            // - Module-level matches are NOT reclassified — creating new things
            //   in existing modules is valid (e.g., "create a new auth handler")
            if (action === 'create') {
                if (matchedFunctions.length > 0 && matchedFunctions[0].score >= 0.5) {
                    resolvedAction = 'modify'
                }
                if (matchedClasses.length > 0 && matchedClasses[0].score >= 0.5) {
                    resolvedAction = 'modify'
                }
            }

            if (prefersClass) {
                // User explicitly mentioned "class" — target class-level
                for (const cls of matchedClasses.slice(0, 3)) {
                    intents.push({
                        action: resolvedAction,
                        target: {
                            type: 'class',
                            name: cls.name,
                            moduleId: cls.moduleId,
                            filePath: cls.file,
                        },
                        reason: prompt,
                        confidence: cls.score,
                    })
                }
            } else if (matchedFunctions.length > 0) {
                // Create an intent for each matched function (up to 3)
                for (const fn of matchedFunctions.slice(0, 3)) {
                    intents.push({
                        action: resolvedAction,
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
                    action: resolvedAction,
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
                    action: resolvedAction,
                    target: {
                        type: this.inferTargetType(prompt),
                        name: this.extractName(prompt),
                    },
                    reason: prompt,
                    confidence: 0.3,
                })
            }
        }

        // Deduplicate: if both "create" (reclassified to "modify") and "modify" exist
        // for the same target, keep only one
        const deduped: Intent[] = []
        const seen = new Set<string>()
        for (const intent of intents) {
            const key = `${intent.action}:${intent.target.name}:${intent.target.moduleId || ''}`
            if (!seen.has(key)) {
                seen.add(key)
                deduped.push(intent)
            }
        }

        return deduped
    }

    // ── Fuzzy Matching ───────────────────────────────────────────

    private findMatchingFunctions(prompt: string): Array<{ name: string; file: string; moduleId: string; score: number }> {
        const promptLower = prompt.toLowerCase()
        const keywords = this.extractKeywords(prompt)
        const results: Array<{ name: string; file: string; moduleId: string; score: number }> = []

        // Pre-compute keyword frequency across all function names for IDF-like penalization.
        // A keyword that matches many functions is less discriminative.
        const allFns = Object.values(this.lock.functions)
        const keywordFreq = new Map<string, number>()
        for (const kw of keywords) {
            let count = 0
            for (const fn of allFns) {
                if (fn.name.toLowerCase().includes(kw)) count++
            }
            keywordFreq.set(kw, count)
        }

        for (const fn of allFns) {
            let score = 0
            const fnNameLower = fn.name.toLowerCase()
            const fileLower = fn.file.toLowerCase()

            // Exact name match in prompt → very high score
            if (promptLower.includes(fnNameLower) && fnNameLower.length > 3) {
                score += 0.9
            }

            // Keyword matches in function name — penalize if keyword is too common
            for (const kw of keywords) {
                const freq = keywordFreq.get(kw) || 0
                // IDF-like penalization: if a keyword matches >40% of functions, reduce weight
                const idfPenalty = freq > allFns.length * 0.4 ? 0.3 : 1.0
                // Short keywords (3-4 chars) get reduced weight: "file" matches too many things
                const lengthPenalty = kw.length <= 4 ? 0.5 : 1.0

                const kwWeight = 0.3 * idfPenalty * lengthPenalty

                if (fnNameLower.includes(kw)) score += kwWeight
                if (fileLower.includes(kw)) score += 0.15 * idfPenalty * lengthPenalty
            }

            // CamelCase decomposition — compound matches worth more
            const fnWords = this.splitCamelCase(fn.name).map(w => w.toLowerCase())
            let camelMatchCount = 0
            for (const kw of keywords) {
                if (fnWords.some(w => w.startsWith(kw) || kw.startsWith(w))) {
                    camelMatchCount++
                }
            }
            // Multi-word compound matches are more meaningful
            if (camelMatchCount >= 2) {
                score += 0.4  // Strong multi-word match
            } else if (camelMatchCount === 1) {
                const freq = keywords.length > 0
                    ? keywordFreq.get(keywords.find(kw =>
                        fnWords.some(w => w.startsWith(kw) || kw.startsWith(w))) || '') || 0
                    : 0
                const idfPenalty = freq > allFns.length * 0.4 ? 0.3 : 1.0
                score += 0.2 * idfPenalty
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

    private findMatchingClasses(prompt: string): Array<{ name: string; file: string; moduleId: string; score: number }> {
        if (!this.lock.classes) return []
        const promptLower = prompt.toLowerCase()
        const keywords = this.extractKeywords(prompt)
        const results: Array<{ name: string; file: string; moduleId: string; score: number }> = []

        for (const cls of Object.values(this.lock.classes)) {
            let score = 0
            const clsNameLower = cls.name.toLowerCase()

            // Exact class name match in prompt → very high score
            if (promptLower.includes(clsNameLower) && clsNameLower.length > 3) {
                score += 0.95  // Classes get slightly higher score than functions when explicitly named
            }

            // Keyword matches against class name
            for (const kw of keywords) {
                if (clsNameLower.includes(kw)) score += 0.3
            }

            // CamelCase decomposition
            const clsWords = this.splitCamelCase(cls.name).map(w => w.toLowerCase())
            for (const kw of keywords) {
                if (clsWords.some(w => w.startsWith(kw) || kw.startsWith(w))) {
                    score += 0.2
                }
            }

            if (score > 0.3) {
                results.push({
                    name: cls.name,
                    file: cls.file,
                    moduleId: cls.moduleId,
                    score: Math.min(score, 1.0),
                })
            }
        }

        return results.sort((a, b) => b.score - a.score)
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

        // Prefer CamelCase/PascalCase identifiers (likely code names)
        const camelCase = prompt.match(/\b([a-z]+[A-Z][a-zA-Z]*|[A-Z][a-z]+[A-Z][a-zA-Z]*)\b/)
        if (camelCase) return camelCase[1]

        // Filter out structural words from the last word fallback
        const structuralWords = new Set(['function', 'class', 'method', 'module', 'file', 'route', 'endpoint', 'handler', 'component', 'service', 'package'])
        const words = prompt.split(/\s+/).filter(w => w.length > 2 && !structuralWords.has(w.toLowerCase()))
        return words[words.length - 1] || 'unknown'
    }

    private extractKeywords(text: string): string[] {
        const stopWords = new Set([
            'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'and',
            'or', 'is', 'are', 'was', 'be', 'not', 'no', 'from', 'with',
            'add', 'create', 'modify', 'change', 'update', 'delete', 'remove',
            'fix', 'move', 'refactor', 'new', 'old', 'all', 'this', 'that',
            'should', 'can', 'will', 'must', 'need', 'want', 'please',
            'function', 'method', 'class', 'module', 'file', 'package',
            'endpoint', 'route', 'handler', 'component', 'service',
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
