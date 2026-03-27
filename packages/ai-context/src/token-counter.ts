/**
 * Token Counter — accurate, fast token estimation for context budget management.
 *
 * Design:
 *  - `countTokens(text)` — accurate, linear-scan, O(n)
 *  - `countTokensFast(text)` — single-pass heuristic, O(n) for hot paths
 *  - `estimateFileTokens(content, path)` — file-type-aware wrapper
 *  - `TokenBudget` — budget manager with truncation
 *
 * The previous implementation used a character-position Set to track processed
 * ranges across multiple regex scans — O(n²) per call on large files.
 * Replaced with a single linear scan that categorises characters without
 * per-character Set lookups.
 */

const CHARS_PER_TOKEN     = 3.8  // GPT-4 average
const MIN_CHARS_PER_TOKEN = 2.0  // Dense code
const MAX_CHARS_PER_TOKEN = 6.0  // Sparse natural language

/**
 * Count tokens with reasonable accuracy — O(n) single linear scan.
 *
 * Classifies runs of characters into:
 *   - whitespace: free (separators, not tokens)
 *   - string literals: ~4 chars/token
 *   - digit runs: ~2 chars/token (numbers tokenise finely)
 *   - identifiers/keywords: short → 1 token, long → ~3.5 chars/token
 *   - operators/punctuation: 1 char = 1 token
 */
export function countTokens(text: string): number {
    if (!text) return 0

    let tokens = 0
    let i = 0
    const n = text.length

    while (i < n) {
        const ch = text[i]

        // Whitespace — boundary only, no token cost
        if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
            i++
            continue
        }

        // String literals — scan to closing quote
        if (ch === '"' || ch === "'" || ch === '`') {
            const q = ch
            let len = 1
            i++
            while (i < n) {
                if (text[i] === '\\') { i += 2; len += 2; continue }
                if (text[i] === q) { i++; len++; break }
                i++; len++
            }
            tokens += Math.max(1, Math.ceil(len / 4))
            continue
        }

        // Digit runs — token-heavy
        if (ch >= '0' && ch <= '9') {
            let len = 0
            while (i < n && ((text[i] >= '0' && text[i] <= '9') || text[i] === '.')) {
                i++; len++
            }
            tokens += Math.max(1, Math.ceil(len / 2))
            continue
        }

        // Identifier / keyword runs
        if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_' || ch === '$') {
            let len = 0
            while (
                i < n &&
                ((text[i] >= 'a' && text[i] <= 'z') || (text[i] >= 'A' && text[i] <= 'Z') ||
                 (text[i] >= '0' && text[i] <= '9') || text[i] === '_' || text[i] === '$')
            ) { i++; len++ }
            tokens += len <= 6 ? 1 : Math.ceil(len / 3.5)
            continue
        }

        // Operators, punctuation, brackets — 1 char per token
        tokens++
        i++
    }

    const minEstimate = Math.ceil(text.length / MAX_CHARS_PER_TOKEN)
    const maxEstimate = Math.ceil(text.length / MIN_CHARS_PER_TOKEN)
    return Math.max(minEstimate, Math.min(maxEstimate, tokens))
}

/**
 * Fast O(n) single-pass heuristic for hot paths (context builder scoring loops).
 */
export function countTokensFast(text: string): number {
    if (!text) return 0

    let alphaNum = 0, punct = 0
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i)
        if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57)) {
            alphaNum++
        } else if (c !== 32 && c !== 9 && c !== 10 && c !== 13) {
            punct++
        }
    }

    const nonWs = alphaNum + punct
    if (nonWs === 0) return 0

    const punctRatio = nonWs > 0 ? punct / nonWs : 0
    const charsPerToken = punctRatio > 0.3 ? 2.8 : CHARS_PER_TOKEN
    return Math.max(1, Math.ceil(text.length / charsPerToken))
}

/**
 * Estimate tokens for a file with content-type awareness.
 */
export function estimateFileTokens(content: string, filePath: string): number {
    const ext = filePath.split('.').pop()?.toLowerCase()
    if (ext === 'md') return Math.ceil(countTokens(content) * 0.9)
    return countTokens(content)
}

/**
 * Token budget manager — tracks usage and truncates content to fit.
 */
export class TokenBudget {
    private used = 0

    constructor(
        private readonly maxTokens: number,
        private readonly overflowAllowance: number = 0.1,
    ) {}

    get remaining(): number {
        return Math.max(0, this.maxTokens - this.used)
    }

    fits(content: string): boolean {
        return countTokensFast(content) <= this.remaining * (1 + this.overflowAllowance)
    }

    consume(tokens: number): boolean {
        this.used += tokens
        return this.used <= this.maxTokens * (1 + this.overflowAllowance)
    }

    truncate(content: string): string {
        if (this.remaining <= 0) return ''
        const estimated = countTokensFast(content)
        if (estimated <= this.remaining) return content
        const ratio = this.remaining / estimated
        const cutAt = Math.floor(content.length * ratio * 0.9)
        return content.slice(0, cutAt) + '\n… [truncated — token budget reached]'
    }
}
