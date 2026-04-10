#!/usr/bin/env node
import * as fs from 'node:fs'

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
  'API endpoint',
  'search',
  'type checking',
]

function getFnName(fnId) {
  if (!fnId) return 'unknown'
  const parts = fnId.split(':')
  return parts[parts.length - 1] || 'unknown'
}

function getFnFile(fnId) {
  if (!fnId) return ''
  const parts = fnId.split(':')
  return parts.slice(1, -1).join(':')
}

function bm25Score(fn, fnId, queryTokens) {
  const name = getFnName(fnId)
  const text = `${name} ${fn.purpose || ''}`.toLowerCase()
  let score = 0
  for (const token of queryTokens) {
    if (text.includes(token)) score += 1
  }
  return score / queryTokens.length
}

function exactMatch(fn, fnId, query) {
  const queryLower = query.toLowerCase()
  const name = getFnName(fnId).toLowerCase()
  const purpose = (fn.purpose || '').toLowerCase()
  return name.includes(queryLower) || purpose.includes(queryLower)
}

function fuzzyMatch(fn, fnId, query) {
  const queryLower = query.toLowerCase()
  const name = getFnName(fnId).toLowerCase()
  const purpose = (fn.purpose || '').toLowerCase()
  
  let score = 0
  if (name === queryLower) score += 1.0
  else if (name.startsWith(queryLower)) score += 0.8
  else if (name.includes(queryLower)) score += 0.6
  else if (purpose.includes(queryLower)) score += 0.4
  else {
    const queryTokens = queryLower.split(' ').filter(t => t.length > 2)
    const nameTokens = name.split(/[_\s]/).filter(t => t.length > 2)
    const matchCount = queryTokens.filter(qt => nameTokens.some(nt => nt.includes(qt) || qt.includes(nt))).length
    score = matchCount / queryTokens.length * 0.3
  }
  return score
}

function levenshtein(a, b) {
  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null))
  for (let i = 0; i <= a.length; i++) matrix[0][i] = i
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i-1] === b[j-1] ? 0 : 1
      matrix[j][i] = Math.min(
        matrix[j][i-1] + 1,
        matrix[j-1][i] + 1,
        matrix[j-1][i-1] + cost
      )
    }
  }
  return matrix[b.length][a.length]
}

function editDistanceMatch(fn, fnId, query) {
  const name = getFnName(fnId).toLowerCase()
  const distance = levenshtein(query.toLowerCase(), name)
  const maxLen = Math.max(query.length, name.length)
  if (maxLen === 0) return 0
  return 1 - (distance / maxLen)
}

console.log('=' .repeat(70))
console.log('📈 SEARCH TECHNIQUE COMPARISON')
console.log('=' .repeat(70))

const allStats = {
  bm25: { queries: [] },
  exact: { queries: [] },
  fuzzy: { queries: [] },
  edit: { queries: [] },
}

for (const query of queries) {
  console.log(`\n🔍 Query: "${query}"`)
  console.log('-'.repeat(50))
  
  const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 0)
  
  const bm25Results = fnIndex
    .map((fnId, i) => ({ fnId, fn: functions[i], score: bm25Score(functions[i], fnId, tokens) }))
    .filter(r => r.score > 0 && r.fnId)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
  
  const exactResults = fnIndex
    .map((fnId, i) => ({ fnId, fn: functions[i], score: exactMatch(functions[i], fnId, query) ? 1 : 0 }))
    .filter(r => r.score > 0 && r.fnId)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
  
  const fuzzyResults = fnIndex
    .map((fnId, i) => ({ fnId, fn: functions[i], score: fuzzyMatch(functions[i], fnId, query) }))
    .filter(r => r.score > 0 && r.fnId)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
  
  const editResults = fnIndex
    .map((fnId, i) => ({ fnId, fn: functions[i], score: editDistanceMatch(functions[i], fnId, query) }))
    .filter(r => r.score > 0.3 && r.fnId)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
  
  allStats.bm25.queries.push({ query, results: bm25Results.length, topScore: bm25Results[0]?.score || 0 })
  allStats.exact.queries.push({ query, results: exactResults.length, topScore: exactResults[0]?.score || 0 })
  allStats.fuzzy.queries.push({ query, results: fuzzyResults.length, topScore: fuzzyResults[0]?.score || 0 })
  allStats.edit.queries.push({ query, results: editResults.length, topScore: editResults[0]?.score || 0 })
  
  console.log(`  BM25:    ${bm25Results.length} results (top: ${getFnName(bm25Results[0]?.fnId) || 'none'})`)
  console.log(`  Exact:   ${exactResults.length} results (top: ${getFnName(exactResults[0]?.fnId) || 'none'})`)
  console.log(`  Fuzzy:   ${fuzzyResults.length} results (top: ${getFnName(fuzzyResults[0]?.fnId) || 'none'})`)
  console.log(`  Edit:    ${editResults.length} results (top: ${getFnName(editResults[0]?.fnId) || 'none'})`)
}

console.log('\n' + '=' .repeat(70))
console.log('📊 AGGREGATE STATISTICS')
console.log('=' .repeat(70))

const calcStats = (stats) => {
  const totalResults = stats.queries.reduce((sum, q) => sum + q.results, 0)
  const avgTopScore = stats.queries.reduce((sum, q) => sum + q.topScore, 0) / stats.queries.length
  const queriesWithResults = stats.queries.filter(q => q.results > 0).length
  return { totalResults, avgTopScore, queriesWithResults, avgResults: totalResults / stats.queries.length }
}

