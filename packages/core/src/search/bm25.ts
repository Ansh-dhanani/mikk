/**
 * BM25 Search Index — Okapi BM25 ranking for function search.
 *
 * BM25 is a probabilistic ranking function that considers:
 *   - Term frequency (TF) — how often query terms appear in a document
 *   - Inverse document frequency (IDF) — rarity of terms across all documents
 *   - Document length normalization — penalizes very long documents
 *
 * This gives dramatically better search results than naive substring matching.
 * Combined with substring matching via Reciprocal Rank Fusion (RRF), it
 * produces GitNexus-quality hybrid search.
 *
 * @module
 */

/** A searchable document with an ID and tokenized content */
interface BM25Document {
    id: string
    tokens: string[]
    length: number
}

/** A single search result with score */
export interface BM25Result {
    id: string
    score: number
}

/** BM25 parameters */
const K1 = 1.2    // Term frequency saturation — higher = more weight on TF
const B = 0.75    // Document length normalization — 0 = no normalization, 1 = full

/**
 * In-memory BM25 index. Build once, query many times.
 *
 * Usage:
 *   const index = new BM25Index()
 *   index.addDocument('fn:auth.ts:verify', ['verify', 'token', 'jwt', 'auth'])
 *   index.addDocument('fn:user.ts:getUser', ['get', 'user', 'fetch', 'database'])
 *   const results = index.search('verify jwt token')
 */
export class BM25Index {
    private documents: BM25Document[] = []
    private documentFrequency = new Map<string, number>()  // term → how many docs contain it
    private avgDocLength = 0
    private totalDocLength = 0  // running total — avoids O(n²) recompute on every addDocument

    /** Clear the index */
    clear(): void {
        this.documents = []
        this.documentFrequency.clear()
        this.avgDocLength = 0
        this.totalDocLength = 0
    }

    /** Add a document with pre-tokenized terms */
    addDocument(id: string, tokens: string[]): void {
        const normalizedTokens = tokens.map(t => t.toLowerCase())
        this.documents.push({ id, tokens: normalizedTokens, length: normalizedTokens.length })

        // Count unique terms for IDF
        const uniqueTerms = new Set(normalizedTokens)
        for (const term of uniqueTerms) {
            this.documentFrequency.set(term, (this.documentFrequency.get(term) ?? 0) + 1)
        }

        // O(1) running average — was O(n) reduce over all documents on every insert
        this.totalDocLength += normalizedTokens.length
        this.avgDocLength = this.totalDocLength / this.documents.length
    }

    /** Search the index and return ranked results */
    search(query: string, limit = 20): BM25Result[] {
        const queryTokens = tokenize(query)
        if (queryTokens.length === 0 || this.documents.length === 0) return []

        const N = this.documents.length
        const results: BM25Result[] = []

        for (const doc of this.documents) {
            let score = 0

            for (const term of queryTokens) {
                const df = this.documentFrequency.get(term) ?? 0
                if (df === 0) continue

                // IDF: log((N - df + 0.5) / (df + 0.5) + 1)
                const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1)

                // TF in this document
                let tf = 0
                for (const t of doc.tokens) {
                    if (t === term) tf++
                }

                // BM25 score component
                const tfNorm = (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (doc.length / this.avgDocLength)))
                let termScore = idf * tfNorm

                // Extract function name from ID for better matching
                // ID format: fn:path:functionName
                const fnNameInId = doc.id.includes(':')
                    ? doc.id.split(':').pop()?.toLowerCase() ?? doc.id.toLowerCase()
                    : doc.id.toLowerCase()

                // Strong bonus for name prefix match (login matches loginUser)
                if (fnNameInId.startsWith(term.toLowerCase())) {
                    termScore += 2.0
                }
                // Bonus for name contains match
                else if (fnNameInId.includes(term.toLowerCase())) {
                    termScore += 1.0
                }
                // Fallback: any ID match
                else if (doc.id.toLowerCase().includes(term.toLowerCase())) {
                    termScore += 0.5
                }

                score += termScore
            }

            if (score > 0) {
                results.push({ id: doc.id, score })
            }
        }

        // Sort by score descending
        results.sort((a, b) => b.score - a.score)
        return results.slice(0, limit)
    }
}

/**
 * Reciprocal Rank Fusion — merge multiple ranked lists into one.
 *
 * RRF is used by GitNexus to combine BM25 + semantic search. We use it
 * to combine BM25 + substring match results.
 *
 * Formula: score = Σ 1 / (k + rank_i)  where k = 60 (standard)
 */
export function reciprocalRankFusion(
    ...rankedLists: { id: string; score: number }[][]
): { id: string; score: number }[] {
    const K = 60 // Standard RRF constant
    const scores = new Map<string, number>()

    for (const list of rankedLists) {
        for (let rank = 0; rank < list.length; rank++) {
            const item = list[rank]
            scores.set(item.id, (scores.get(item.id) ?? 0) + 1 / (K + rank + 1))
        }
    }

    return [...scores.entries()]
        .map(([id, score]) => ({ id, score }))
        .sort((a, b) => b.score - a.score)
}

/**
 * Tokenize a string into searchable terms.
 *
 * Handles:
 *   - camelCase splitting: "parseFiles" → ["parse", "files"]
 *   - snake_case splitting: "parse_files" → ["parse", "files"]
 *   - kebab-case splitting: "parse-files" → ["parse", "files"]
 *   - Lowercasing
 *   - Minimum 2-char filter
 */
export function tokenize(text: string): string[] {
    const tokens: string[] = []
    // Removed NFKD normalization as it conflates distinct Unicode symbols (T38)
    const normalized = text
    // Split on non-alphanumeric chars (Unicode-aware)
    const words = normalized.split(/[^\p{L}\p{N}]+/u).filter(Boolean)

    for (const word of words) {
        // Split camelCase: "parseFiles" → ["parse", "Files"] (Unicode-aware)
        const camelParts = word.replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2').split(' ')

        for (const part of camelParts) {
            const lower = part.toLowerCase()
            if (lower.length >= 2) {
                tokens.push(lower)
            }
        }
    }

    return tokens
}

/**
 * Build search tokens for a function — combines name, purpose, params, file path, and body.
 * This gives BM25 rich content to index beyond just the function name.
 */
export function buildFunctionTokens(fn: {
    name: string
    file: string
    purpose?: string
    params?: { name: string; type: string }[]
    returnType?: string
    body?: string
}): string[] {
    const parts: string[] = []

    parts.push(...tokenize(fn.name))
    parts.push(...tokenize(fn.name))
    parts.push(...tokenize(fn.name))
    parts.push(`name_exact:${fn.name.toLowerCase()}`)

    const filename = fn.file.split('/').pop() ?? fn.file
    parts.push(...tokenize(filename.replace(/\.[^.]+$/, '')))

    if (fn.purpose) {
        parts.push(...tokenize(fn.purpose))
    }

    if (fn.params) {
        for (const p of fn.params) {
            parts.push(...tokenize(p.name))
            parts.push(...tokenize(p.type))
        }
    }

    if (fn.returnType) {
        parts.push(...tokenize(fn.returnType))
    }

    if (fn.body) {
        const cleanedBody = cleanCodeForTokens(fn.body)
        const bodyTokens = tokenize(cleanedBody).slice(0, 50)
        parts.push(...bodyTokens)
    }

    return parts
}

function cleanCodeForTokens(code: string): string {
    return code
        .replace(/\/\*\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' ')
        .replace(/#.*$/gm, ' ')
        .replace(/['"`][^'"`]*['"`]/g, ' ')
        .replace(/\d+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}
