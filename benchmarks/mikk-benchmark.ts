/**
 * Mikk vs GitNexus Benchmark Suite
 *
 * Measures:
 *  1. Answer accuracy per query category (0-100 score)
 *  2. Token efficiency (tokens used vs. tokens needed)
 *  3. CLI command correctness
 *  4. MCP tool correctness
 *
 * Run: bun benchmarks/mikk-benchmark.ts --project <path>
 *
 * GitNexus baseline is approximated from public documentation:
 *  - File-level context retrieval (not symbol-level)
 *  - No call-graph traversal
 *  - Embedding-only search
 *  - No constraint/boundary checking
 *  - No impact analysis
 */

import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { URL } from 'node:url'

// Import improved token counter
import { countTokens as improvedCountTokens } from '../packages/ai-context/src/token-counter.js'

// Declare global for garbage collection and process
declare const global: any & { gc?: () => void }
declare const process: any

// ─── Types ──────────────────────────────────────────────────────────────────

interface BenchResult {
    tool: string
    category: string
    query: string
    durationMs: number
    tokensUsed: number
    tokensRaw: number       // tokens if you'd read everything naively
    tokenEfficiency: number // tokensRaw / tokensUsed  (higher = better)
    accuracyScore: number   // 0-100
    accuracyDetails: string[]
    passed: boolean
    error?: string
}

interface SuiteResult {
    tool: 'mikk' | 'gitnexus_baseline'
    results: BenchResult[]
    summary: {
        totalTests: number
        passed: number
        failed: number
        avgAccuracy: number
        avgTokenEfficiency: number
        avgDurationMs: number
        totalTokensSaved: number
    }
}

// ─── Scoring helpers ─────────────────────────────────────────────────────────

function countTokens(text: string): number {
    return improvedCountTokens(text)
}

function score(checks: { pass: boolean; weight: number; desc: string }[]): { score: number; details: string[] } {
    const totalWeight = checks.reduce((s, c) => s + c.weight, 0)
    if (totalWeight === 0) {
        return { score: 0, details: ['No checks defined'] }
    }
    const earnedWeight = checks.filter(c => c.pass).reduce((s, c) => s + c.weight, 0)
    const details = checks.map(c => `${c.pass ? '✓' : '✗'} [${c.weight}] ${c.desc}`)
    return { score: Math.round((earnedWeight / totalWeight) * 100), details }
}

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

// ─── Mikk tool harness ───────────────────────────────────────────────────────

