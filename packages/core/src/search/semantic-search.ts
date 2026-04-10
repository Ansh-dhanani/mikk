/**
 * Semantic Code Search — code embeddings for semantic similarity search
 * Provides natural language code search and code-to-code similarity
 */

import type { MikkLock, MikkLockFunction } from '../contract/schema.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CodeEmbedding {
  id: string
  vector: number[]
  metadata: {
    name: string
    file: string
    moduleId: string
    purpose?: string
    params?: string
    returnType?: string
  }
}

export interface SemanticSearchResult {
  functionId: string
  name: string
  file: string
  moduleId: string
  score: number
  purpose?: string
  snippet?: string
}

export interface SemanticSearchOptions {
  limit?: number
  minScore?: number
  filterModule?: string
  filterFile?: string
}

interface EmbeddingIndex {
  functions: Map<string, CodeEmbedding>
  dimensions: number
  indexedAt: number
}

// ---------------------------------------------------------------------------
// Simple embedding model using TF-IDF-like approach
// For production, would use transformer-based embeddings
// ---------------------------------------------------------------------------

export class SemanticCodeSearch {
  private lock: MikkLock
  private index: EmbeddingIndex | null = null
  private readonly DIMENSIONS = 128

  constructor(lock: MikkLock) {
    this.lock = lock
  }

  /**
   * Build semantic index from lock file
   */
  async buildIndex(): Promise<void> {
    const functions = Object.values(this.lock.functions)
    const embeddings = new Map<string, CodeEmbedding>()

    for (const fn of functions) {
      const vector = this.computeEmbedding(fn)
      embeddings.set(fn.id, {
        id: fn.id,
        vector,
        metadata: {
          name: fn.name,
          file: fn.file,
          moduleId: fn.moduleId,
          purpose: fn.purpose,
          params: fn.params?.map(p => p.name).join(', '),
          returnType: fn.returnType,
        },
      })
    }

    this.index = {
      functions: embeddings,
      dimensions: this.DIMENSIONS,
      indexedAt: Date.now(),
    }
  }

  /**
   * Search code using natural language query
   */
  async search(query: string, options: SemanticSearchOptions = {}): Promise<SemanticSearchResult[]> {
    if (!this.index) {
      await this.buildIndex()
    }

    const queryVector = this.computeQueryEmbedding(query)
    const results: Array<{ fn: MikkLockFunction; score: number }> = []

    const functions = Object.values(this.lock.functions)
    for (const fn of functions) {
      const embedding = this.index!.functions.get(fn.id)
      if (!embedding) continue

      // Filter by module if specified
      if (options.filterModule && fn.moduleId !== options.filterModule) continue

      // Filter by file if specified
      if (options.filterFile && !fn.file.includes(options.filterFile)) continue

      const score = this.cosineSimilarity(queryVector, embedding.vector)

      if (score >= (options.minScore ?? 0)) {
        results.push({ fn, score })
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score)

    const limit = options.limit ?? 20
    return results.slice(0, limit).map(({ fn, score }) => ({
      functionId: fn.id,
      name: fn.name,
      file: fn.file,
      moduleId: fn.moduleId,
      score,
      purpose: fn.purpose,
    }))
  }

  /**
   * Find similar code to given code snippet
   */
  async findSimilarCode(code: string, options: SemanticSearchOptions = {}): Promise<SemanticSearchResult[]> {
    if (!this.index) {
      await this.buildIndex()
    }

    const codeVector = this.computeCodeEmbedding(code)
    const results: Array<{ fn: MikkLockFunction; score: number }> = []

    const functions = Object.values(this.lock.functions)
    for (const fn of functions) {
      const embedding = this.index!.functions.get(fn.id)
      if (!embedding) continue

      const score = this.cosineSimilarity(codeVector, embedding.vector)

      if (score >= (options.minScore ?? 0.3)) {
        results.push({ fn, score })
      }
    }

    results.sort((a, b) => b.score - a.score)

    const limit = options.limit ?? 10
    return results.slice(0, limit).map(({ fn, score }) => ({
      functionId: fn.id,
      name: fn.name,
      file: fn.file,
      moduleId: fn.moduleId,
      score,
      purpose: fn.purpose,
    }))
  }

  /**
   * Compute embedding for a function using keyword + structural features
   */
  private computeEmbedding(fn: MikkLockFunction): number[] {
    const vector = new Array(this.DIMENSIONS).fill(0)

    // Feature 1: Function name tokens (first 32 dims)
    const nameTokens = this.tokenize(fn.name)
    for (let i = 0; i < Math.min(nameTokens.length, 32); i++) {
      vector[i] = this.hashToken(nameTokens[i], i)
    }

    // Feature 2: Purpose keywords (next 32 dims)
    if (fn.purpose) {
      const purposeTokens = this.tokenize(fn.purpose)
      for (let i = 0; i < Math.min(purposeTokens.length, 32); i++) {
        vector[32 + i] = this.hashToken(purposeTokens[i], 32 + i)
      }
    }

    // Feature 3: Module context (next 32 dims)
    if (fn.moduleId) {
      const moduleTokens = this.tokenize(fn.moduleId)
      for (let i = 0; i < Math.min(moduleTokens.length, 32); i++) {
        vector[64 + i] = this.hashToken(moduleTokens[i], 64 + i)
      }
    }

    // Feature 4: Structural features (last 32 dims)
    vector[96] = fn.isAsync ? 1 : 0
    vector[97] = fn.isExported ? 1 : 0
    vector[98] = fn.params?.length ?? 0
    vector[99] = (fn.endLine - fn.startLine) / 100 // normalized function size
    vector[100] = fn.calls?.length ?? 0 // number of calls
    vector[101] = fn.calledBy?.length ?? 0 // number of callers

    // Hash additional features
    if (fn.returnType) {
      vector[102] = this.hashToken(fn.returnType, 102) % 1
    }

    // Normalize vector
    return this.normalizeVector(vector)
  }

  /**
   * Compute query embedding
   */
  private computeQueryEmbedding(query: string): number[] {
    const vector = new Array(this.DIMENSIONS).fill(0)
    const tokens = this.tokenize(query)

    // Weight recent tokens more heavily
    for (let i = 0; i < tokens.length; i++) {
      const weight = 1 - (i / tokens.length) * 0.5 // decreasing weight
      const hash = this.hashToken(tokens[i], i % this.DIMENSIONS)
      vector[i % this.DIMENSIONS] += hash * weight
    }

    return this.normalizeVector(vector)
  }

  /**
   * Compute embedding for arbitrary code snippet
   */
  private computeCodeEmbedding(code: string): number[] {
    const vector = new Array(this.DIMENSIONS).fill(0)
    const tokens = this.tokenize(code)

    for (let i = 0; i < Math.min(tokens.length, this.DIMENSIONS); i++) {
      vector[i] = this.hashToken(tokens[i], i)
    }

    return this.normalizeVector(vector)
  }

  /**
   * Tokenize text into words
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .split(/[\s_./\\{}()[]"']+/)
      .filter(Boolean)
      .filter(w => w.length > 1)
  }

  /**
   * Hash token to 0-1 range for embedding
   */
  private hashToken(token: string, seed: number): number {
    let hash = 0
    for (let i = 0; i < token.length; i++) {
      hash = ((hash << 5) - hash + token.charCodeAt(i) + seed) >>> 0
    }
    return (hash % 1000) / 1000
  }

  /**
   * Normalize vector to unit length
   */
  private normalizeVector(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0))
    if (magnitude === 0) return vector
    return vector.map(v => v / magnitude)
  }

  /**
   * Compute cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0
    let normA = 0
    let normB = 0

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB)
    if (denominator === 0) return 0

    return dotProduct / denominator
  }

  /**
   * Get index statistics
   */
  getIndexStats(): { functionCount: number; dimensions: number; indexedAt: number } | null {
    if (!this.index) return null

    return {
      functionCount: this.index.functions.size,
      dimensions: this.index.dimensions,
      indexedAt: this.index.indexedAt,
    }
  }
}

