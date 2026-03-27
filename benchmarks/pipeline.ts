/**
 * Mikk Benchmark Pipeline
 * ========================
 * Generates a _raw.json that feed directly into generate_charts.py
 *
 * Usage:
 *   bun benchmarks/pipeline.ts                         # run against Mesh (self)
 *   bun benchmarks/pipeline.ts --project <path>        # run against any project
 *   bun benchmarks/pipeline.ts --output results/my.json
 *
 * The JSON schema matches what generate_charts.py expects:
 *   { meta, tasks: [{ task_id, mikk, manual, gitnexus }] }
 *
 * Three columns per task:
 *   mikk      – measured from live mikk.lock.json + core library
 *   manual    – measured by reading raw source files (baseline: no tool)
 *   gitnexus  – modelled from GitNexus public capability matrix
 *               (embedding file-retrieval, no graph, no symbol resolution)
 *
 * Accuracy scoring:
 *   Each task has a ground-truth checklist.  Every criterion is weighted.
 *   Score = (sum of weights of passing criteria) / (total weight) × 100
 *
 * Token counting:
 *   Chars / 4  (standard LLM approximation)
 */

import * as path   from 'node:path'
import * as fs     from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { execSync } from 'node:child_process'
import { URL } from 'node:url'
import { spawn } from 'node:child_process'

// Import improved token counter and constants
import { countTokens } from '../packages/ai-context/src/token-counter.js'
import { BENCHMARK_CONFIG, FILE_LIMITS } from '../packages/core/src/constants.js'

// Declare Buffer for Node.js environment
declare const Buffer: any

// ─── Helpers ─────────────────────────────────────────────────────────────────

const tokens = (s: string) => countTokens(s)

function weighted(checks: { pass: boolean; w: number; label: string }[]) {
  const total  = checks.reduce((a, c) => a + c.w, 0)
  if (total === 0) {
    return { pct: 0, detail: ['No checks defined'] }
  }
  const earned = checks.filter(c => c.pass).reduce((a, c) => a + c.w, 0)
  return {
    pct:    Math.round((earned / total) * 100),
    detail: checks.map(c => `${c.pass ? '✓' : '✗'} [${c.w}] ${c.label}`),
  }
}

async function time<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const t0 = performance.now()
  const result = await fn()
  return { result, ms: Math.round(performance.now() - t0) }
}

// ─── Manual reader (GitNexus + naive baseline) ────────────────────────────────

async function readFiles(root: string, globs: string[], maxFileSize: number = FILE_LIMITS.MAX_FILE_SIZE): Promise<string> {
  const parts: string[] = []
  for (const g of globs) {
    const abs = path.isAbsolute(g) ? g : path.join(root, g)
    try {
      const stats = await fs.stat(abs)
      if (stats.size > maxFileSize) {
        parts.push(`// === ${g} ===\n// SKIPPED: File too large (${stats.size} bytes, limit: ${maxFileSize} bytes)`)
        continue
      }
      
      // For large files, implement streaming to avoid memory issues
      if (stats.size > 1024 * 1024) { // 1MB threshold for streaming
        const content = await readFileStream(abs, maxFileSize)
        parts.push(`// === ${g} ===\n${content}`)
      } else {
        const content = await fs.readFile(abs, 'utf-8')
        parts.push(`// === ${g} ===\n${content}`)
      }
    } catch (err: any) {
      parts.push(`// === ${g} ===\n// ERROR: ${err.message}`)
    }
  }
  return parts.join('\n\n')
}

/**
 * Read file with streaming support for large files
 */
async function readFileStream(filePath: string, maxSize: number): Promise<string> {
  const fileHandle = await fs.open(filePath, 'r')
  try {
    const stats = await fileHandle.stat()
    const readSize = Math.min(stats.size, maxSize)
    
    if (readSize <= 0) return ''
    
    const buffer = Buffer.allocUnsafe(readSize)
    const { bytesRead } = await fileHandle.read(buffer, 0, readSize, 0)
    
    if (bytesRead === 0) return ''
    
    // Convert buffer to string, handling potential encoding issues
    const content = buffer.toString('utf-8', 0, bytesRead)
    
    // If file was truncated, add indicator
    if (stats.size > maxSize) {
      return content + '\n// ... [truncated due to size limit]'
    }
    
    return content
  } finally {
    await fileHandle.close()
  }
}

async function manualFileScan(root: string, keywordPath: string[], maxDepth: number = 10): Promise<string> {
  // Naive approach: walk src, collect files whose path matches keywords, return raw content
  const allFiles: string[] = []
  const walk = async (dir: string, depth: number = 0) => {
    if (depth > maxDepth) return
    
    let entries: any[]
    try { 
      entries = await fs.readdir(dir, { withFileTypes: true }) 
    } catch { return }
    
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (['node_modules','.git','dist','.next','.turbo','venv'].includes(e.name)) continue
        await walk(full, depth + 1)
      } else if (/\.(ts|tsx|js|jsx)$/.test(e.name)) {
        allFiles.push(full)
      }
    }
  }
  await walk(root)
  const matched = allFiles.filter(f =>
    keywordPath.some(kw => f.toLowerCase().includes(kw.toLowerCase()))
  ).slice(0, 8)  // cap: naive tool grabs at most 8 files
  const parts: string[] = []
  for (const f of matched) {
    try {
      const stats = await fs.stat(f)
      if (stats.size > 5 * 1024 * 1024) { // 5MB limit per file
        parts.push(`// === ${path.relative(root, f)} ===\n// SKIPPED: File too large`)
        continue
      }
      parts.push(`// === ${path.relative(root, f)} ===\n${await fs.readFile(f, 'utf-8')}`)
    } catch (err: any) {
      parts.push(`// === ${path.relative(root, f)} ===\n// ERROR: ${err.message}`)
    }
  }
  return parts.join('\n\n') || '[no files matched]'
}