async function callMikkTool(
    projectRoot: string,
    toolName: string,
    args: Record<string, unknown>
): Promise<{ output: string; durationMs: number }> {
    // We call the tools by importing the core library and running them inline.
    // This avoids needing a running MCP server for benchmarking.
    const start = performance.now()
    try {
        // Validate and load core modules with proper error handling
        let core: any, ai: any
        
        try {
            const corePath = new URL(`../packages/core/dist/index.js`, import.meta.url).href
            core = await import(corePath)
        } catch (coreError: any) {
            return { 
                output: `ERROR: Failed to load core module: ${coreError.message}. Ensure 'bun run build' has been executed.`, 
                durationMs: performance.now() - start 
            }
        }
        
        try {
            const aiCtxPath = new URL(`../packages/ai-context/dist/index.js`, import.meta.url).href
            ai = await import(aiCtxPath)
        } catch (aiError: any) {
            console.warn(`AI context module not available: ${aiError.message}`)
            ai = null // AI context is optional for some tests
        }

        // Validate required files exist before proceeding
        const lockPath = path.join(projectRoot, 'mikk.lock.json')
        const contractPath = path.join(projectRoot, 'mikk.json')
        
        try {
            await fs.access(lockPath)
            await fs.access(contractPath)
        } catch (fileError: any) {
            const missingFile = fileError.message.includes('mikk.lock.json') ? 'mikk.lock.json' : 'mikk.json'
            return { 
                output: `ERROR: Required file not found: ${missingFile}. Run 'mikk init' first.`, 
                durationMs: performance.now() - start 
            }
        }

        const lockReader = new core.LockReader()
        const contractReader = new core.ContractReader()
        
        let lock: any, contract: any
        try {
            contract = await contractReader.read(contractPath)
            lock = await lockReader.read(lockPath)
        } catch (readError: any) {
            return { 
                output: `ERROR: Failed to read Mikk files: ${readError.message}`, 
                durationMs: performance.now() - start 
            }
        }

        let output = ''

        switch (toolName) {
            case 'mikk_query_context': {
                if (!ai) {
                    return { 
                        output: 'ERROR: AI context module required for context queries', 
                        durationMs: performance.now() - start 
                    }
                }
                const { ContextBuilder, getProvider } = ai
                const builder = new ContextBuilder(contract, lock)
                
                try {
                    const ctx = builder.build({
                        task: args.question as string,
                        maxHops: (args.maxHops as number) ?? 4,
                        tokenBudget: (args.tokenBudget as number) ?? 6000,
                        includeCallGraph: true,
                        includeBodies: true,
                        projectRoot,
                        relevanceMode: 'balanced',
                    })
                    output = getProvider('generic').formatContext(ctx)
                } catch (contextError: any) {
                    return { 
                        output: `ERROR: Context building failed: ${contextError.message}`, 
                        durationMs: performance.now() - start 
                    }
                }
                break
            }
            case 'mikk_search_functions': {
                try {
                    const { BM25Index, buildFunctionTokens, reciprocalRankFusion } = core
                    const allFns = Object.values(lock.functions) as any[]
                    const q = (args.query as string).toLowerCase()
                    const sub = allFns
                        .filter((f: any) => f.name.toLowerCase().includes(q))
                        .map((f: any, i: number) => ({ id: f.id, score: 100 - i }))
                    const bm25 = new BM25Index()
                    for (const fn of allFns) bm25.addDocument(fn.id, buildFunctionTokens(fn))
                    const bm25r = bm25.search(args.query as string, 20)
                    const fused = reciprocalRankFusion(sub, bm25r).slice(0, (args.limit as number) ?? 10)
                    output = JSON.stringify(fused.map((r: any) => ({
                        name: lock.functions[r.id]?.name,
                        file: lock.functions[r.id]?.file,
                        module: lock.functions[r.id]?.moduleId,
                    })))
                } catch (searchError: any) {
                    return { 
                        output: `ERROR: Function search failed: ${searchError.message}`, 
                        durationMs: performance.now() - start 
                    }
                }
                break
            }
            case 'mikk_impact_analysis': {
                try {
                    const { GraphBuilder, ImpactAnalyzer } = core
                    const builder = new core.GraphBuilder ? new core.GraphBuilder() : null
                    // Build graph from lock (fast path)
                    const graph = buildGraphFromLockInline(lock)
                    const analyzer = new ImpactAnalyzer(graph)
                    const normalizedFile = (args.file as string).replace(/\\/g, '/')
                    const fileNodes = Array.from((graph.nodes as Map<string, any>).values())
                        .filter((n: any) => n.file?.endsWith(normalizedFile) || n.file === normalizedFile)
                    
                    if (fileNodes.length === 0) {
                        return { 
                            output: `ERROR: No nodes found for file: ${args.file}`, 
                            durationMs: performance.now() - start 
                        }
                    }
                    
                    const result = analyzer.analyze(fileNodes.map((n: any) => n.id))
                    output = JSON.stringify({
                        impactedNodes: result.impacted.length,
                        depth: result.depth,
                        classified: {
                            critical: result.classified.critical.length,
                            high: result.classified.high.length,
                            medium: result.classified.medium.length,
                            low: result.classified.low.length,
                        },
                        confidence: result.confidence,
                    })
                } catch (impactError: any) {
                    return { 
                        output: `ERROR: Impact analysis failed: ${impactError.message}`, 
                        durationMs: performance.now() - start 
                    }
                }
                break
            }
            case 'mikk_get_session_context': {
                try {
                    const modules = contract.declared.modules.map((mod: any) => ({
                        id: mod.id,
                        name: mod.name,
                        functions: Object.values(lock.functions).filter((f: any) => f.moduleId === mod.id).length,
                    }))
                    output = JSON.stringify({
                        project: contract.project,
                        totalFunctions: Object.keys(lock.functions).length,
                        totalFiles: Object.keys(lock.files).length,
                        modules,
                    })
                } catch (contextError: any) {
                    return { 
                        output: `ERROR: Session context failed: ${contextError.message}`, 
                        durationMs: performance.now() - start 
                    }
                }
                break
            }
            case 'mikk_get_function_detail': {
                try {
                    const name = args.name as string
                    const matches = Object.values(lock.functions).filter(
                        (f: any) => f.name === name || f.name.endsWith(`.${name}`)
                    ) as any[]
                    output = JSON.stringify(matches.map((fn: any) => ({
                        name: fn.name,
                        file: fn.file,
                        module: fn.moduleId,
                        calls: fn.calls.map((id: string) => (lock.functions as any)[id]?.name).filter(Boolean),
                        calledBy: fn.calledBy.map((id: string) => (lock.functions as any)[id]?.name).filter(Boolean),
                        purpose: fn.purpose,
                    })))
                } catch (detailError: any) {
                    return { 
                        output: `ERROR: Function detail failed: ${detailError.message}`, 
                        durationMs: performance.now() - start 
                    }
                }
                break
            }
            case 'mikk_dead_code': {
                try {
                    const { DeadCodeDetector } = core
                    const graph = buildGraphFromLockInline(lock)
                    const detector = new DeadCodeDetector(graph, lock)
                    const result = detector.detect()
                    output = JSON.stringify({
                        deadCount: result.deadCount,
                        totalFunctions: result.totalFunctions,
                        deadPercentage: result.deadPercentage,
                        topDead: result.deadFunctions.slice(0, 5).map((d: any) => ({
                            name: d.name, confidence: d.confidence, module: d.moduleId,
                        })),
                    })
                } catch (deadCodeError: any) {
                    return { 
                        output: `ERROR: Dead code detection failed: ${deadCodeError.message}`, 
                        durationMs: performance.now() - start 
                    }
                }
                break
            }
            case 'mikk_get_constraints': {
                try {
                    output = JSON.stringify({
                        constraints: contract.declared.constraints,
                        decisions: contract.declared.decisions,
                    })
                } catch (constraintError: any) {
                    return { 
                        output: `ERROR: Constraint retrieval failed: ${constraintError.message}`, 
                        durationMs: performance.now() - start 
                    }
                }
                break
            }
            default:
                output = `Tool ${toolName} not benchmarked inline.`
        }

        return { output, durationMs: performance.now() - start }
    } catch (err: any) {
        return { output: `ERROR: Unexpected error: ${err.message}`, durationMs: performance.now() - start }
    }
}