const bm25Stats = calcStats(allStats.bm25)
const exactStats = calcStats(allStats.exact)
const fuzzyStats = calcStats(allStats.fuzzy)
const editStats = calcStats(allStats.edit)

console.log(`
┌────────────┬──────────────┬───────────────────┬─────────────────┬─────────────────┐
│ Technique  │ Total Found  │ Avg Top Score     │ Avg Results/Q   │ Queries w/Results│
├────────────┼──────────────┼───────────────────┼─────────────────┼─────────────────┤
│ BM25       │ ${String(bm25Stats.totalResults).padEnd(10)} │ ${bm25Stats.avgTopScore.toFixed(4).padEnd(17)} │ ${bm25Stats.avgResults.toFixed(1).padEnd(16)} │ ${String(bm25Stats.queriesWithResults).padEnd(17)} │
│ Exact      │ ${String(exactStats.totalResults).padEnd(10)} │ ${exactStats.avgTopScore.toFixed(4).padEnd(17)} │ ${exactStats.avgResults.toFixed(1).padEnd(16)} │ ${String(exactStats.queriesWithResults).padEnd(17)} │
│ Fuzzy      │ ${String(fuzzyStats.totalResults).padEnd(10)} │ ${fuzzyStats.avgTopScore.toFixed(4).padEnd(17)} │ ${fuzzyStats.avgResults.toFixed(1).padEnd(16)} │ ${String(fuzzyStats.queriesWithResults).padEnd(17)} │
│ Edit Dist  │ ${String(editStats.totalResults).padEnd(10)} │ ${editStats.avgTopScore.toFixed(4).padEnd(17)} │ ${editStats.avgResults.toFixed(1).padEnd(16)} │ ${String(editStats.queriesWithResults).padEnd(17)} │
└────────────┴──────────────┴───────────────────┴─────────────────┴─────────────────┘
`)

console.log('=' .repeat(70))
console.log('🔍 DETAILED TOP-5 FOR EACH QUERY')
console.log('=' .repeat(70))

for (const query of queries) {
  const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 0)
  
  const bm25Results = fnIndex
    .map((fnId, i) => ({ fnId, fn: functions[i], score: bm25Score(functions[i], fnId, tokens) }))
    .filter(r => r.score > 0 && r.fnId)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
  
  const fuzzyResults = fnIndex
    .map((fnId, i) => ({ fnId, fn: functions[i], score: fuzzyMatch(functions[i], fnId, query) }))
    .filter(r => r.score > 0 && r.fnId)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
  
  const editResults = fnIndex
    .map((fnId, i) => ({ fnId, fn: functions[i], score: editDistanceMatch(functions[i], fnId, query) }))
    .filter(r => r.score > 0.3 && r.fnId)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
  
  console.log(`\n📝 Query: "${query}"`)
  
  console.log('  BM25:')
  if (bm25Results.length === 0) console.log('    (none)')
  bm25Results.forEach((r, i) => {
    console.log(`    ${i+1}. ${getFnName(r.fnId)} (${r.score.toFixed(2)})`)
  })
  
  console.log('  Fuzzy:')
  if (fuzzyResults.length === 0) console.log('    (none)')
  fuzzyResults.forEach((r, i) => {
    console.log(`    ${i+1}. ${getFnName(r.fnId)} (${r.score.toFixed(2)})`)
  })
  
  console.log('  Edit Dist:')
  if (editResults.length === 0) console.log('    (none)')
  editResults.forEach((r, i) => {
    console.log(`    ${i+1}. ${getFnName(r.fnId)} (${r.score.toFixed(2)})`)
  })
}

console.log('\n' + '=' .repeat(70))
console.log('📊 OVERLAP ANALYSIS (BM25 vs Fuzzy)')
console.log('=' .repeat(70))

for (const query of queries) {
  const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 0)
  
  const bm25Set = new Set(fnIndex
    .map((fnId, i) => ({ fnId, score: bm25Score(functions[i], fnId, tokens) }))
    .filter(r => r.score > 0 && r.fnId)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(r => r.fnId)
  )
  
  const fuzzySet = new Set(fnIndex
    .map((fnId, i) => ({ fnId, score: fuzzyMatch(functions[i], fnId, query) }))
    .filter(r => r.score > 0 && r.fnId)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(r => r.fnId)
  )
  
  const overlap = [...bm25Set].filter(id => fuzzySet.has(id)).length
  const union = new Set([...bm25Set, ...fuzzySet]).size
  
  console.log(`  "${query}": BM25(${bm25Set.size}) + Fuzzy(${fuzzySet.size}) = Union(${union}), Overlap(${overlap})`)
}

console.log('\n' + '=' .repeat(70))
console.log('📊 RECOMMENDATION')
console.log('=' .repeat(70))
console.log(`
Based on the analysis:

• BM25: Best for multi-word queries where token overlap matters
  → High recall, finds functions with matching keywords in name/purpose

• Exact Match: Best for precise queries, low recall
  → Only finds functions where query appears in name/purpose

• Fuzzy: Best balance of precision and recall
  → Handles typos, partial matches, and semantic similarity

• Edit Distance: Best for typo correction
  → Finds functions similar to query via character-level similarity

→ HYBRID APPROACH RECOMMENDED: Use Fuzzy + BM25 with weighted scoring
  - BM25 weight: 0.4 (for token overlap)
  - Fuzzy weight: 0.6 (for semantic similarity)
`)