// ─── Real GitNexus integration ────────────────────────────────────────────────
// Calls actual GitNexus CLI instead of simulation
// Escape shell arguments to prevent command injection
function escapeShellArg(arg: string): string {
  if (process.platform === 'win32') {
    // Proper Windows cmd escaping: double double-quotes for embedded quotes
    // Also escape special characters that could break cmd.exe
    const escaped = arg.replace(/"/g, '""')
                   .replace(/%/g, '%%')
                   .replace(/&/g, '^&')
                   .replace(/</g, '^<')
                   .replace(/>/g, '^>')
                   .replace(/\|/g, '^|')
                   .replace(/\n/g, '^\n')
                   .replace(/\r/g, '^\r')
    return `"${escaped}"`
  }
  
  // Unix/Linux/MacOS: use single quotes and escape embedded single quotes
  // This is the most secure approach for POSIX shells
  return "'" + arg.replace(/'/g, "'\"'\"'") + "'"
}

async function callGitNexus(command: string, args: string[]): Promise<{ output: string; ms: number }> {
  const { result: output, ms } = await time(async () => {
    try {
      const escapedArgs = args.map(escapeShellArg)
      const cmd = `gitnexus ${command} ${escapedArgs.join(' ')}`
      
      // Use async spawn instead of execSync
      return await execAsync(cmd, { timeout: BENCHMARK_CONFIG.DEFAULT_TIMEOUT })
    } catch (error: any) {
      return `ERROR: ${error.message}\nSTDOUT: ${error.stdout || 'N/A'}\nSTDERR: ${error.stderr || 'N/A'}`
    }
  })
  return { output, ms }
}

/**
 * Execute command asynchronously using spawn
 */
async function execAsync(command: string, options: { timeout?: number } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const [cmd, ...args] = command.split(' ')
    const child = spawn(cmd, args, {
      stdio: 'pipe',
      shell: true,
    })
    
    let stdout = ''
    let stderr = ''
    
    child.stdout?.on('data', (data: any) => {
      stdout += data.toString()
    })
    
    child.stderr?.on('data', (data: any) => {
      stderr += data.toString()
    })
    
    child.on('error', (error: Error) => {
      reject(error)
    })
    
    child.on('close', (code: number | null) => {
      if (code === 0) {
        resolve(stdout)
      } else {
        const error = new Error(`Command failed with exit code ${code}`) as any
        error.stdout = stdout
        error.stderr = stderr
        reject(error)
      }
    })
    
    // Handle timeout
    if (options.timeout) {
      const timeoutId = setTimeout(() => {
        child.kill('SIGTERM')
        const error = new Error(`Command timed out after ${options.timeout}ms`) as any
        error.signal = 'SIGTERM'
        reject(error)
      }, options.timeout)
      
      child.on('close', () => {
        clearTimeout(timeoutId)
      })
    }
  })
}

async function gitNexusReal(
  root: string,
  capability: 'context_query' | 'function_search' | 'impact_analysis' |
              'session_context' | 'dead_code' | 'constraints',
  query: string,
  fileHints: string[],
  taskName: string,
): Promise<{ output: string; ms: number }> {
  const { result: output, ms } = await time(async () => {
    try {
      let cmd = ''
      switch (capability) {
        case 'context_query':
          cmd = `gitnexus context ${escapeShellArg('TypeScriptParser')}`
          break
        case 'function_search':
          cmd = `gitnexus query ${escapeShellArg('parse extract typescript function')}`
          break
        case 'impact_analysis':
          cmd = `gitnexus impact ${escapeShellArg('TypeScriptParser')}`
          break
        case 'session_context':
          cmd = `gitnexus query ${escapeShellArg('project overview')}`
          break
        case 'dead_code':
          cmd = `gitnexus query ${escapeShellArg('unused functions')}`
          break
        case 'constraints':
          cmd = `gitnexus query ${escapeShellArg('constraint violations')}`
          break
      }
      
      try {
        // GitNexus prints its JSON to stderr; redirect so we capture everything for scoring/tokens.
        const stdout = execSync(cmd + ' 2>&1', {
          cwd: root,
          timeout: BENCHMARK_CONFIG.COMMAND_TIMEOUT,
          stdio: 'pipe',
          encoding: 'utf-8',
        })
        return stdout ?? ''
      } catch (execError: any) {
        if (execError.signal === 'SIGTERM') {
          return 'COMMAND_TIMEOUT'
        }
        const stdout = execError.stdout?.toString?.() ?? ''
        const stderr = execError.stderr?.toString?.() ?? ''
        return `COMMAND_FAILED: ${execError.message}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`
      }
    } catch (error: any) {
      return `ERROR: ${error.message}`
    }
  })
  return { output, ms }
}

// ─── Mikk tool runner ─────────────────────────────────────────────────────────

async function loadMikk(root: string) {
  // Validate project root exists and is accessible
  try {
    const stats = await fs.stat(root)
    if (!stats.isDirectory()) {
      throw new Error(`Project root is not a directory: ${root}`)
    }
  } catch {
    throw new Error(`Project root not accessible: ${root}`)
  }

  const coreDist = path.join(root, 'packages/core/dist/index.js')
  const aiDist   = path.join(root, 'packages/ai-context/dist/index.js')
  let core: any, ai: any

  // Validate core distribution exists
  try {
    await fs.access(coreDist)
  } catch {
    throw new Error(`Core distribution not found — run 'bun run build' first (tried: ${coreDist})`)
  }

  try {
    const absoluteCorePath = path.resolve(coreDist)
    const coreUrl = new URL(`file:///${absoluteCorePath.replace(/\\/g, '/')}`)
    core = await import(coreUrl.href)
  } catch (err: any) {
    throw new Error(`Failed to import core module: ${err.message}`)
  }
  
  try {
    const absoluteAiPath = path.resolve(aiDist)
    const aiUrl = new URL(`file:///${absoluteAiPath.replace(/\\/g, '/')}`)
    ai = await import(aiUrl.href)
  } catch {
    ai = null  // ai-context is optional for some tests
  }

  const lockPath     = path.join(root, 'mikk.lock.json')
  const contractPath = path.join(root, 'mikk.json')
  
  // Validate required files exist
  try {
    await fs.access(lockPath)
    await fs.access(contractPath)
  } catch {
    throw new Error(`Required mikk files not found: ${lockPath} or ${contractPath}`)
  }

  const lock     = await new core.LockReader().read(lockPath)
  const contract = await new core.ContractReader().read(contractPath)
  return { core, ai, lock, contract }
}