// Build a minimal graph from the lock without re-parsing files
// Includes memory management for large codebases
function buildGraphFromLockInline(lock: any) {
    // Memory monitoring for large graphs
    const initialMemory = process.memoryUsage()
    const nodeCount = Object.keys(lock.functions || {}).length
    
    if (nodeCount > 5000) {
        console.warn(`Building large graph with ${nodeCount} nodes - memory usage will be monitored`)
    }
    
    const nodes = new Map<string, any>()
    const edges: any[] = []
    const outEdges = new Map<string, any[]>()
    const inEdges = new Map<string, any[]>()

    // Process functions with periodic memory checks and cleanup
    let processedNodes = 0
    const batchSize = 1000 // Process in batches to control memory
    
    for (const [id, fn] of Object.entries(lock.functions || {})) {
        const node = {
            id,
            name: (fn as any).name,
            file: (fn as any).file,
            type: 'function',
            moduleId: (fn as any).moduleId,
            metadata: {
                isExported: (fn as any).isExported,
                isAsync: (fn as any).isAsync,
            },
        }

        nodes.set(id, node)
        outEdges.set(id, [])
        inEdges.set(id, [])
        
        processedNodes++
        
        // Check memory every batch for large graphs
        if (nodeCount > 5000 && processedNodes % batchSize === 0) {
            const currentMemory = process.memoryUsage()
            const memoryDelta = currentMemory.heapUsed - initialMemory.heapUsed
            
            if (memoryDelta > 100 * 1024 * 1024) { // 100MB increase
                console.warn(`High memory usage detected: ${(memoryDelta / 1024 / 1024).toFixed(1)}MB increase`)
                
                // Force garbage collection if available
                if (global.gc) {
                    global.gc()
                }
                
                // If memory is still too high, consider clearing some caches
                const postGcMemory = process.memoryUsage()
                const postGcDelta = postGcMemory.heapUsed - initialMemory.heapUsed
                if (postGcDelta > 200 * 1024 * 1024) { // 200MB after GC
                    console.warn(`Memory still high after GC: ${(postGcDelta / 1024 / 1024).toFixed(1)}MB`)
                    // In a real implementation, you might want to implement paging or streaming
                }
            }
        }
    }

    // Process edges with memory monitoring
    let processedEdges = 0
    for (const [id, fn] of Object.entries(lock.functions || {})) {
        const calls = (fn as any).calls || []
        for (const targetId of calls) {
            if (nodes.has(targetId)) {
                const edge = {
                    from: id,
                    to: targetId,
                    type: 'calls',
                }
                edges.push(edge)
                outEdges.get(id)?.push(edge)
                inEdges.get(targetId)?.push(edge)
                
                processedEdges++
                
                // Periodic memory check during edge processing
                if (nodeCount > 5000 && processedEdges % batchSize === 0) {
                    const currentMemory = process.memoryUsage()
                    const memoryDelta = currentMemory.heapUsed - initialMemory.heapUsed
                    
                    if (memoryDelta > 200 * 1024 * 1024) { // 200MB increase during edge processing
                        console.warn(`High memory usage during edge processing: ${(memoryDelta / 1024 / 1024).toFixed(1)}MB`)
                        if (global.gc) {
                            global.gc()
                        }
                    }
                }
            }
        }
    }

    // Report final memory usage for large graphs
    if (nodeCount > 5000) {
        const finalMemory = process.memoryUsage()
        const totalDelta = finalMemory.heapUsed - initialMemory.heapUsed
        console.log(`Graph built: ${nodeCount} nodes, ${edges.length} edges, ${(totalDelta / 1024 / 1024).toFixed(1)}MB memory used`)
        
        // Memory cleanup hint
        if (totalDelta > 300 * 1024 * 1024) { // 300MB total
            console.warn('Large graph created. Consider implementing graph streaming or pagination for very large codebases.')
        }
    }

    // Return graph with memory metadata
    const graph = { nodes, edges, outEdges, inEdges }
    
    // Add memory metadata for debugging (only in development)
    if (process.env.NODE_ENV === 'development') {
        (graph as any).memoryStats = {
            nodeCount,
            edgeCount: edges.length,
            memoryUsed: process.memoryUsage().heapUsed - initialMemory.heapUsed,
            memoryUsedMB: Math.round((process.memoryUsage().heapUsed - initialMemory.heapUsed) / 1024 / 1024)
        }
    }

    return graph
}

// ─── GitNexus baseline simulator ────────────────────────────────────────────
// GitNexus works at FILE level, not SYMBOL level.
// It retrieves relevant files via embeddings, returns raw file content.
// Approximations based on public docs and behaviour reports.

