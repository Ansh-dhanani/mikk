import type { MikkLock, MikkLockFunction } from '../contract/schema.js'

/**
 * FuzzyMatcher — scores lock file functions against a search term or prompt.
 *
 * Used for:
 * - "Did you mean?" suggestions when a function name isn't found
 * - Ranking functions by relevance to a developer's prompt
 * - Seed selection for context generation
 *
 * Per spec Section 6: scoring uses exact match, keyword overlap,
 * camelCase decomposition, and Levenshtein distance.
 */

// ── Public API ───────────────────────────────────────────────

export interface FuzzyMatch {
    name: string
    file: string
    moduleId: string
    score: number
}

/**
 * Score every function in the lock against a prompt and return
 * the top matches sorted by relevance.
 */
export function scoreFunctions(
    prompt: string,
    lock: MikkLock,
    maxResults = 10
): FuzzyMatch[] {
    const keywords = extractKeywords(prompt)
    const promptLower = prompt.toLowerCase()
    const results: FuzzyMatch[] = []

    for (const fn of Object.values(lock.functions)) {
        const score = scoreSingleFunction(fn, promptLower, keywords)
        if (score > 0.2) {
            results.push({
                name: fn.name,
                file: fn.file,
                moduleId: fn.moduleId,
                score: Math.min(score, 1.0),
            })
        }
    }

    return results
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults)
}

/**
 * Find functions whose names are similar to `searchTerm` — for
 * "Did you mean?" suggestions when an exact match is not found.
 */
export function findFuzzyMatches(
    searchTerm: string,
    lock: MikkLock,
    maxResults = 5
): string[] {
    const searchLower = searchTerm.toLowerCase()
    const scored: { name: string; score: number }[] = []

    for (const fn of Object.values(lock.functions)) {
        const nameLower = fn.name.toLowerCase()

        // Levenshtein distance normalized by length
        const distance = levenshtein(searchLower, nameLower)
        const maxLen = Math.max(searchLower.length, nameLower.length)
        const similarity = 1 - (distance / maxLen)

        // Substring containment bonus
        const containsScore =
            nameLower.includes(searchLower) || searchLower.includes(nameLower)
                ? 0.3
                : 0

        const totalScore = similarity + containsScore

        if (totalScore > 0.5) {
            scored.push({ name: fn.name, score: totalScore })
        }
    }

    return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults)
        .map(s => s.name)
}

// ── Scoring ──────────────────────────────────────────────────

function scoreSingleFunction(
    fn: MikkLockFunction,
    promptLower: string,
    keywords: string[]
): number {
    let score = 0
    const fnNameLower = fn.name.toLowerCase()
    const fileLower = fn.file.toLowerCase()

    // Exact name match in prompt → very high
    if (promptLower.includes(fnNameLower) && fnNameLower.length > 3) {
        score += 0.9
    }

    // Keyword → function name matches
    for (const kw of keywords) {
        if (fnNameLower.includes(kw)) score += 0.3
        if (fileLower.includes(kw)) score += 0.15
    }

    // CamelCase word partial matches
    const fnWords = splitCamelCase(fn.name).map(w => w.toLowerCase())
    for (const kw of keywords) {
        if (fnWords.some(w => w.startsWith(kw) || kw.startsWith(w))) {
            score += 0.2
        }
    }

    // Module match — "fix auth bug" → functions in auth module score higher
    for (const kw of keywords) {
        if (fn.moduleId.toLowerCase().includes(kw)) score += 0.25
    }

    return score
}

// ── Levenshtein Distance ─────────────────────────────────────

/**
 * Standard Levenshtein edit distance. O(n*m) time, O(min(n,m)) space.
 */
export function levenshtein(a: string, b: string): number {
    if (a.length === 0) return b.length
    if (b.length === 0) return a.length

    // Ensure a is the shorter string for space efficiency
    if (a.length > b.length) [a, b] = [b, a]

    let prev = Array.from({ length: a.length + 1 }, (_, i) => i)
    let curr = new Array<number>(a.length + 1)

    for (let j = 1; j <= b.length; j++) {
        curr[0] = j
        for (let i = 1; i <= a.length; i++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1
            curr[i] = Math.min(
                prev[i] + 1,      // deletion
                curr[i - 1] + 1,  // insertion
                prev[i - 1] + cost // substitution
            )
        }
        ;[prev, curr] = [curr, prev]
    }

    return prev[a.length]
}

// ── Helpers ──────────────────────────────────────────────────

export function splitCamelCase(name: string): string[] {
    return name
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .split(/[\s_-]+/)
        .filter(w => w.length > 0)
}

export function extractKeywords(text: string): string[] {
    const stopWords = new Set([
        'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or',
        'is', 'it', 'fix', 'add', 'update', 'change', 'modify', 'make', 'create',
        'bug', 'issue', 'error', 'problem', 'feature', 'function', 'file', 'code',
        'new', 'old', 'all', 'this', 'that', 'from', 'with', 'move', 'remove',
        'delete', 'refactor', 'should', 'can', 'will', 'must', 'need', 'want',
    ])

    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !stopWords.has(w))
}