/**
 * Hybrid search combining BM25 and semantic search
 */
export class HybridSearchEngine {
  private lock: MikkLock
  private semanticSearch: SemanticCodeSearch
  private readonly SEMANTIC_WEIGHT = 0.6
  private readonly BM25_WEIGHT = 0.4

  constructor(lock: MikkLock) {
    this.lock = lock
    this.semanticSearch = new SemanticCodeSearch(lock)
  }

  /**
   * Search using both BM25 and semantic search with reranking
   */
  async search(
    query: string,
    options: SemanticSearchOptions & { useHybrid?: boolean } = {}
  ): Promise<SemanticSearchResult[]> {
    const { useHybrid = true, limit = 20, ...filterOptions } = options

    if (!useHybrid) {
      return this.semanticSearch.search(query, { ...filterOptions, limit })
    }

    // Run both searches in parallel
    const [semanticResults, bm25Results] = await Promise.all([
      this.semanticSearch.search(query, { ...filterOptions, limit: limit * 2 }),
      this.bm25Search(query, { ...filterOptions, limit: limit * 2 }),
    ])

    // Combine scores using weighted RRF
    const combinedScores = new Map<string, { fn: MikkLockFunction; score: number }>()

    // Add semantic scores
    for (const result of semanticResults) {
      combinedScores.set(result.functionId, {
        fn: this.lock.functions[result.functionId],
        score: result.score * this.SEMANTIC_WEIGHT,
      })
    }

    // Add BM25 scores
    for (const result of bm25Results) {
      const existing = combinedScores.get(result.functionId)
      const bm25Score = result.score * this.BM25_WEIGHT

      if (existing) {
        existing.score += bm25Score
      } else {
        combinedScores.set(result.functionId, {
          fn: this.lock.functions[result.functionId],
          score: bm25Score,
        })
      }
    }

    // Sort by combined score
    const results = Array.from(combinedScores.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ fn, score }) => ({
        functionId: fn.id,
        name: fn.name,
        file: fn.file,
        moduleId: fn.moduleId,
        score,
        purpose: fn.purpose,
      }))

    return results
  }

  /**
   * Simple BM25 search for hybrid results
   */
  private async bm25Search(
    query: string,
    options: SemanticSearchOptions
  ): Promise<Array<{ functionId: string; score: number }>> {
    const tokens = this.tokenize(query)
    const functions = Object.values(this.lock.functions)

    const scores: Array<{ fn: MikkLockFunction; score: number }> = []

    for (const fn of functions) {
      let score = 0
      const fnText = `${fn.name} ${fn.purpose || ''}`.toLowerCase()

      for (const token of tokens) {
        if (fnText.includes(token)) {
          score += 1
        }
      }

      if (score > 0) {
        scores.push({ fn, score: score / tokens.length })
      }
    }

    scores.sort((a, b) => b.score - a.score)

    return scores.slice(0, options.limit ?? 20).map(({ fn, score }) => ({
      functionId: fn.id,
      score,
    }))
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[\s]+/)
      .filter(Boolean)
  }
}

// ---------------------------------------------------------------------------
// Re-export for compatibility
// ---------------------------------------------------------------------------

// Exported as SemanticCodeSearch above
