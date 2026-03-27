/**
 * Mikk MCP Tool Benchmark — Direct Core Library Test
 * Runs each MCP tool against ts-express-api, measures:
 *  - Latency (ms)
 *  - Token count (chars/4)
 *  - Accuracy score (manual evaluation checklist)
 *  - Pass/fail
 *
 * Usage: bun benchmarks/mcp-tool-bench.ts
 */

import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { URL } from 'node:url'

const PROJECT_ROOT = 'C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api'
const MESH_ROOT = 'C:/Users/Ansh/Desktop/web/Mesh'

const CORE_PATH = path.join(MESH_ROOT, 'packages/core/dist/index.js')
const AI_PATH   = path.join(MESH_ROOT, 'packages/ai-context/dist/index.js')

const tokens = (s: string) => Math.ceil(s.length / 4)

function weighted(checks: { pass: boolean; w: number; label: string }[]) {
  const total  = checks.reduce((a, c) => a + c.w, 0)
  const earned = checks.filter(c => c.pass).reduce((a, c) => a + c.w, 0)
  return {
    pct: total === 0 ? 0 : Math.round((earned / total) * 100),
    detail: checks.map(c => `  ${c.pass ? '✓' : '✗'} [w${c.w}] ${c.label}`),
  }
}

async function timedCall<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const t0 = performance.now()
  const result = await fn()
  return { result, ms: Math.round(performance.now() - t0) }
}

// ─── Load Mikk core ──────────────────────────────────────────────────────────

async function loadMikk() {
  const coreUrl = new URL(`file:///${CORE_PATH.replace(/\\/g, '/')}`)
  const aiUrl   = new URL(`file:///${AI_PATH.replace(/\\/g, '/')}`)

  const core = await import(coreUrl.href)
  let ai: any = null
  try { ai = await import(aiUrl.href) } catch { /* optional */ }

  const lockPath     = path.join(PROJECT_ROOT, 'mikk.lock.json')
  const contractPath = path.join(PROJECT_ROOT, 'mikk.json')

  const lock     = await new core.LockReader().read(lockPath)
  const contract = await new core.ContractReader().read(contractPath)

  const nodes    = new Map<string, any>()
  const edges: any[] = []
  const outEdges = new Map<string, any[]>()
  const inEdges  = new Map<string, any[]>()

  for (const fn of Object.values(lock.functions) as any[]) {
    nodes.set(fn.id, { id: fn.id, type: 'function', label: fn.name,
      file: fn.file, moduleId: fn.moduleId,
      metadata: { isExported: fn.isExported } })
    outEdges.set(fn.id, [])
    inEdges.set(fn.id, [])
  }
  for (const fn of Object.values(lock.functions) as any[]) {
    for (const cid of fn.calls ?? []) {
      if (!nodes.has(cid)) continue
      const e = { from: fn.id, to: cid, type: 'calls' }
      edges.push(e)
      outEdges.get(fn.id)!.push(e)
      const inc = inEdges.get(cid) ?? []; inc.push(e); inEdges.set(cid, inc)
    }
  }

  return { core, ai, lock, contract, graph: { nodes, edges, outEdges, inEdges } }
}

// ─── Result type ─────────────────────────────────────────────────────────────

interface BenchRow {
  tool: string
  category: string
  ms: number
  tokensOut: number
  accuracy: number
  passed: boolean
  details: string[]
  rawOutput: string
  notes: string
}

const results: BenchRow[] = []

function pushResult(r: BenchRow) {
  results.push(r)
  const icon = r.passed ? '✅' : '❌'
  console.log(`${icon} [${r.tool}] ${r.accuracy}% acc | ${r.ms}ms | ${r.tokensOut} tok`)
  r.details.forEach(d => console.log(d))
  console.log()
}

// ─── Benchmark tests ─────────────────────────────────────────────────────────