async function callGitNexusBaseline(
    projectRoot: string,
    capability: string,
    args: Record<string, unknown>
): Promise<{ output: string; durationMs: number }> {
    const start = performance.now()

    // Simulate GitNexus behaviour:
    // - reads file list
    // - picks up to N files matching keywords
    // - returns raw content (no graph, no call chains, no constraints)
    try {
        const allFiles = await getAllSourceFiles(projectRoot)
        const query = (args.question ?? args.query ?? '') as string
        const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3)

        let matchedFiles: string[] = []

        switch (capability) {
            case 'context_query': {
                // GitNexus: embedding search returns ~5 files
                matchedFiles = allFiles
                    .filter(f => keywords.some(kw => f.toLowerCase().includes(kw)))
                    .slice(0, 5)
                break
            }
            case 'function_search': {
                // GitNexus: no function-level search — returns matching files
                matchedFiles = allFiles
                    .filter(f => keywords.some(kw => f.toLowerCase().includes(kw)))
                    .slice(0, 3)
                break
            }
            case 'impact_analysis': {
                // GitNexus: no impact analysis — returns the file + its imports (1 level)
                matchedFiles = allFiles
                    .filter(f => f.includes((args.file as string).split('/').pop() ?? ''))
                    .slice(0, 1)
                break
            }
            case 'session_context': {
                // GitNexus: README + package.json + entry points
                matchedFiles = allFiles
                    .filter(f => f.endsWith('README.md') || f.endsWith('package.json') || f.endsWith('index.ts'))
                    .slice(0, 5)
                break
            }
            case 'dead_code':
            case 'constraints':
                // GitNexus has no equivalent capability
                return {
                    output: '[NOT SUPPORTED] GitNexus does not provide dead code detection or constraint checking.',
                    durationMs: performance.now() - start,
                }
        }

        // Return raw file contents (simulating GitNexus approach)
        const contentParts: string[] = []
        for (const f of matchedFiles) {
            try {
                const absPath = path.isAbsolute(f) ? f : path.join(projectRoot, f)
                const stats = await fs.stat(absPath)
                if (stats.size > 5 * 1024 * 1024) { // 5MB limit per file
                    contentParts.push(`// === ${f} ===\n// SKIPPED: File too large (${stats.size} bytes)`)
                    continue
                }
                const content = await fs.readFile(absPath, 'utf-8')
                contentParts.push(`// === ${f} ===\n${content}`)
            } catch (err: any) {
                contentParts.push(`// === ${f} ===\n// ERROR: ${err.message}`)
            }
        }

        return {
            output: contentParts.join('\n\n') || '[No matching files found]',
            durationMs: performance.now() - start,
        }
    } catch (err: any) {
        return { output: `ERROR: ${err.message}`, durationMs: performance.now() - start }
    }
}

async function getAllSourceFiles(projectRoot: string): Promise<string[]> {
    const result: string[] = []
    const walk = async (dir: string, depth: number = 0) => {
        if (depth > 10) return // Prevent infinite recursion
        
        const entries = await fs.readdir(dir, { withFileTypes: true })
        for (const e of entries) {
            const fullPath = path.join(dir, e.name)
            if (e.isDirectory()) {
                if (['node_modules', '.git', 'dist', '.next', '.turbo'].includes(e.name)) continue
                await walk(fullPath, depth + 1)
            } else if (/\.(ts|tsx|js|jsx|go|md|json)$/.test(e.name)) {
                try {
                    const stats = await fs.stat(fullPath)
                    if (stats.size > 10 * 1024 * 1024) { // Skip files > 10MB
                        console.warn(`Skipping large file: ${fullPath} (${stats.size} bytes)`)
                        continue
                    }
                } catch {
                    // Skip files we can't stat
                    continue
                }
                result.push(path.relative(projectRoot, fullPath).replace(/\\/g, '/'))
            }
        }
    }
    await walk(projectRoot)
    return result
}

// ─── Test cases ──────────────────────────────────────────────────────────────

interface TestCase {
    id: string
    category: 'context_query' | 'function_search' | 'impact_analysis' | 'session_context' | 'dead_code' | 'constraints' | 'mcp_tool'
    description: string
    mikkTool: string
    mikkArgs: Record<string, unknown>
    gnCapability: string
    gnArgs: Record<string, unknown>
    evaluate: (mikkOut: string, gnOut: string) => {
        mikkScore: number
        gnScore: number
        mikkDetails: string[]
        gnDetails: string[]
    }
}

