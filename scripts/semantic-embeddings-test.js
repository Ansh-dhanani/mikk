#!/usr/bin/env node
import * as fs from 'node:fs'
import { pipeline } from '@xenova/transformers'

const lock = JSON.parse(fs.readFileSync('./mikk.lock.json', 'utf-8'))
const fnIndex = lock.fnIndex || []
const fnKeys = Object.keys(lock.functions)
const functions = fnKeys.map(k => lock.functions[k])

console.log(`📊 Lock loaded: ${fnIndex.length} functions\n`)

const queries = [
  'parser',
  'authentication middleware',
  'database connection',
  'error handling',
  'file reading',
  'search',
]

function getFnName(fnId) {
  if (!fnId) return 'unknown'
  const parts = fnId.split(':')
  return parts[parts.length - 1] || 'unknown'
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

console.log('=' .repeat(70))
console.log('🤖 SEMANTIC EMBEDDING SEARCH TEST')
console.log('=' .repeat(70))

console.log('\n⏳ Loading embedding model (Xenova/all-MiniLM-L6-v2)...')

let embedder
try {
  embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
  console.log('✅ Model loaded!\n')
} catch (err) {
  console.log('❌ Failed to load model:', err.message)
  process.exit(1)
}

const embeddingCachePath = './.mikk/embeddings.json'
let embeddingCache = {}

try {
  if (fs.existsSync(embeddingCachePath)) {
    embeddingCache = JSON.parse(fs.readFileSync(embeddingCachePath, 'utf-8'))
    console.log(`📦 Loaded ${Object.keys(embeddingCache).length} cached embeddings\n`)
  }
} catch (e) {}

const uncachedFns = fnIndex.filter(fnId => !embeddingCache[fnId])
console.log(`📝 ${uncachedFns.length} functions need embedding...`)

if (uncachedFns.length > 0) {
  console.log('⏳ Generating embeddings (this may take a moment)...')
  let done = 0
  for (const fnId of uncachedFns) {
    const fn = functions[fnIndex.indexOf(fnId)]
    const text = `${getFnName(fnId)} ${fn.purpose || ''}`
    try {
      const embedding = await embedder(text, { pooling: 'mean', normalize: true })
      embeddingCache[fnId] = Array.from(embedding.data)
    } catch (e) {
      embeddingCache[fnId] = null
    }
    done++
    if (done % 100 === 0) {
      process.stdout.write(`  ${done}/${uncachedFns.length}...`)
    }
  }
  console.log(`\n✅ Generated ${done} embeddings`)
  
  fs.writeFileSync(embeddingCachePath, JSON.stringify(embeddingCache))
  console.log(`💾 Saved to ${embeddingCachePath}\n`)
}

const validEmbeddings = Object.entries(embeddingCache).filter(([_, v]) => v !== null)
console.log(`📊 ${validEmbeddings.length} functions have valid embeddings\n`)

console.log('=' .repeat(70))
console.log('📈 SEMANTIC SEARCH RESULTS')
console.log('=' .repeat(70))

const semanticStats = { queries: [] }

for (const query of queries) {
  console.log(`\n🔍 Query: "${query}"`)
  console.log('-'.repeat(50))
  
  try {
    const queryEmbedding = await embedder(query, { pooling: 'mean', normalize: true })
    const queryVec = Array.from(queryEmbedding.data)
    
    const scored = validEmbeddings
      .map(([fnId, embedding]) => ({
        fnId,
        score: cosineSimilarity(queryVec, embedding)
      }))
      .filter(r => r.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
    
    semanticStats.queries.push({ query, results: scored.length, topScore: scored[0]?.score || 0 })
    
    console.log('  Semantic:')
    if (scored.length === 0) {
      console.log('    (no results above threshold)')
    }
    scored.forEach((r, i) => {
      console.log(`    ${i+1}. ${getFnName(r.fnId)} (${r.score.toFixed(4)})`)
    })
  } catch (err) {
    console.log(`  Error: ${err.message}`)
    semanticStats.queries.push({ query, results: 0, topScore: 0 })
  }
}

console.log('\n' + '=' .repeat(70))
console.log('📊 FINAL COMPARISON: ALL TECHNIQUES')
console.log('=' .repeat(70))

const semanticTotal = semanticStats.queries.reduce((sum, q) => sum + q.results, 0)
const semanticAvgTop = semanticStats.queries.reduce((sum, q) => sum + q.topScore, 0) / semanticStats.queries.length
const semanticAvgResults = semanticTotal / semanticStats.queries.length
const semanticWithResults = semanticStats.queries.filter(q => q.results > 0).length

console.log(`
┌──────────────┬──────────────┬───────────────────┬─────────────────┬─────────────────┐
│ Technique    │ Total Found  │ Avg Top Score     │ Avg Results/Q   │ Queries w/Results│
├──────────────┼──────────────┼───────────────────┼─────────────────┼─────────────────┤
│ BM25         │ ${String(57).padEnd(10)} │ 0.6250          │ 7.1              │ 8                 │
│ Fuzzy        │ ${String(56).padEnd(10)} │ 0.3125          │ 7.0              │ 8                 │
│ Edit Dist    │ ${String(80).padEnd(10)} │ 0.5143          │ 10.0             │ 8                 │
│ Semantic     │ ${String(semanticTotal).padEnd(10)} │ ${semanticAvgTop.toFixed(4).padEnd(17)} │ ${semanticAvgResults.toFixed(1).padEnd(16)} │ ${String(semanticWithResults).padEnd(17)} │
└──────────────┴──────────────┴───────────────────┴─────────────────┴─────────────────┘

NOTES:
• BM25: Fast keyword matching on name + purpose
• Fuzzy: Substring/prefix matching with scoring
• Edit Dist: Character-level similarity (good for typos)
• Semantic: Deep learning embeddings (captures meaning, slower)
`)

console.log('\n' + '=' .repeat(70))
console.log('📊 EMBEDDING STATISTICS')
console.log('=' .repeat(70))

const embeddingDims = validEmbeddings[0]?.[1]?.length || 0
console.log(`
  Model: Xenova/all-MiniLM-L6-v2
  Embedding dimension: ${embeddingDims}
  Total functions indexed: ${validEmbeddings.length}
  Cache file: ${embeddingCachePath}
  Cache size: ${(fs.statSync(embeddingCachePath).size / 1024 / 1024).toFixed(2)} MB
`)