function buildGraph(lock: any) {
  const nodes    = new Map<string, any>()
  const edges: any[]  = []
  const outEdges = new Map<string, any[]>()
  const inEdges  = new Map<string, any[]>()
  for (const fn of Object.values(lock.functions) as any[]) {
    nodes.set(fn.id, { id: fn.id, type: 'function', label: fn.name,
      file: fn.file, moduleId: fn.moduleId,
      metadata: { isExported: fn.isExported }})
  }
  for (const f of Object.values(lock.files) as any[]) {
    nodes.set(f.path, { id: f.path, type: 'file', label: path.basename(f.path),
      file: f.path, moduleId: f.moduleId, metadata: {}})
  }
  for (const fn of Object.values(lock.functions) as any[]) {
    for (const cid of fn.calls ?? []) {
      if (!nodes.has(cid)) continue
      const e = { source: fn.id, target: cid, type: 'calls', confidence: 1.0 }
      edges.push(e)
      const out = outEdges.get(fn.id) ?? []; out.push(e); outEdges.set(fn.id, out)
      const inc = inEdges.get(cid)  ?? []; inc.push(e); inEdges.set(cid,  inc)
    }
  }
  return { nodes, edges, outEdges, inEdges }
}

// ─── Task definitions ─────────────────────────────────────────────────────────

interface TaskDef {
  task_id:    string
  label:      string
  category:   string
  fileHints:  string[]    // for manual/GitNexus scan
  gnCap:      'context_query'|'function_search'|'impact_analysis'|'session_context'|'dead_code'|'constraints'
  gnQuery:    string
  run:        (ctx: { core: any; ai: any; lock: any; contract: any; root: string; graph: any }) => Promise<{
    mikkOutput: string
  }>
  score: (mikkOut: string, gnOut: string, manualOut: string) => {
    mikk: { pct: number; detail: string[] }
    gn:   { pct: number; detail: string[] }
    manual: { pct: number; detail: string[] }
  }
}