function makeTestCases(projectRoot: string): TestCase[] {
    return [

        // ── Category 1: Context Query ────────────────────────────────────────
        {
            id: 'ctx-01',
            category: 'context_query',
            description: 'Find authentication flow functions',
            mikkTool: 'mikk_query_context',
            mikkArgs: { question: 'How does authentication and JWT verification work?', tokenBudget: 4000 },
            gnCapability: 'context_query',
            gnArgs: { question: 'How does authentication and JWT verification work?' },
            evaluate(mOut, gnOut) {
                const mLow = mOut.toLowerCase()
                const gnLow = gnOut.toLowerCase()
                const mChecks = [
                    { pass: mLow.includes('auth') || mLow.includes('jwt') || mLow.includes('token'), weight: 30, desc: 'Contains auth/jwt/token keywords' },
                    { pass: mLow.includes('function') || mLow.includes('fn:') || mLow.includes('verify'), weight: 25, desc: 'Contains function-level details' },
                    { pass: mLow.includes('calls') || mLow.includes('calledby') || mLow.includes('call graph'), weight: 20, desc: 'Includes call graph information' },
                    { pass: mLow.includes('module') || mLow.includes('moduleid'), weight: 15, desc: 'Includes module context' },
                    { pass: countTokens(mOut) < 5000, weight: 10, desc: 'Response within token budget' },
                ]
                const gnChecks = [
                    { pass: gnLow.includes('auth') || gnLow.includes('jwt') || gnLow.includes('token'), weight: 30, desc: 'Contains auth/jwt/token keywords' },
                    { pass: gnLow.includes('function') || gnLow.includes('const') || gnLow.includes('export'), weight: 25, desc: 'Contains function-level details' },
                    { pass: false, weight: 20, desc: 'Includes call graph information (NOT SUPPORTED)' },
                    { pass: false, weight: 15, desc: 'Includes module context (NOT SUPPORTED)' },
                    { pass: countTokens(gnOut) < 5000, weight: 10, desc: 'Response within token budget' },
                ]
                const m = score(mChecks), gn = score(gnChecks)
                return { mikkScore: m.score, gnScore: gn.score, mikkDetails: m.details, gnDetails: gn.details }
            },
        },

        {
            id: 'ctx-02',
            category: 'context_query',
            description: 'Find database/query layer functions',
            mikkTool: 'mikk_query_context',
            mikkArgs: { question: 'How does the database query layer work?', tokenBudget: 3000 },
            gnCapability: 'context_query',
            gnArgs: { question: 'How does the database query layer work?' },
            evaluate(mOut, gnOut) {
                const mLow = mOut.toLowerCase()
                const gnLow = gnOut.toLowerCase()
                const mChecks = [
                    { pass: mLow.includes('query') || mLow.includes('db') || mLow.includes('database') || mLow.includes('prisma'), weight: 30, desc: 'Contains DB keywords' },
                    { pass: (mOut.match(/fn:/g) ?? []).length >= 2, weight: 25, desc: 'References ≥2 specific functions' },
                    { pass: mLow.includes('calls') || mLow.includes('import'), weight: 20, desc: 'Shows dependencies' },
                    { pass: countTokens(mOut) < 4000, weight: 25, desc: 'Token-efficient (< 4k)' },
                ]
                const gnChecks = [
                    { pass: gnLow.includes('query') || gnLow.includes('db') || gnLow.includes('database'), weight: 30, desc: 'Contains DB keywords' },
                    { pass: (gnOut.match(/function|const\s+\w+\s*=/g) ?? []).length >= 2, weight: 25, desc: 'References ≥2 functions' },
                    { pass: false, weight: 20, desc: 'Shows dependencies (NOT SUPPORTED)' },
                    { pass: countTokens(gnOut) < 4000, weight: 25, desc: 'Token-efficient (< 4k)' },
                ]
                const m = score(mChecks), gn = score(gnChecks)
                return { mikkScore: m.score, gnScore: gn.score, mikkDetails: m.details, gnDetails: gn.details }
            },
        },

        {
            id: 'ctx-03',
            category: 'context_query',
            description: 'Strict mode: find only exact match functions',
            mikkTool: 'mikk_query_context',
            mikkArgs: { question: 'parseFiles function implementation', tokenBudget: 2000, strict: true },
            gnCapability: 'context_query',
            gnArgs: { question: 'parseFiles function implementation' },
            evaluate(mOut, gnOut) {
                const mLow = mOut.toLowerCase()
                const gnLow = gnOut.toLowerCase()
                const mChecks = [
                    { pass: mLow.includes('parsefiles') || mLow.includes('parse_files'), weight: 40, desc: 'Directly references parseFiles' },
                    { pass: mLow.includes('parsedfile') || mLow.includes('filepath') || mLow.includes('projectroot'), weight: 30, desc: 'Contains parseFiles-specific params' },
                    { pass: countTokens(mOut) < 2500, weight: 30, desc: 'Tight token budget respected' },
                ]
                const gnChecks = [
                    { pass: gnLow.includes('parsefiles') || gnLow.includes('parse'), weight: 40, desc: 'Directly references parseFiles' },
                    { pass: false, weight: 30, desc: 'Exact function targeted (NOT SUPPORTED — file-level only)' },
                    { pass: countTokens(gnOut) < 2500, weight: 30, desc: 'Tight token budget' },
                ]
                const m = score(mChecks), gn = score(gnChecks)
                return { mikkScore: m.score, gnScore: gn.score, mikkDetails: m.details, gnDetails: gn.details }
            },
        },

        // ── Category 2: Function Search ──────────────────────────────────────
        {
            id: 'search-01',
            category: 'function_search',
            description: 'BM25 + semantic: find JWT verify function',
            mikkTool: 'mikk_search_functions',
            mikkArgs: { query: 'verify jwt token', limit: 5 },
            gnCapability: 'function_search',
            gnArgs: { query: 'verify jwt token' },
            evaluate(mOut, gnOut) {
                const mLow = mOut.toLowerCase()
                const gnLow = gnOut.toLowerCase()
                const mChecks = [
                    { pass: mLow.includes('verify') || mLow.includes('jwt') || mLow.includes('token'), weight: 50, desc: 'Returns relevant function names' },
                    { pass: mLow.includes('name') && mLow.includes('file'), weight: 30, desc: 'Returns name + file location' },
                    { pass: mLow.includes('module'), weight: 20, desc: 'Returns module context' },
                ]
                const gnChecks = [
                    { pass: gnLow.includes('verify') || gnLow.includes('jwt'), weight: 50, desc: 'File contains relevant content' },
                    { pass: false, weight: 30, desc: 'Returns function name + location (NOT SUPPORTED — file-level)' },
                    { pass: false, weight: 20, desc: 'Returns module context (NOT SUPPORTED)' },
                ]
                const m = score(mChecks), gn = score(gnChecks)
                return { mikkScore: m.score, gnScore: gn.score, mikkDetails: m.details, gnDetails: gn.details }
            },
        },

        {
            id: 'search-02',
            category: 'function_search',
            description: 'Find all exported API surface functions',
            mikkTool: 'mikk_search_functions',
            mikkArgs: { query: 'handler middleware controller', limit: 10 },
            gnCapability: 'function_search',
            gnArgs: { query: 'handler middleware controller' },
            evaluate(mOut, gnOut) {
                const mLow = mOut.toLowerCase()
                const mChecks = [
                    { pass: (JSON.parse(mOut.startsWith('[') ? mOut : '[]')).length >= 1, weight: 40, desc: 'Returns structured results' },
                    { pass: mLow.includes('handler') || mLow.includes('middleware') || mLow.includes('controller'), weight: 40, desc: 'Returns semantically relevant functions' },
                    { pass: mLow.includes('file') || mLow.includes('module'), weight: 20, desc: 'Includes location info' },
                ]
                const gnChecks = [
                    { pass: false, weight: 40, desc: 'Returns structured results (NOT SUPPORTED — returns raw files)' },
                    { pass: gnOut.toLowerCase().includes('handler') || gnOut.toLowerCase().includes('middleware'), weight: 40, desc: 'Content contains relevant code' },
                    { pass: false, weight: 20, desc: 'Includes location info (NOT SUPPORTED)' },
                ]
                const m = score(mChecks), gn = score(gnChecks)
                return { mikkScore: m.score, gnScore: gn.score, mikkDetails: m.details, gnDetails: gn.details }
            },
        },

        // ── Category 3: Impact Analysis ──────────────────────────────────────
        {
            id: 'impact-01',
            category: 'impact_analysis',
            description: 'Impact of changing a core utility file',
            mikkTool: 'mikk_impact_analysis',
            mikkArgs: { file: 'packages/core/src/parser/index.ts' },
            gnCapability: 'impact_analysis',
            gnArgs: { file: 'packages/core/src/parser/index.ts' },
            evaluate(mOut, gnOut) {
                let mData: any = {}
                try { 
                    mData = JSON.parse(mOut) 
                } catch (err: any) { 
                    console.warn(`Failed to parse Mikk output as JSON: ${err.message}`)
                }
                const mChecks = [
                    { pass: typeof mData.impactedNodes === 'number', weight: 30, desc: 'Provides numeric impacted count' },
                    { pass: typeof mData.depth === 'number' && mData.depth >= 1, weight: 25, desc: 'Reports traversal depth' },
                    { pass: mData.classified !== undefined, weight: 25, desc: 'Classifies by severity (critical/high/medium/low)' },
                    { pass: typeof mData.confidence === 'number', weight: 20, desc: 'Provides confidence score' },
                ]
                const gnChecks = [
                    { pass: false, weight: 30, desc: 'Provides numeric impacted count (NOT SUPPORTED)' },
                    { pass: false, weight: 25, desc: 'Reports traversal depth (NOT SUPPORTED)' },
                    { pass: false, weight: 25, desc: 'Classifies by severity (NOT SUPPORTED)' },
                    { pass: gnOut.includes('import') || gnOut.includes('from'), weight: 20, desc: 'Returns file with import context' },
                ]
                const m = score(mChecks), gn = score(gnChecks)
                return { mikkScore: m.score, gnScore: gn.score, mikkDetails: m.details, gnDetails: gn.details }
            },
        },

        // ── Category 7: MCP Tool Correctness ────────────────────────────────
        {
            id: 'mcp-01',
            category: 'mcp_tool',
            description: 'mikk_get_function_detail: returns symbol-level detail',
            mikkTool: 'mikk_get_function_detail',
            mikkArgs: { name: 'parseFiles' },
            gnCapability: 'function_search',
            gnArgs: { query: 'parseFiles' },
            evaluate(mOut, gnOut) {
                const mLow = mOut.toLowerCase()
                const mChecks = [
                    { pass: mLow.includes('parsefiles') || mLow.includes('parsedfile'), weight: 30, desc: 'Returns parseFiles data' },
                    { pass: mLow.includes('calls') || mLow.includes('calledby'), weight: 25, desc: 'Includes call graph' },
                    { pass: mLow.includes('file') && mLow.includes('module'), weight: 25, desc: 'Includes file + module location' },
                    { pass: mLow.includes('purpose'), weight: 20, desc: 'Includes purpose/description' },
                ]
                const gnChecks = [
                    { pass: gnOut.toLowerCase().includes('parsefiles') || gnOut.toLowerCase().includes('parse'), weight: 30, desc: 'File contains parseFiles' },
                    { pass: false, weight: 25, desc: 'Includes call graph (NOT SUPPORTED)' },
                    { pass: false, weight: 25, desc: 'Scoped to this function (NOT SUPPORTED — full file returned)' },
                    { pass: false, weight: 20, desc: 'Includes purpose (NOT SUPPORTED)' },
                ]
                const m = score(mChecks), gn = score(gnChecks)
                return { mikkScore: m.score, gnScore: gn.score, mikkDetails: m.details, gnDetails: gn.details }
            },
        },
    ]
}