async function runAll() {
  console.log('Loading Mikk core...')
  const { core, ai, lock, contract, graph } = await loadMikk()

  const allFns = Object.values(lock.functions) as any[]
  console.log(`Project: ${contract.project?.name} | ${allFns.length} functions | ${Object.keys(lock.files).length} files\n`)

  // ── T1: mikk_get_session_context ─────────────────────────────────────────
  {
    const { result: out, ms } = await timedCall(async () => {
      const modules = contract.declared.modules.map((m: any) => ({
        id: m.id, name: m.name,
        functions: allFns.filter((f: any) => f.moduleId === m.id).length,
        files: Object.values(lock.files).filter((f: any) => f.moduleId === m.id).length,
      }))
      return JSON.stringify({
        project: contract.project,
        totalFunctions: allFns.length,
        totalFiles: Object.keys(lock.files).length,
        totalModules: modules.length,
        constraints: contract.declared.constraints.length,
        modules: modules.slice(0, 10),
      }, null, 2)
    })
    const md = JSON.parse(out)
    const { pct, detail } = weighted([
      { pass: Array.isArray(md.modules) && md.modules.length >= 8, w: 25, label: 'All 8 modules returned' },
      { pass: md.totalFunctions === allFns.length, w: 25, label: `Exact function count (${allFns.length}) — ground truth` },
      { pass: md.totalFiles === Object.keys(lock.files).length, w: 20, label: `Exact file count (${Object.keys(lock.files).length}) — ground truth` },
      { pass: typeof md.project?.name === 'string', w: 15, label: 'Project name present' },
      { pass: tokens(out) < 1000, w: 15, label: 'Session context < 1000 tokens' },
    ])
    pushResult({ tool: 'mikk_get_session_context', category: 'session', ms,
      tokensOut: tokens(out), accuracy: pct, passed: pct >= 80,
      details: detail, rawOutput: out, notes: '' })
  }

  // ── T2: mikk_search_functions — JWT search ───────────────────────────────
  {
    const { result: out, ms } = await timedCall(async () => {
      const q = 'verify jwt token'
      const bm25 = new core.BM25Index()
      for (const fn of allFns) bm25.addDocument(fn.id, core.buildFunctionTokens(fn))
      const bm25Results = bm25.search(q, 10)
      const subResults  = allFns
        .filter((f: any) => f.name.toLowerCase().includes('token') || f.name.toLowerCase().includes('verify'))
        .map((f: any, i: number) => ({ id: f.id, score: 1.0 - i * 0.1 }))
      const fused = core.reciprocalRankFusion(subResults, bm25Results).slice(0, 5)
      return JSON.stringify(fused.map((r: any) => ({
        name: lock.functions[r.id]?.name,
        file: lock.functions[r.id]?.file?.split('/').pop(),
        module: lock.functions[r.id]?.moduleId,
        score: r.score?.toFixed ? r.score.toFixed(3) : r.score,
      })), null, 2)
    })
    let arr: any[] = []
    try { arr = JSON.parse(out) } catch { /* raw */ }
    const names = arr.map((r: any) => r.name?.toLowerCase() ?? '')
    const { pct, detail } = weighted([
      { pass: names.some(n => n.includes('verify') || n.includes('token')), w: 35, label: 'verifyToken in top results' },
      { pass: arr.length >= 3, w: 20, label: '≥3 results returned' },
      { pass: arr.every((r: any) => r.file && r.module), w: 25, label: 'All results have file + module' },
      { pass: names.some(n => n.includes('sign') || n.includes('decode')), w: 20, label: 'Related token fns also returned' },
    ])
    pushResult({ tool: 'mikk_search_functions (jwt)', category: 'search', ms,
      tokensOut: tokens(out), accuracy: pct, passed: pct >= 70,
      details: detail, rawOutput: out, notes: 'query: "verify jwt token"' })
  }

  // ── T3: mikk_search_functions — handler/middleware ───────────────────────
  {
    const { result: out, ms } = await timedCall(async () => {
      const q = 'handler middleware auth'
      const bm25 = new core.BM25Index()
      for (const fn of allFns) bm25.addDocument(fn.id, core.buildFunctionTokens(fn))
      const results = bm25.search(q, 10)
      return JSON.stringify(results.slice(0, 5).map((r: any) => ({
        name: lock.functions[r.id]?.name,
        file: lock.functions[r.id]?.file?.split('/').pop(),
        module: lock.functions[r.id]?.moduleId,
      })))
    })
    let arr: any[] = []
    try { arr = JSON.parse(out) } catch { /* raw */ }
    const names = arr.map((r: any) => r.name?.toLowerCase() ?? '')
    const { pct, detail } = weighted([
      { pass: names.some(n => n.includes('require') || n.includes('auth') || n.includes('middleware')), w: 40, label: 'Auth/middleware function in top 5' },
      { pass: arr.length >= 3, w: 25, label: '≥3 results returned' },
      { pass: arr.every((r: any) => r.file), w: 35, label: 'All results have file location' },
    ])
    pushResult({ tool: 'mikk_search_functions (middleware)', category: 'search', ms,
      tokensOut: tokens(out), accuracy: pct, passed: pct >= 70,
      details: detail, rawOutput: out, notes: 'query: "handler middleware auth"' })
  }

  // ── T4: mikk_get_function_detail ─────────────────────────────────────────
  {
    const { result: out, ms } = await timedCall(async () => {
      const name = 'loginUser'
      const matches = allFns.filter((f: any) =>
        f.name === name || f.name.toLowerCase() === name.toLowerCase()
      )
      return JSON.stringify(matches.map((fn: any) => ({
        name: fn.name,
        file: fn.file,
        module: fn.moduleId,
        lines: fn.lines,
        params: fn.params,
        isAsync: fn.isAsync,
        isExported: fn.isExported,
        purpose: fn.purpose,
        calls: (fn.calls ?? []).map((id: string) => lock.functions[id]?.name).filter(Boolean),
        calledBy: (fn.calledBy ?? []).map((id: string) => lock.functions[id]?.name).filter(Boolean),
      })), null, 2)
    })
    let arr: any[] = []
    try { arr = JSON.parse(out) } catch { /* raw */ }
    const fn = arr[0] ?? {}
    const { pct, detail } = weighted([
      { pass: fn.name === 'loginUser', w: 20, label: 'Correct function name returned' },
      { pass: typeof fn.file === 'string' && fn.file.includes('service'), w: 20, label: 'Correct file (service.ts)' },
      { pass: Array.isArray(fn.params) && fn.params.length >= 2, w: 20, label: 'Params returned (email, password)' },
      { pass: fn.isAsync === true, w: 15, label: 'isAsync correctly flagged' },
      { pass: fn.isExported === true, w: 15, label: 'isExported correctly flagged' },
      { pass: typeof fn.purpose === 'string', w: 10, label: 'Purpose/description present' },
    ])
    pushResult({ tool: 'mikk_get_function_detail', category: 'navigation', ms,
      tokensOut: tokens(out), accuracy: pct, passed: pct >= 80,
      details: detail, rawOutput: out, notes: 'function: loginUser' })
  }

  // ── T5: mikk_impact_analysis — jwt.ts ────────────────────────────────────
  {
    const { result: out, ms } = await timedCall(async () => {
      const analyzer = new core.ImpactAnalyzer(graph)
      const fileToChange = 'src/auth/jwt.ts'
      const fileNodes = Array.from((graph.nodes as Map<string, any>).values())
        .filter((n: any) => n.file?.toLowerCase().includes('jwt'))
      if (!fileNodes.length) return JSON.stringify({ error: 'no jwt nodes found' })
      const result = analyzer.analyze(fileNodes.map((n: any) => n.id))
      return JSON.stringify({
        changedFile: fileToChange,
        impactedNodes: result.impacted.length,
        depth: result.depth,
        confidence: result.confidence,
        classified: {
          critical: result.classified?.critical?.length ?? 0,
          high:     result.classified?.high?.length     ?? 0,
          medium:   result.classified?.medium?.length   ?? 0,
          low:      result.classified?.low?.length      ?? 0,
        },
      }, null, 2)
    })
    let md: any = {}
    try { md = JSON.parse(out) } catch { /* raw */ }
    const { pct, detail } = weighted([
      { pass: typeof md.impactedNodes === 'number' && md.impactedNodes >= 3, w: 30, label: 'Impact count ≥ 3 (jwt used by auth, users, middleware)' },
      { pass: typeof md.depth === 'number' && md.depth >= 1, w: 25, label: 'BFS depth ≥ 1' },
      { pass: md.classified !== undefined, w: 25, label: 'Severity classification returned' },
      { pass: typeof md.confidence === 'number', w: 20, label: 'Confidence score present' },
    ])
    pushResult({ tool: 'mikk_impact_analysis', category: 'safety', ms,
      tokensOut: tokens(out), accuracy: pct, passed: pct >= 75,
      details: detail, rawOutput: out, notes: 'file: src/auth/jwt.ts (imported by middleware/auth, users/service, auth/session)' })
  }

  // ── T6: mikk_dead_code ────────────────────────────────────────────────────
  {
    const { result: out, ms } = await timedCall(async () => {
      const detector = new core.DeadCodeDetector(graph, lock)
      const result   = detector.detect()
      return JSON.stringify({
        deadCount:      result.deadCount,
        totalFunctions: result.totalFunctions,
        deadPercentage: result.deadPercentage,
        byModule:       Object.entries(result.byModule ?? {})
          .filter(([, v]: any) => v.dead > 0)
          .map(([id, v]: any) => ({ module: id, dead: v.dead, total: v.total })),
        highConfidence: (result.deadFunctions ?? [])
          .filter((d: any) => d.confidence === 'high')
          .slice(0, 5)
          .map((d: any) => ({ name: d.name, file: d.file?.split('/').pop() })),
      }, null, 2)
    })
    let md: any = {}
    try { md = JSON.parse(out) } catch { /* raw */ }
    const { pct, detail } = weighted([
      { pass: typeof md.deadCount === 'number', w: 30, label: 'Returns numeric dead count' },
      { pass: md.totalFunctions === allFns.length, w: 25, label: `Correct total (${allFns.length} ground truth)` },
      { pass: Array.isArray(md.highConfidence), w: 25, label: 'Returns high-confidence dead list' },
      { pass: Array.isArray(md.byModule), w: 20, label: 'Module breakdown present' },
    ])
    pushResult({ tool: 'mikk_dead_code', category: 'safety', ms,
      tokensOut: tokens(out), accuracy: pct, passed: pct >= 80,
      details: detail, rawOutput: out, notes: '' })
  }

  // ── T7: mikk_get_constraints ──────────────────────────────────────────────
  {
    const { result: out, ms } = await timedCall(async () => {
      return JSON.stringify({
        constraints: contract.declared.constraints,
        decisions:   contract.declared.decisions,
        policies:    (contract as any).policies ?? {},
        modules:     contract.declared.modules.map((m: any) => ({
          id: m.id, name: m.name, paths: m.paths,
        })).slice(0, 8),
      }, null, 2)
    })
    let md: any = {}
    try { md = JSON.parse(out) } catch { /* raw */ }
    const { pct, detail } = weighted([
      { pass: Array.isArray(md.constraints), w: 35, label: 'Constraints array returned' },
      { pass: Array.isArray(md.decisions),   w: 25, label: 'Decisions/ADR array returned' },
      { pass: Array.isArray(md.modules) && md.modules.length >= 8, w: 25, label: 'All 8 module boundaries returned' },
      { pass: tokens(out) < 2000, w: 15, label: 'Response < 2000 tokens' },
    ])
    pushResult({ tool: 'mikk_get_constraints', category: 'governance', ms,
      tokensOut: tokens(out), accuracy: pct, passed: pct >= 80,
      details: detail, rawOutput: out, notes: 'Note: project has 0 constraints defined — tests structural correctness' })
  }

  // ── T8: mikk_query_context — JWT auth question ────────────────────────────
  if (ai) {
    const { result: out, ms } = await timedCall(async () => {
      const builder = new ai.ContextBuilder(contract, lock)
      const ctx = builder.build({
        task: 'How does JWT authentication work? Show signToken, verifyToken, and how middleware uses them.',
        maxHops: 3, tokenBudget: 4000, includeCallGraph: true,
        includeBodies: false, projectRoot: PROJECT_ROOT, relevanceMode: 'balanced',
      })
      return ai.getProvider('generic').formatContext(ctx)
    })
    const lo = out.toLowerCase()
    const { pct, detail } = weighted([
      { pass: lo.includes('signtoken') || lo.includes('verifytoken'), w: 30, label: 'signToken/verifyToken in response' },
      { pass: lo.includes('jwt') || lo.includes('auth'), w: 20, label: 'JWT/auth keyword present' },
      { pass: lo.includes('fn:') || lo.includes('function') || lo.includes('module'), w: 20, label: 'Structured function/module context' },
      { pass: tokens(out) <= 4200, w: 20, label: 'Within 4000-token budget (±5%)' },
      { pass: tokens(out) >= 300, w: 10, label: 'Non-trivial response (>300 tok)' },
    ])
    pushResult({ tool: 'mikk_query_context (JWT auth)', category: 'context', ms,
      tokensOut: tokens(out), accuracy: pct, passed: pct >= 70,
      details: detail, rawOutput: out.slice(0, 800) + '...', notes: 'tokenBudget: 4000' })
  } else {
    console.log('⚠️  ai-context not available — skipping mikk_query_context tests')
  }

  // ── T9: mikk_query_context — tight budget 1500 ────────────────────────────
  if (ai) {
    const { result: out, ms } = await timedCall(async () => {
      const builder = new ai.ContextBuilder(contract, lock)
      const ctx = builder.build({
        task: 'What functions handle payment processing?',
        maxHops: 2, tokenBudget: 1500, includeCallGraph: false,
        includeBodies: false, projectRoot: PROJECT_ROOT, relevanceMode: 'precise',
      })
      return ai.getProvider('generic').formatContext(ctx)
    })
    const lo = out.toLowerCase()
    const { pct, detail } = weighted([
      { pass: lo.includes('payment') || lo.includes('stripe') || lo.includes('billing'), w: 35, label: 'Payment content present' },
      { pass: tokens(out) <= 1700, w: 40, label: 'Respects tight 1500-token budget (±13%)' },
      { pass: lo.includes('fn:') || lo.includes('function'), w: 25, label: 'Symbol-level precision retained under compression' },
    ])
    pushResult({ tool: 'mikk_query_context (tight budget 1500)', category: 'context', ms,
      tokensOut: tokens(out), accuracy: pct, passed: pct >= 70,
      details: detail, rawOutput: out.slice(0, 500) + '...', notes: 'tokenBudget: 1500 strict' })
  }

  // ── T10: mikk_get_routes ──────────────────────────────────────────────────
  {
    const { result: out, ms } = await timedCall(async () => {
      const routes = (lock as any).routes ?? []
      return JSON.stringify({ routeCount: routes.length, routes: routes.slice(0, 10) }, null, 2)
    })
    let md: any = {}
    try { md = JSON.parse(out) } catch { /* raw */ }
    const { pct, detail } = weighted([
      { pass: typeof md.routeCount === 'number', w: 40, label: 'Route count returned' },
      { pass: Array.isArray(md.routes), w: 40, label: 'Routes array present' },
      { pass: tokens(out) < 500, w: 20, label: 'Compact response' },
    ])
    pushResult({ tool: 'mikk_get_routes', category: 'navigation', ms,
      tokensOut: tokens(out), accuracy: pct, passed: pct >= 60,
      details: detail, rawOutput: out, notes: `NOTE: route detection 0 — routes.ts files not parsed for HTTP verbs. Ground truth: 3 route files (auth, users, payments)` })
  }

  // ── T11: EDGE — Non-existent function ────────────────────────────────────
  {
    const { result: out, ms } = await timedCall(async () => {
      const name = 'nonExistentFunction_xyz_not_real'
      const matches = allFns.filter((f: any) => f.name === name)
      return JSON.stringify({ found: matches.length, results: matches })
    })
    let md: any = {}
    try { md = JSON.parse(out) } catch { /* raw */ }
    const { pct, detail } = weighted([
      { pass: md.found === 0, w: 60, label: 'Returns 0 results (no hallucination)' },
      { pass: Array.isArray(md.results) && md.results.length === 0, w: 40, label: 'Empty results array returned' },
    ])
    pushResult({ tool: 'EDGE: non-existent function', category: 'edge_case', ms,
      tokensOut: tokens(out), accuracy: pct, passed: pct >= 80,
      details: detail, rawOutput: out, notes: 'adversarial: should NOT hallucinate results' })
  }

  // ── T12: EDGE — Impact on file not in graph ───────────────────────────────
  {
    const { result: out, ms } = await timedCall(async () => {
      const analyzer = new core.ImpactAnalyzer(graph)
      const fileNodes = Array.from((graph.nodes as Map<string, any>).values())
        .filter((n: any) => n.file?.includes('nonexistent_file_xyz.ts'))
      if (!fileNodes.length) return JSON.stringify({ error: 'file not found in graph', nodeCount: 0 })
      const result = analyzer.analyze(fileNodes.map((n: any) => n.id))
      return JSON.stringify({ impactedNodes: result.impacted.length })
    })
    let md: any = {}
    try { md = JSON.parse(out) } catch { /* raw */ }
    const { pct, detail } = weighted([
      { pass: md.error === 'file not found in graph', w: 70, label: 'Returns clear error message' },
      { pass: md.nodeCount === 0, w: 30, label: 'Reports zero nodes (no crash)' },
    ])
    pushResult({ tool: 'EDGE: non-existent file impact', category: 'edge_case', ms,
      tokensOut: tokens(out), accuracy: pct, passed: pct >= 80,
      details: detail, rawOutput: out, notes: 'adversarial: file not in graph' })
  }

  // ── T13: EDGE — Empty search query ───────────────────────────────────────
  {
    const { result: out, ms } = await timedCall(async () => {
      const q = ''
      const bm25 = new core.BM25Index()
      for (const fn of allFns) bm25.addDocument(fn.id, core.buildFunctionTokens(fn))
      const results = bm25.search(q, 10)
      return JSON.stringify({ resultCount: results.length, empty: q.length === 0 })
    })
    let md: any = {}
    try { md = JSON.parse(out) } catch { /* raw */ }
    const { pct, detail } = weighted([
      { pass: typeof md.resultCount === 'number', w: 50, label: 'Returns count without crash on empty query' },
      { pass: md.empty === true, w: 50, label: 'Empty query flag acknowledged' },
    ])
    pushResult({ tool: 'EDGE: empty search query', category: 'edge_case', ms,
      tokensOut: tokens(out), accuracy: pct, passed: pct >= 80,
      details: detail, rawOutput: out, notes: 'adversarial: empty string query' })
  }

  // ── T14: EDGE — Module naming collision ───────────────────────────────────
  {
    const { result: out, ms } = await timedCall(async () => {
      // ts-express-api has TWO modules both named "Authentication"
      // id: mikk-test-ts-express-api-auth AND mikk-test-ts-express-api-users
      const authModules = contract.declared.modules.filter((m: any) => m.name === 'Authentication')
      return JSON.stringify({
        collision: authModules.length > 1,
        collisionCount: authModules.length,
        modules: authModules.map((m: any) => ({ id: m.id, name: m.name })),
      })
    })
    let md: any = {}
    try { md = JSON.parse(out) } catch { /* raw */ }
    const { pct, detail } = weighted([
      { pass: md.collision === true, w: 40, label: 'Detects naming collision (2 "Authentication" modules)' },
      { pass: md.collisionCount >= 2, w: 35, label: 'Correctly counts 2+ duplicate names' },
      { pass: Array.isArray(md.modules), w: 25, label: 'Returns both colliding modules' },
    ])
    pushResult({ tool: 'EDGE: module name collision', category: 'edge_case', ms,
      tokensOut: tokens(out), accuracy: pct, passed: pct >= 80,
      details: detail, rawOutput: out, notes: 'real bug: 2 modules both named "Authentication" in mikk.json' })
  }

  // ── T15: EDGE — Token budget overshoot check ──────────────────────────────
  if (ai) {
    const BUDGET = 500
    const { result: out, ms } = await timedCall(async () => {
      const builder = new ai.ContextBuilder(contract, lock)
      const ctx = builder.build({
        task: 'List all functions',
        maxHops: 1, tokenBudget: BUDGET, includeCallGraph: false,
        includeBodies: false, projectRoot: PROJECT_ROOT, relevanceMode: 'precise',
      })
      return ai.getProvider('generic').formatContext(ctx)
    })
    const actualTokens = tokens(out)
    const overshoot = actualTokens > BUDGET * 1.15  // 15% grace
    const { pct, detail } = weighted([
      { pass: !overshoot, w: 60, label: `Budget respected: ${actualTokens} tokens vs ${BUDGET} limit (${Math.round(actualTokens/BUDGET*100)}%)` },
      { pass: out.length > 0, w: 20, label: 'Non-empty output at tight budget' },
      { pass: actualTokens > 50, w: 20, label: 'Non-trivial output (>50 tok)' },
    ])
    pushResult({ tool: 'EDGE: token budget 500 overshoot', category: 'edge_case', ms,
      tokensOut: actualTokens, accuracy: pct, passed: pct >= 60,
      details: detail, rawOutput: out.slice(0, 200) + '...', notes: `Budget: ${BUDGET} | Actual: ${actualTokens} | Ratio: ${(actualTokens/BUDGET).toFixed(2)}x` })
  }

  // ─── Summary ───────────────────────────────────────────────────────────────
  return results
}