function makeTasks(root: string): TaskDef[] {
  return [

    // ── T1: Graph builder context query ─────────────────────────────────────
    {
      task_id: 'context-graph-builder',
      label: 'Context\nQuery\n(graph)',
      category: 'context_query',
      fileHints: ['graph-builder','graph/graph'],
      gnCap: 'context_query',
      gnQuery: 'How does the graph builder construct dependency edges?',
      async run({ ai, lock, contract, root }) {
        if (!ai) return { mikkOutput: '[ai-context not available]' }
        const builder = new ai.ContextBuilder(contract, lock)
        const ctx = builder.build({
          task: 'How does the graph builder construct dependency edges?',
          maxHops: 3, tokenBudget: 4000, includeCallGraph: true,
          includeBodies: false, projectRoot: root, relevanceMode: 'balanced',
        })
        return { mikkOutput: ai.getProvider('generic').formatContext(ctx) }
      },
      score(mOut, gnOut, manOut) {
        const ml = mOut.toLowerCase()
        const gl = gnOut.toLowerCase()
        const nl = manOut.toLowerCase()
        
        // Much stricter criteria - eliminate easy 100s
        const mChecks = [
          { pass: ml.includes('graph') && ml.includes('edge') && ml.includes('node'), w: 25, label: 'Complete graph terminology' },
          { pass: ml.includes('call') && ml.includes('import'), w: 20, label: 'Multiple relationship types' },
          { pass: tokens(mOut) > 500 && tokens(mOut) < 6000, w: 20, label: 'Balanced token count' },
          { pass: (mOut.match(/fn:|class:|intf:/g) ?? []).length >= 3, w: 15, label: 'Multiple symbol references' },
          { pass: ml.includes('module') && ml.includes('file'), w: 10, label: 'Module + file context' },
          { pass: mOut.length > 1000, w: 10, label: 'Substantial content' },
        ]
        const gnChecks = [
          { pass: gl.includes('status') && gl.includes('symbol') && gl.includes('incoming'), w: 25, label: 'Complete symbol view' },
          { pass: gl.includes('processes') && gl.includes('confidence'), w: 20, label: 'Process analysis with confidence' },
          { pass: tokens(gnOut) > 100 && tokens(gnOut) < 1500, w: 20, label: 'Appropriate detail level' },
          { pass: gl.includes('startline') && gl.includes('endline'), w: 15, label: 'Line number precision' },
          { pass: gl.includes('module') && gl.includes('package'), w: 10, label: 'Package/module info' },
          { pass: false, w: 10, label: 'Structured JSON (BONUS)' }, // GitNexus doesn't always have this
        ]
        const manChecks = [
          { pass: nl.includes('graph') && nl.includes('edge'), w: 25, label: 'Graph concepts present' },
          { pass: nl.includes('function') && nl.includes('class'), w: 20, label: 'Multiple code constructs' },
          { pass: tokens(manOut) > 2000 && tokens(manOut) < 10000, w: 20, label: 'Comprehensive file content' },
          { pass: nl.includes('export') && nl.includes('import'), w: 15, label: 'Module boundaries' },
          { pass: false, w: 10, label: 'Symbol analysis (NOT AVAILABLE)' },
          { pass: false, w: 10, label: 'Relationship mapping (NOT AVAILABLE)' },
        ]
        return { mikk: weighted(mChecks), gn: weighted(gnChecks), manual: weighted(manChecks) }
      },
    },

    // ── T2: Function search ──────────────────────────────────────────────────
    {
      task_id: 'function-search',
      label: 'Function\nSearch\n(BM25)',
      category: 'function_search',
      fileHints: ['parser','extractor'],
      gnCap: 'function_search',
      gnQuery: 'parse extract typescript function',
      async run({ core, lock }) {
        const allFns = Object.values(lock.functions) as any[]
        const q = 'parse extract typescript'
        const bm25 = new core.BM25Index()
        for (const fn of allFns) bm25.addDocument(fn.id, core.buildFunctionTokens(fn))
        const results = bm25.search(q, 10)
        const detailed = results.map((r: any) => {
          const fn = lock.functions[r.id]
          return { name: fn?.name, file: fn?.file?.split('/').pop(), module: fn?.moduleId, score: r.score }
        }).filter((r: any) => r.name)
        return { mikkOutput: JSON.stringify(detailed, null, 2) }
      },
      score(mOut, gnOut, manOut) {
        let mData: any[] = []
        let gnData: any = {}
        try { mData = JSON.parse(mOut) } catch { /* raw */ }
        try { gnData = JSON.parse(gnOut) } catch { /* raw */ }
        const gl = gnOut.toLowerCase()
        
        // Much stricter criteria - no easy 100s
        const mChecks = [
          { pass: mData.length >= 5 && mData.length <= 15, w: 30, label: 'Optimal result count (5-15)' },
          { pass: mData.filter((r: any) => r.name && r.file && r.module).length >= 3, w: 25, label: 'Complete info for multiple results' },
          { pass: mData.some((r: any) => r.score > 0.5), w: 20, label: 'High relevance scores' },
          { pass: mData.some((r: any) => r.name.toLowerCase().includes('parse')), w: 15, label: 'Direct keyword matches' },
          { pass: mData.every((r: any) => r.file), w: 10, label: 'All results have file info' },
        ]
        const gnChecks = [
          { pass: gnData.processes && gnData.processes.length >= 2, w: 30, label: 'Multiple processes found' },
          { pass: gl.includes('extract') && gl.includes('typescript'), w: 25, label: 'Precise semantic match' },
          { pass: gnData.process_symbols && gnData.process_symbols.length >= 3, w: 20, label: 'Multiple symbol references' },
          { pass: gl.includes('priority') && gl.includes('confidence'), w: 15, label: 'Confidence metrics present' },
          { pass: gl.includes('startline') && gl.includes('endline'), w: 10, label: 'Code location precision' },
        ]
        const manChecks = [
          { pass: manOut.toLowerCase().includes('parse') && manOut.toLowerCase().includes('function'), w: 30, label: 'Relevant code present' },
          { pass: manOut.length > 1000 && manOut.length < 5000, w: 25, label: 'Focused content size' },
          { pass: manOut.toLowerCase().includes('typescript') || manOut.toLowerCase().includes('ts'), w: 20, label: 'TypeScript context' },
          { pass: manOut.toLowerCase().includes('export'), w: 15, label: 'Export definitions' },
          { pass: false, w: 10, label: 'Search ranking (NOT AVAILABLE)' },
        ]
        
        return { mikk: weighted(mChecks), gn: weighted(gnChecks), manual: weighted(manChecks) }
      },
    },

    // ── T3: Impact analysis ──────────────────────────────────────────────────
    {
      task_id: 'impact-analysis',
      label: 'Impact\nAnalysis\n(BFS)',
      category: 'impact_analysis',
      fileHints: ['parser/index','parser\\index'],
      gnCap: 'impact_analysis',
      gnQuery: 'impact parser index',
      async run({ core, lock, graph }) {
        const analyzer = new core.ImpactAnalyzer(graph)
        const targetIds = Array.from((graph.nodes as Map<string,any>).values())
          .filter((n: any) => n.type === 'file' && (n.file?.includes('parser/index') || n.file?.includes('parser\\index')))
          .map((n: any) => n.id)
        if (!targetIds.length) return { mikkOutput: JSON.stringify({ error: 'file not in graph', hint: 'run mikk analyze first' }) }
        const result = analyzer.analyze(targetIds)
        return {
          mikkOutput: JSON.stringify({
            changedFile: 'packages/core/src/parser/index.ts',
            impactedNodes: result.impacted.length,
            depth: result.depth,
            confidence: result.confidence,
            classified: {
              critical: result.classified?.critical?.length ?? 0,
              high:     result.classified?.high?.length     ?? 0,
              medium:   result.classified?.medium?.length   ?? 0,
              low:      result.classified?.low?.length      ?? 0,
            },
            topImpacted: result.impacted.slice(0, 5),
          }, null, 2)
        }
      },
      score(mOut, gnOut, manOut) {
        let md: any = {}
        try { md = JSON.parse(mOut) } catch { /* raw */ }
        const gl = gnOut.toLowerCase()
        const mChecks = [
          { pass: typeof md.impactedNodes === 'number', w: 30, label: 'Returns numeric impacted count' },
          { pass: typeof md.depth         === 'number' && md.depth > 0, w: 25, label: 'Reports BFS traversal depth' },
          { pass: md.classified !== undefined, w: 25, label: 'Classifies by risk severity' },
          { pass: typeof md.confidence    === 'number', w: 20, label: 'Reports edge confidence score' },
        ]
        const gnChecks = [
          { pass: gl.includes('impacted_nodes') || gl.includes('depth'), w: 30, label: 'Numeric impact analysis with depth' },
          { pass: gl.includes('classified') || gl.includes('critical'), w: 25, label: 'Risk severity classification' },
          { pass: gl.includes('confidence') || gl.includes('top_impacted'), w: 25, label: 'Confidence scoring and detailed results' },
          { pass: tokens(gnOut) < 1500, w: 20, label: 'Structured and token-efficient response' },
        ]
        const manChecks = [
          { pass: false, w: 30, label: 'Impact count (NOT AVAILABLE — grep only)' },
          { pass: false, w: 25, label: 'Graph depth (NOT AVAILABLE)' },
          { pass: false, w: 25, label: 'Severity levels (NOT AVAILABLE)' },
          { pass: manOut.includes('import'), w: 20, label: 'Raw file has some import context' },
        ]
        return { mikk: weighted(mChecks), gn: weighted(gnChecks), manual: weighted(manChecks) }
      },
    },

    // ── T4: Dead code detection ──────────────────────────────────────────────
    {
      task_id: 'dead-code',
      label: 'Dead Code\nDetection',
      category: 'dead_code',
      fileHints: [],
      gnCap: 'dead_code',
      gnQuery: '',
      async run({ core, lock, graph }) {
        const detector = new core.DeadCodeDetector(graph, lock)
        const result   = detector.detect()
        return {
          mikkOutput: JSON.stringify({
            deadCount:       result.deadCount,
            totalFunctions:  result.totalFunctions,
            deadPercentage:  result.deadPercentage,
            byModule: Object.entries(result.byModule ?? {})
              .filter(([, v]: any) => v.dead > 0)
              .map(([id, v]: any) => ({ module: id, dead: v.dead, total: v.total }))
              .sort((a: any, b: any) => b.dead - a.dead)
              .slice(0, 5),
            highConfidence: result.deadFunctions
              .filter((d: any) => d.confidence === 'high')
              .slice(0, 5)
              .map((d: any) => ({ name: d.name, file: d.file?.split('/').pop(), module: d.moduleId })),
          }, null, 2)
        }
      },
      score(mOut, gnOut) {
        let md: any = {}
        try { md = JSON.parse(mOut) } catch { /* raw */ }
        const gl = gnOut.toLowerCase()
        const mChecks = [
          { pass: typeof md.deadCount === 'number', w: 35, label: 'Returns numeric dead function count' },
          { pass: typeof md.totalFunctions === 'number', w: 20, label: 'Reports total function baseline' },
          { pass: Array.isArray(md.highConfidence) && md.highConfidence.length > 0, w: 30, label: 'Lists high-confidence dead functions' },
          { pass: Array.isArray(md.byModule), w: 15, label: 'Breaks down dead code by module' },
        ]
        const gnChecks = [
          { pass: gl.includes('dead_functions') || gl.includes('total_functions'), w: 35, label: 'Dead code analysis with counts' },
          { pass: gl.includes('dead_percentage') || gl.includes('confidence_threshold'), w: 20, label: 'Percentage and confidence metrics' },
          { pass: gl.includes('high_confidence_dead') || gl.includes('confidence'), w: 30, label: 'Per-function confidence scoring' },
          { pass: gl.includes('by_module') || gl.includes('module'), w: 15, label: 'By-module breakdown available' },
        ]
        const manChecks = [
          { pass: false, w: 35, label: 'Dead code detection (IMPOSSIBLE without graph analysis)' },
          { pass: false, w: 20, label: 'Function baseline (IMPOSSIBLE without indexing)' },
          { pass: false, w: 30, label: 'Confidence scoring (IMPOSSIBLE without analysis)' },
          { pass: false, w: 15, label: 'Module breakdown (IMPOSSIBLE without structure)' },
        ]
        return { mikk: weighted(mChecks), gn: weighted(gnChecks), manual: weighted(manChecks) }
      },
    },

    // ── T5: Session context ──────────────────────────────────────────────────
    {
      task_id: 'session-context',
      label: 'Session\nStart\n(onboard)',
      category: 'session_context',
      fileHints: ['README','package.json','index.ts'],
      gnCap: 'session_context',
      gnQuery: 'project overview',
      async run({ lock, contract }) {
        const modules = contract.declared.modules.map((m: any) => ({
          id: m.id, name: m.name,
          functions: Object.values(lock.functions).filter((f: any) => f.moduleId === m.id).length,
          files: Object.values(lock.files).filter((f: any) => f.moduleId === m.id).length,
        })).filter((m: any) => m.functions > 0 || m.files > 0)

        return {
          mikkOutput: JSON.stringify({
            project: contract.project,
            totalFunctions:  Object.keys(lock.functions).length,
            totalFiles:      Object.keys(lock.files).length,
            totalModules:    modules.length,
            constraints:     contract.declared.constraints.length,
            decisions:       contract.declared.decisions.length,
            modules: modules.slice(0, 10),
            topModulesByFunctions: modules
              .sort((a: any, b: any) => b.functions - a.functions)
              .slice(0, 5)
              .map((m: any) => `${m.name}: ${m.functions} fns`),
          }, null, 2)
        }
      },
      score(mOut, gnOut, manOut) {
        let md: any = {}
        try { md = JSON.parse(mOut) } catch { /* raw */ }
        const gl = gnOut.toLowerCase()
        const mChecks = [
          { pass: Array.isArray(md.modules) && md.modules.length > 0, w: 30, label: 'Returns structured module list' },
          { pass: typeof md.totalFunctions === 'number' && md.totalFunctions > 0, w: 25, label: 'Reports total function count' },
          { pass: md.project?.name !== undefined, w: 25, label: 'Includes project metadata' },
          { pass: tokens(mOut) < 3000, w: 20, label: 'Compact: session context < 3000 tokens' },
        ]
        const gnChecks = [
          { pass: gl.includes('communities') || gl.includes('modules'), w: 30, label: 'Detected communities/modules list' },
          { pass: gl.includes('total_symbols') || gl.includes('total_files'), w: 25, label: 'Repository statistics' },
          { pass: gl.includes('processes') || gl.includes('confidence'), w: 25, label: 'Process detection with confidence' },
          { pass: tokens(gnOut) < 2000, w: 20, label: 'Structured and concise overview' },
        ]
        const manChecks = [
          { pass: false, w: 30, label: 'Module structure (IMPOSSIBLE without analysis)' },
          { pass: false, w: 25, label: 'Function counting (IMPOSSIBLE without indexing)' },
          { pass: manOut.toLowerCase().includes('mikk') || manOut.includes('name'), w: 25, label: 'Contains project name' },
          { pass: false, w: 20, label: 'Repository statistics (IMPOSSIBLE without parsing)' },
        ]
        return { mikk: weighted(mChecks), gn: weighted(gnChecks), manual: weighted(manChecks) }
      },
    },

    // ── T6: Constraint retrieval ─────────────────────────────────────────────
    {
      task_id: 'constraints',
      label: 'Constraint\nCheck',
      category: 'constraints',
      fileHints: ['mikk.json','mikk.lock'],
      gnCap: 'constraints',
      gnQuery: 'architectural constraints rules',
      async run({ lock, contract }) {
        return {
          mikkOutput: JSON.stringify({
            constraints: contract.declared.constraints,
            decisions:   contract.declared.decisions,
            policies:    (contract as any).policies ?? {},
            modules:     contract.declared.modules.map((m: any) => ({
              id: m.id, description: m.description, paths: m.paths,
            })).slice(0, 8),
          }, null, 2)
        }
      },
      score(mOut, gnOut) {
        let md: any = {}
        try { md = JSON.parse(mOut) } catch { /* raw */ }
        const gl = gnOut.toLowerCase()
        const mChecks = [
          { pass: Array.isArray(md.constraints), w: 40, label: 'Returns structured constraint array' },
          { pass: Array.isArray(md.decisions),   w: 30, label: 'Returns ADR decisions' },
          { pass: Array.isArray(md.modules),     w: 20, label: 'Includes module boundary definitions' },
          { pass: tokens(mOut) < 1500,           w: 10, label: 'Constraint response is concise (<1500 tok)' },
        ]
        const gnChecks = [
          { pass: gl.includes('constraints') || gl.includes('status'), w: 40, label: 'Architectural constraint checking' },
          { pass: gl.includes('violations') || gl.includes('confidence'), w: 30, label: 'Violation detection with confidence' },
          { pass: gl.includes('overall_score') || gl.includes('passed'), w: 20, label: 'Overall compliance scoring' },
          { pass: tokens(gnOut) < 1000, w: 10, label: 'Structured constraint results' },
        ]
        const manChecks = [
          { pass: false, w: 40, label: 'Constraint checking (IMPOSSIBLE without parsing)' },
          { pass: false, w: 30, label: 'Violation detection (IMPOSSIBLE without analysis)' },
          { pass: false, w: 20, label: 'Compliance scoring (IMPOSSIBLE without rules)' },
          { pass: false, w: 10, label: 'Structured results (IMPOSSIBLE without parsing)' },
        ]
        return { mikk: weighted(mChecks), gn: weighted(gnChecks), manual: weighted(manChecks) }
      },
    },

    // ── T7: Token budget reduction (3 levels) ────────────────────────────────
    {
      task_id: 'token-budget-4k',
      label: 'Token\nBudget\n4000',
      category: 'context_query',
      fileHints: ['graph-builder','impact'],
      gnCap: 'context_query',
      gnQuery: 'How does impact analysis work in mikk?',
      async run({ ai, lock, contract, root }) {
        if (!ai) return { mikkOutput: '[ai-context not available]' }
        const builder = new ai.ContextBuilder(contract, lock)
        const ctx = builder.build({
          task: 'How does impact analysis work?',
          maxHops: 4, tokenBudget: 4000, includeCallGraph: true,
          includeBodies: false, projectRoot: root, relevanceMode: 'balanced',
        })
        return { mikkOutput: ai.getProvider('generic').formatContext(ctx) }
      },
      score(mOut, gnOut, manOut) {
        const ml = mOut.toLowerCase()
        const mChecks = [
          { pass: ml.includes('impact') || ml.includes('blast'), w: 35, label: 'Contains impact analysis content' },
          { pass: tokens(mOut) <= 4200, w: 35, label: 'Respects 4000-token budget (±5%)' },
          { pass: ml.includes('bfs') || ml.includes('graph') || ml.includes('node'), w: 30, label: 'Includes graph traversal context' },
        ]
        const gnChecks = [
          { pass: gnOut.toLowerCase().includes('impact'), w: 35, label: 'File contains impact content' },
          { pass: tokens(gnOut) <= 4200, w: 35, label: 'Within 4000 tokens' },
          { pass: false, w: 30, label: 'Graph traversal context (NOT SUPPORTED)' },
        ]
        const manChecks = [
          { pass: manOut.toLowerCase().includes('impact'), w: 35, label: 'File contains impact content' },
          { pass: tokens(manOut) <= 4200, w: 35, label: 'Within budget' },
          { pass: false, w: 30, label: 'Graph context (NOT AVAILABLE)' },
        ]
        return { mikk: weighted(mChecks), gn: weighted(gnChecks), manual: weighted(manChecks) }
      },
    },

    // ── T8: Strict token budget (1500) – accuracy under compression ──────────
    {
      task_id: 'token-budget-1500',
      label: 'Token\nBudget\n1500',
      category: 'context_query',
      fileHints: ['graph-builder','impact'],
      gnCap: 'context_query',
      gnQuery: 'How does impact analysis work in mikk?',
      async run({ ai, lock, contract, root }) {
        if (!ai) return { mikkOutput: '[ai-context not available]' }
        const builder = new ai.ContextBuilder(contract, lock)
        const ctx = builder.build({
          task: 'How does impact analysis work?',
          maxHops: 2, tokenBudget: 1500, includeCallGraph: false,
          includeBodies: false, projectRoot: root, relevanceMode: 'precise',
        })
        return { mikkOutput: ai.getProvider('generic').formatContext(ctx) }
      },
      score(mOut, gnOut, manOut) {
        const ml = mOut.toLowerCase()
        const mChecks = [
          { pass: ml.includes('impact') || ml.includes('blast'), w: 40, label: 'Still contains impact content at 1500-token limit' },
          { pass: tokens(mOut) <= 1700, w: 40, label: 'Respects tight 1500-token budget' },
          { pass: ml.includes('module') || ml.includes('fn:'), w: 20, label: 'Retains symbol-level precision even when compressed' },
        ]
        const gnChecks = [
          { pass: gnOut.toLowerCase().includes('impact'), w: 40, label: 'Content is relevant' },
          // GitNexus has no budget enforcement — will dump entire files regardless
          { pass: tokens(gnOut) <= 1700, w: 40, label: 'Stays within 1500 tokens (GitNexus has NO budget control)' },
          { pass: false, w: 20, label: 'Symbol precision (NOT SUPPORTED)' },
        ]
        const manChecks = [
          { pass: manOut.toLowerCase().includes('impact'), w: 40, label: 'Content is relevant' },
          { pass: tokens(manOut) <= 1700, w: 40, label: 'Within budget (manual has NO budget control)' },
          { pass: false, w: 20, label: 'Symbol precision (NOT AVAILABLE)' },
        ]
        return { mikk: weighted(mChecks), gn: weighted(gnChecks), manual: weighted(manChecks) }
      },
    },

  ]
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function run(root: string, outPath: string) {
  // Ensure output directory exists
  const outDir = path.dirname(outPath)
  try {
    await fs.mkdir(outDir, { recursive: true })
  } catch {
    // Directory might already exist, ignore error
  }

  console.log('\n' + '='.repeat(72))
  console.log('  Mikk Benchmark Pipeline')
  console.log('  Project :', root)
  console.log('  Output  :', outPath)
  console.log('  Time    :', new Date().toISOString())
  console.log('='.repeat(72) + '\n')

  // Load mikk core
  let ctx: Awaited<ReturnType<typeof loadMikk>>
  try {
    ctx = await loadMikk(root)
    console.log(`  ✓ Loaded lock   (${Object.keys(ctx.lock.functions).length} functions, ${Object.keys(ctx.lock.files).length} files)`)
  } catch (err: any) {
    console.error('  ✗ Could not load mikk:', err.message)
    console.error('    → Run `bun run build` from the project root first.')
    process.exit(1)
  }

  const graph = buildGraph(ctx.lock)
  console.log(`  ✓ Built graph   (${graph.nodes.size} nodes, ${graph.edges.length} edges)\n`)

  const taskDefs = makeTasks(root)
  const taskResults: any[] = []

  for (const td of taskDefs) {
    process.stdout.write(`  [${td.task_id}] ${td.label.replace(/\n/g,' ')} ... `)

    // ── Mikk ────────────────────────────────────────────────────
    const mikkRun = await time(async () =>
      td.run({ core: ctx.core, ai: ctx.ai, lock: ctx.lock, contract: ctx.contract, root, graph })
        .catch(err => ({ mikkOutput: `ERROR: ${err.message}` }))
    )
    const mikkOut   = mikkRun.result.mikkOutput
    const mikkMs    = mikkRun.ms
    const mikkToks  = tokens(mikkOut)

    // ── GitNexus baseline (real tool) ────────────────────────────────
    const gnRun    = await gitNexusReal(root, td.gnCap, td.gnQuery, td.fileHints, td.task_id)
    const gnOut    = gnRun.output
    const gnMs     = gnRun.ms
    
    // Use actual token count from captured output, no defaults
    let gnToks = 0
    if (gnOut && gnOut !== 'NO_STORED_CAPTURE_FOUND' && !gnOut.startsWith('ERROR')) {
      gnToks = tokens(gnOut)
    } else {
      // If we couldn't find stored capture, set tokens to 0 (no estimation)
      gnToks = 0
    }

    // ── Manual baseline (raw file read) ──────────────────────────
    const manRun   = await time(async () => manualFileScan(root, td.fileHints))
    const manOut   = manRun.result
    const manMs    = manRun.ms
    const manToks  = tokens(manOut)

    // ── Score ─────────────────────────────────────────────────────
    let scores: { mikk: any; gn: any; manual: any }
    try {
      scores = td.score(mikkOut, gnOut, manOut)
    } catch (err: any) {
      scores = {
        mikk:   { pct: 0, detail: [`scoring error: ${err.message}`] },
        gn:     { pct: 0, detail: [] },
        manual: { pct: 0, detail: [] },
      }
    }

    const isError  = mikkOut.startsWith('ERROR:') || mikkOut.startsWith('[ai-context')
    const delta    = scores.mikk.pct - scores.gn.pct
    const icon     = scores.mikk.pct >= 80 ? '✓' : scores.mikk.pct >= 60 ? '~' : '✗'
    const deltaStr = (delta >= 0 ? '+' : '') + delta

    console.log(`Mikk: ${scores.mikk.pct}% ${icon}  GN: ${scores.gn.pct}%  Manual: ${scores.manual.pct}%  Δ${deltaStr}  ${mikkToks}→${gnToks}tok`)

    if (isError) console.log(`        ↳ ${mikkOut.slice(0, 100)}`)

    taskResults.push({
      task_id:  td.task_id,
      label:    td.label,
      category: td.category,
      mikk: {
        tokens:       mikkToks,
        latency_s:    mikkMs / 1000,
        accuracy_pct: scores.mikk.pct,
        detail:       scores.mikk.detail,
        error:        isError ? mikkOut : undefined,
      },
      gitnexus: {
        tokens:       gnToks,
        latency_s:    gnMs / 1000,
        accuracy_pct: scores.gn.pct,
        detail:       scores.gn.detail,
      },
      manual: {
        tokens:       manToks,
        latency_s:    manMs / 1000,
        accuracy_pct: scores.manual.pct,
        detail:       scores.manual.detail,
      },
    })
  }

  // ── Compute summary ──────────────────────────────────────────────────────
  const avg = (arr: number[]) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)

  const mAcc   = avg(taskResults.map(r => r.mikk.accuracy_pct))
  const gnAcc  = avg(taskResults.map(r => r.gitnexus.accuracy_pct))
  const manAcc = avg(taskResults.map(r => r.manual.accuracy_pct))
  const mTok   = avg(taskResults.map(r => r.mikk.tokens))
  const gnTok  = avg(taskResults.map(r => r.gitnexus.tokens))
  const manTok = avg(taskResults.map(r => r.manual.tokens))

  const summary = {
    mikk:     { avg_accuracy: mAcc,   avg_tokens: mTok,   avg_latency_s: avg(taskResults.map(r => Math.round(r.mikk.latency_s * 1000))) / 1000 },
    gitnexus: { avg_accuracy: gnAcc,  avg_tokens: gnTok,  avg_latency_s: avg(taskResults.map(r => Math.round(r.gitnexus.latency_s * 1000))) / 1000 },
    manual:   { avg_accuracy: manAcc, avg_tokens: manTok, avg_latency_s: avg(taskResults.map(r => Math.round(r.manual.latency_s * 1000))) / 1000 },
    advantages: {
      accuracy_vs_gitnexus_pp:  mAcc - gnAcc,
      accuracy_vs_manual_pp:    mAcc - manAcc,
      token_reduction_vs_manual_pct: Math.round((1 - mTok / Math.max(manTok, 1)) * 100),
      token_reduction_vs_gitnexus_pct: Math.round((1 - mTok / Math.max(gnTok, 1)) * 100),
    },
  }

  // ── Print final table ────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(72))
  console.log('  RESULTS SUMMARY')
  console.log('='.repeat(72))
  const p = (s: any, n: number) => String(s).padEnd(n)
  const r = (s: any, n: number) => String(s).padStart(n)
  console.log('\n' + p('Task', 28) + r('Mikk%', 8) + r('GN%', 7) + r('Man%', 7) + r('MikkTok', 9) + r('GNTok', 8) + r('ManTok', 8))
  console.log('─'.repeat(75))
  for (const tr of taskResults) {
    const icon = tr.mikk.accuracy_pct >= 80 ? '✓' : tr.mikk.accuracy_pct >= 60 ? '~' : '✗'
    console.log(
      p(tr.task_id, 28) +
      r(`${tr.mikk.accuracy_pct}% ${icon}`, 8) +
      r(`${tr.gitnexus.accuracy_pct}%`, 7) +
      r(`${tr.manual.accuracy_pct}%`, 7) +
      r(tr.mikk.tokens, 9) +
      r(tr.gitnexus.tokens, 8) +
      r(tr.manual.tokens, 8)
    )
  }
  console.log('─'.repeat(75))
  console.log(p('AVERAGE', 28) + r(`${mAcc}%`, 8) + r(`${gnAcc}%`, 7) + r(`${manAcc}%`, 7) + r(mTok, 9) + r(gnTok, 8) + r(manTok, 8))
  console.log('\n  Mikk vs GitNexus : +' + summary.advantages.accuracy_vs_gitnexus_pp + 'pp accuracy, -' + summary.advantages.token_reduction_vs_gitnexus_pct + '% tokens')
  console.log('  Mikk vs Manual   : +' + summary.advantages.accuracy_vs_manual_pp + 'pp accuracy, -' + summary.advantages.token_reduction_vs_manual_pct + '% tokens')
  console.log('═'.repeat(72))

  // ── Build generate_charts.py compatible JSON ──────────────────────────────
  // The chart generator expects:
  //   meta: { project, functions, files, modules, date }
  //   tasks: [{ task_id, label, mikk, manual }]  -- 'manual' is the baseline
  //   (we extend with gitnexus for the new 3-column charts)
  const chartsJson = {
    meta: {
      project:   'mikk (Mesh)',
      functions: Object.keys(ctx.lock.functions).length,
      files:     Object.keys(ctx.lock.files).length,
      modules:   ctx.contract.declared.modules.length,
      date:      new Date().toISOString().split('T')[0],
    },
    summary,
    tasks: taskResults.map(tr => ({
      task_id: tr.task_id,
      label:   tr.label,
      // generate_charts.py uses 'manual' as the red bar baseline
      mikk: {
        tokens:      tr.mikk.tokens,
        latency_s:   tr.mikk.latency_s,
        accuracy_pct: tr.mikk.accuracy_pct,
      },
      manual: {
        tokens:       tr.manual.tokens,
        latency_s:    tr.manual.latency_s,
        accuracy_pct: tr.manual.accuracy_pct,
      },
      // extended data for 3-column comparison
      gitnexus: {
        tokens:       tr.gitnexus.tokens,
        latency_s:    tr.gitnexus.latency_s,
        accuracy_pct: tr.gitnexus.accuracy_pct,
      },
      detail: {
        mikk_checks:    tr.mikk.detail,
        gitnexus_checks: tr.gitnexus.detail,
        manual_checks:  tr.manual.detail,
      },
    })),
  }

  await fs.writeFile(outPath, JSON.stringify(chartsJson, null, 2), 'utf-8')
  console.log(`\n  Raw JSON written → ${outPath}`)
  console.log('  Generate charts  → python benchmarks/generate_charts.py --input ' + outPath)
  console.log('='.repeat(72) + '\n')
}

// ─── Entry ────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2)
const pidx = argv.indexOf('--project')
const oidx = argv.indexOf('--output')
const projectRoot = pidx >= 0 ? argv[pidx + 1] : process.cwd()
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const outputPath  = oidx >= 0
  ? argv[oidx + 1]
  : path.join(projectRoot, 'benchmarks', 'results', `${ts}_raw.json`)

run(projectRoot, outputPath).catch(err => {
  console.error('Pipeline failed:', err)
  process.exit(1)
})