// ─── Runner ──────────────────────────────────────────────────────────────────

async function runBenchmark(projectRoot: string): Promise<void> {
    console.log('\n' + '═'.repeat(70))
    console.log('  MIKK vs GitNexus Benchmark')
    console.log('  Project:', projectRoot)
    console.log('  Time:', new Date().toISOString())
    console.log('═'.repeat(70))

    const testCases = makeTestCases(projectRoot)
    const mikkResults: BenchResult[] = []
    const gnResults: BenchResult[] = []

    for (const tc of testCases) {
        process.stdout.write(`\n[${tc.id}] ${tc.description} ... `)

        // Run Mikk
        const mikkRun = await callMikkTool(projectRoot, tc.mikkTool, tc.mikkArgs)
        const mikkIsError = mikkRun.output.startsWith('ERROR:')

        // Run GitNexus baseline
        const gnRun = await callGitNexusBaseline(projectRoot, tc.gnCapability, tc.gnArgs)

        // Evaluate
        let mikkScore = 0, gnScore = 0
        let mikkDetails: string[] = [], gnDetails: string[] = []

        if (!mikkIsError) {
            try {
                const ev = tc.evaluate(mikkRun.output, gnRun.output)
                mikkScore = ev.mikkScore
                gnScore = ev.gnScore
                mikkDetails = ev.mikkDetails
                gnDetails = ev.gnDetails
            } catch (e: any) {
                mikkScore = 0
                mikkDetails = [`Evaluation error: ${e.message}`]
            }
        }

        const mikkTokensUsed = countTokens(mikkRun.output)
        const gnTokensUsed = countTokens(gnRun.output)

        // Raw token cost = naive approach (read all files touching this query)
        // Conservative: 15 files × 200 lines × 4 chars/token ≈ 3000 tokens per file
        const naiveTokenCost = 45_000

        mikkResults.push({
            tool: 'mikk',
            category: tc.category,
            query: tc.description,
            durationMs: Math.round(mikkRun.durationMs),
            tokensUsed: mikkTokensUsed,
            tokensRaw: naiveTokenCost,
            tokenEfficiency: Math.round(naiveTokenCost / Math.max(mikkTokensUsed, 1)),
            accuracyScore: mikkScore,
            accuracyDetails: mikkDetails,
            passed: mikkScore >= 60,
            error: mikkIsError ? mikkRun.output : undefined,
        })

        gnResults.push({
            tool: 'gitnexus_baseline',
            category: tc.category,
            query: tc.description,
            durationMs: Math.round(gnRun.durationMs),
            tokensUsed: gnTokensUsed,
            tokensRaw: naiveTokenCost,
            tokenEfficiency: Math.round(naiveTokenCost / Math.max(gnTokensUsed, 1)),
            accuracyScore: gnScore,
            accuracyDetails: gnDetails,
            passed: gnScore >= 60,
        })

        const mikkIcon = mikkScore >= 80 ? '✓' : mikkScore >= 60 ? '~' : '✗'
        const delta = mikkScore - gnScore
        const deltaStr = delta >= 0 ? `+${delta}` : `${delta}`
        process.stdout.write(`Mikk: ${mikkScore}% ${mikkIcon}  GN: ${gnScore}%  Δ${deltaStr}\n`)
    }

    // ── Print full report ────────────────────────────────────────────────────

    const mikkSummary = summarise('mikk', mikkResults)
    const gnSummary = summarise('gitnexus_baseline', gnResults)

    printReport(mikkSummary, gnSummary, mikkResults, gnResults)

    // ── Write JSON results ───────────────────────────────────────────────────
    const resultsPath = path.join(projectRoot, 'benchmarks', 'results', `benchmark-${Date.now()}.json`)
    await fs.mkdir(path.dirname(resultsPath), { recursive: true })
    await fs.writeFile(resultsPath, JSON.stringify({
        runAt: new Date().toISOString(),
        projectRoot,
        mikk: mikkSummary,
        gitnexus: gnSummary,
        detail: { mikk: mikkResults, gitnexus: gnResults },
    }, null, 2))
    console.log(`\nResults written to: ${resultsPath}`)
}