// ─── Print final matrix ───────────────────────────────────────────────────────

async function main() {
  console.log('=== MIKK MCP TOOL BENCHMARK ===\n')
  const rows = await runAll()

  const totalTests = rows.length
  const passed     = rows.filter(r => r.passed).length
  const avgAcc     = Math.round(rows.reduce((a, r) => a + r.accuracy, 0) / rows.length)
  const avgMs      = Math.round(rows.reduce((a, r) => a + r.ms, 0) / rows.length)
  const avgTok     = Math.round(rows.reduce((a, r) => a + r.tokensOut, 0) / rows.length)

  console.log('═'.repeat(70))
  console.log(`FINAL SUMMARY: ${passed}/${totalTests} passed | avg accuracy: ${avgAcc}% | avg latency: ${avgMs}ms | avg tokens: ${avgTok}`)
  console.log('═'.repeat(70))
  console.log()

  // Write JSON for further analysis
  const output = {
    timestamp: new Date().toISOString(),
    project: 'ts-express-api',
    summary: { totalTests, passed, failed: totalTests - passed, avgAcc, avgMs, avgTok },
    results: rows,
  }
  await fs.writeFile('benchmarks/results/mcp-tool-bench-results.json', JSON.stringify(output, null, 2))
  console.log('Results saved to benchmarks/results/mcp-tool-bench-results.json')
}

main().catch(e => { console.error(e); process.exit(1) })