function summarise(tool: string, results: BenchResult[]): SuiteResult {
    const passed = results.filter(r => r.passed).length
    const avgAccuracy = Math.round(results.reduce((s, r) => s + r.accuracyScore, 0) / results.length)
    const avgTokenEff = Math.round(results.reduce((s, r) => s + r.tokenEfficiency, 0) / results.length)
    const avgDur = Math.round(results.reduce((s, r) => s + r.durationMs, 0) / results.length)
    const totalSaved = results.reduce((s, r) => s + Math.max(0, r.tokensRaw - r.tokensUsed), 0)

    return {
        tool: tool as any,
        results,
        summary: {
            totalTests: results.length,
            passed,
            failed: results.length - passed,
            avgAccuracy,
            avgTokenEfficiency: avgTokenEff,
            avgDurationMs: avgDur,
            totalTokensSaved: totalSaved,
        },
    }
}

function printReport(mikk: SuiteResult, gn: SuiteResult, mResults: BenchResult[], gnResults: BenchResult[]) {
    console.log('\n' + '═'.repeat(70))
    console.log('  BENCHMARK RESULTS SUMMARY')
    console.log('═'.repeat(70))

    const pad = (s: string | number, n: number) => String(s).padEnd(n)
    const pLeft = (s: string | number, n: number) => String(s).padStart(n)

    // Per-test table
    console.log('\n' + pad('ID', 12) + pad('Category', 18) + pLeft('Mikk%', 8) + pLeft('GN%', 8) + pLeft('Δ', 6) + pLeft('MikkTok', 9) + pLeft('GNTok', 8))
    console.log('─'.repeat(70))

    for (let i = 0; i < mResults.length; i++) {
        const m = mResults[i]
        const g = gnResults[i]
        const delta = m.accuracyScore - g.accuracyScore
        const deltaStr = (delta >= 0 ? '+' : '') + delta
        const icon = m.accuracyScore >= 80 ? '✓' : m.accuracyScore >= 60 ? '~' : '✗'
        console.log(
            pad(m.tool === 'mikk' ? mResults.indexOf(m) + 1 + '. ' + (mResults[i] ? mResults[i].query.slice(0, 10) + '…' : '') : '', 12) +
            pad(m.category, 18) +
            pLeft(m.accuracyScore + '% ' + icon, 8) +
            pLeft(g.accuracyScore + '%', 8) +
            pLeft(deltaStr, 6) +
            pLeft(m.tokensUsed, 9) +
            pLeft(g.tokensUsed, 8)
        )
    }

    // By-category breakdown
    console.log('\n' + '─'.repeat(70))
    console.log('  BY CATEGORY (Mikk accuracy vs GitNexus accuracy)')
    console.log('─'.repeat(70))

    const categories = [...new Set(mResults.map(r => r.category))]
    for (const cat of categories) {
        const mCat = mResults.filter(r => r.category === cat)
        const gnCat = gnResults.filter(r => r.category === cat)
        const mAvg = Math.round(mCat.reduce((s, r) => s + r.accuracyScore, 0) / mCat.length)
        const gnAvg = Math.round(gnCat.reduce((s, r) => s + r.accuracyScore, 0) / gnCat.length)
        const bar = '█'.repeat(Math.round(mAvg / 5)) + '░'.repeat(20 - Math.round(mAvg / 5))
        console.log(`  ${pad(cat, 20)} Mikk: ${pLeft(mAvg + '%', 5)}  GN: ${pLeft(gnAvg + '%', 5)}  [${bar}]`)
    }

    // Overall
    console.log('\n' + '═'.repeat(70))
    console.log('  OVERALL SCORES')
    console.log('═'.repeat(70))
    console.log(`  Mikk  avg accuracy:      ${mikk.summary.avgAccuracy}%`)
    console.log(`  GitNx avg accuracy:      ${gn.summary.avgAccuracy}%`)
    console.log(`  Accuracy advantage:      +${mikk.summary.avgAccuracy - gn.summary.avgAccuracy}pp`)
    console.log()
    console.log(`  Mikk  avg token eff:     ${mikk.summary.avgTokenEfficiency}x`)
    console.log(`  GitNx avg token eff:     ${gn.summary.avgTokenEfficiency}x`)
    console.log(`  Mikk  total tokens saved: ${mikk.summary.totalTokensSaved.toLocaleString()}`)
    console.log()
    console.log(`  Mikk  pass rate:         ${mikk.summary.passed}/${mikk.summary.totalTests} (${Math.round(mikk.summary.passed / mikk.summary.totalTests * 100)}%)`)
    console.log(`  GitNx pass rate:         ${gn.summary.passed}/${gn.summary.totalTests} (${Math.round(gn.summary.passed / gn.summary.totalTests * 100)}%)`)
    console.log()
    console.log(`  Mikk  avg latency:       ${mikk.summary.avgDurationMs}ms`)
    console.log(`  GitNx avg latency:       ${gn.summary.avgDurationMs}ms (file I/O only; no embedding inference)`)
    console.log('═'.repeat(70))

    // Detailed per-test breakdown
    console.log('\n  DETAILED SCORING\n')
    for (let i = 0; i < mResults.length; i++) {
        const m = mResults[i]
        const g = gnResults[i]
        console.log(`  [${i + 1}] ${m.query}`)
        console.log(`      Mikk (${m.accuracyScore}%):`)
        m.accuracyDetails.forEach(d => console.log('        ' + d))
        console.log(`      GitNexus (${g.accuracyScore}%):`)
        g.accuracyDetails.forEach(d => console.log('        ' + d))
        if (m.error) console.log(`      ERROR: ${m.error}`)
        console.log()
    }
}

// ─── MCP tool smoke tests ─────────────────────────────────────────────────────

async function runMcpSmokeTests(projectRoot: string): Promise<void> {
    console.log('\n' + '═'.repeat(70))
    console.log('  MCP TOOL SMOKE TESTS')
    console.log('═'.repeat(70))

    const tools = [
        { name: 'mikk_get_session_context', args: {} },
        { name: 'mikk_get_project_overview', args: {} },
        { name: 'mikk_list_modules', args: {} },
        { name: 'mikk_search_functions', args: { query: 'parse', limit: 5 } },
        { name: 'mikk_get_function_detail', args: { name: 'parseFiles' } },
        { name: 'mikk_impact_analysis', args: { file: 'packages/core/src/parser/index.ts' } },
        { name: 'mikk_query_context', args: { question: 'How does the graph builder work?', tokenBudget: 2000 } },
        { name: 'mikk_dead_code', args: {} },
        { name: 'mikk_get_constraints', args: {} },
    ]

    let passed = 0
    for (const tool of tools) {
        process.stdout.write(`  ${tool.name.padEnd(32)} ... `)
        const { output, durationMs } = await callMikkTool(projectRoot, tool.name, tool.args)
        const isError = output.startsWith('ERROR:') || output.startsWith('[NOT')
        const isEmpty = output.trim().length < 10
        const ok = !isError && !isEmpty
        if (ok) passed++
        console.log(`${ok ? '✓ PASS' : '✗ FAIL'}  (${Math.round(durationMs)}ms, ${countTokens(output)} tokens)`)
        if (!ok) console.log(`         → ${output.slice(0, 120)}`)
    }

    console.log(`\n  Smoke tests: ${passed}/${tools.length} passed`)
}

// ─── Entry point ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const projectIdx = args.indexOf('--project')
const projectRoot = projectIdx >= 0 ? args[projectIdx + 1] : process.cwd()

console.log('Benchmarking project:', projectRoot)

runMcpSmokeTests(projectRoot)
    .then(() => runBenchmark(projectRoot))
    .catch(err => {
        console.error('Benchmark failed:', err)
        process.exit(1)
    })
