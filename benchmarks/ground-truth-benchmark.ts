/**
 * Mikk Ground Truth Benchmark (Semantic)
 *
 * Local-only benchmark that scores semantic correctness against explicit,
 * source-derived truth labels from the ts-express-api fixture.
 *
 * Run: bun run benchmarks/ground-truth-benchmark.ts
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

const PROJECT_ROOT = process.cwd()
const MIKK_CLI = path.join(PROJECT_ROOT, 'packages/cli/dist/index.js')
const FIXTURE_PROJECT = path.join(PROJECT_ROOT, 'benchmarks/fixtures/ts-express-api')
const REPORT_PATH = path.join(PROJECT_ROOT, 'benchmarks/ground-truth-report.json')

interface MetricResult {
    test: string
    metric: string
    score: number
    maxScore: number
    accuracy: number
    details: string
}

interface GroundTruth {
    routes: Set<string>
    jwtCallers: Record<string, Set<string>>
}

interface CommandResult {
    code: number | null
    stdout: string
    stderr: string
}

interface McpToolResult {
    transportOk: boolean
    isError: boolean
    text: string
    json: any
}

function normalizePath(filePath: string): string {
    return filePath.replace(/\\/g, '/').replace(/^\.?\//, '')
}

function scoreToPct(score: number, maxScore: number): number {
    if (maxScore <= 0) return 0
    return Math.round((score / maxScore) * 100)
}

function f1FromSets(expected: Set<string>, observed: Set<string>) {
    const intersection = [...observed].filter((item) => expected.has(item)).length
    const precision = observed.size > 0 ? intersection / observed.size : 0
    const recall = expected.size > 0 ? intersection / expected.size : 0
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0
    return {
        precision,
        recall,
        f1,
        matched: intersection,
    }
}

function runLocalCli(args: string[], cwd: string): CommandResult {
    const res = spawnSync('node', [MIKK_CLI, ...args], {
        cwd,
        encoding: 'utf8',
        timeout: 45000,
    })

    return {
        code: res.status,
        stdout: (res.stdout || '').trim(),
        stderr: (res.stderr || '').trim(),
    }
}

function normalizeRoute(method: string, routePath: string): string {
    return `${method.toUpperCase()} ${routePath}`.replace(/\/+/g, '/').replace(/\/$/, '')
}

function collectRoutesFromFile(content: string, routerVar: string): Set<string> {
    const routes = new Set<string>()
    const routeRegex = new RegExp(`${routerVar}\\.(get|post|put|patch|delete)\\('([^']+)'`, 'g')
    let match: RegExpExecArray | null

    while ((match = routeRegex.exec(content)) !== null) {
        const method = match[1]
        const localPath = match[2]
        routes.add(normalizeRoute(method, localPath))
    }

    return routes
}

function countCallersInSource(allSource: string, functionName: string): Set<string> {
    const callers = new Set<string>()

    // Lightweight caller scan for explicit known fixtures.
    if (functionName === 'verifyToken') {
        if (/validateSession\s*\([\s\S]*?verifyToken\(/.test(allSource)) callers.add('validateSession')
        if (/refreshToken\s*\([\s\S]*?verifyToken\(/.test(allSource)) callers.add('refreshToken')
    }
    if (functionName === 'signToken') {
        if (/loginUser\s*\([\s\S]*?signToken\(/.test(allSource)) callers.add('loginUser')
        if (/refreshToken\s*\([\s\S]*?signToken\(/.test(allSource)) callers.add('refreshToken')
    }
    return callers
}

async function buildGroundTruth(): Promise<GroundTruth> {
    const authPath = path.join(FIXTURE_PROJECT, 'src/routes/auth.ts')
    const usersPath = path.join(FIXTURE_PROJECT, 'src/routes/users.ts')
    const paymentsPath = path.join(FIXTURE_PROJECT, 'src/routes/payments.ts')
    const jwtPath = path.join(FIXTURE_PROJECT, 'src/auth/jwt.ts')
    const sessionPath = path.join(FIXTURE_PROJECT, 'src/auth/session.ts')
    const userServicePath = path.join(FIXTURE_PROJECT, 'src/users/service.ts')

    const [authContent, usersContent, paymentsContent, jwtContent, sessionContent, userServiceContent] = await Promise.all([
        fs.readFile(authPath, 'utf8'),
        fs.readFile(usersPath, 'utf8'),
        fs.readFile(paymentsPath, 'utf8'),
        fs.readFile(jwtPath, 'utf8'),
        fs.readFile(sessionPath, 'utf8'),
        fs.readFile(userServicePath, 'utf8'),
    ])

    const expectedRoutes = new Set<string>([
        ...collectRoutesFromFile(authContent, 'authRouter'),
        ...collectRoutesFromFile(usersContent, 'usersRouter'),
        ...collectRoutesFromFile(paymentsContent, 'paymentsRouter'),
    ])

    const sourceBlob = [jwtContent, sessionContent, userServiceContent].join('\n')
    const jwtCallers = {
        verifyToken: countCallersInSource(sourceBlob, 'verifyToken'),
        signToken: countCallersInSource(sourceBlob, 'signToken'),
    }

    return {
        routes: expectedRoutes,
        jwtCallers,
    }
}

function startLocalMcpServer(projectPath: string) {
    const proc = spawn('node', [MIKK_CLI, 'mcp', 'start', '--project', projectPath], {
        cwd: PROJECT_ROOT,
        stdio: ['pipe', 'pipe', 'pipe'],
    })

    let buffer = ''
    let initialized = false
    let requestId = 1
    const pending = new Map<number, { resolve: (value: any) => void; reject: (err: Error) => void }>()

    proc.stdout.on('data', (data) => {
        buffer += data.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
            if (!line.trim()) continue
            let msg: any
            try {
                msg = JSON.parse(line)
            } catch {
                continue
            }

            if (!initialized && msg.id === 1 && msg.result) {
                initialized = true
                proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`)
            }

            if (typeof msg.id === 'number' && pending.has(msg.id)) {
                pending.get(msg.id)!.resolve(msg)
                pending.delete(msg.id)
            }
        }
    })

    proc.stderr.on('data', () => {
        // Keep stderr quiet in benchmark output unless command fails.
    })

    function send(method: string, params: any, timeoutMs = 45000): Promise<any> {
        const id = requestId++
        const payload = { jsonrpc: '2.0', id, method, params }
        proc.stdin.write(`${JSON.stringify(payload)}\n`)

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                pending.delete(id)
                reject(new Error(`Timeout while calling ${method}`))
            }, timeoutMs)

            pending.set(id, {
                resolve: (msg) => {
                    clearTimeout(timer)
                    resolve(msg)
                },
                reject,
            })
        })
    }

    async function initialize() {
        await send('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'mikk-semantic-benchmark', version: '1.0.0' },
        })
    }

    function close() {
        proc.kill()
    }

    return { send, initialize, close }
}

function parseToolPayload(msg: any): McpToolResult {
    const text = msg?.result?.content?.[0]?.text || ''
    let json: any = null
    try {
        json = JSON.parse(text)
    } catch {
        json = null
    }
    return {
        transportOk: Boolean(msg),
        isError: Boolean(msg?.result?.isError || msg?.error),
        text,
        json,
    }
}

async function callTool(client: ReturnType<typeof startLocalMcpServer>, toolName: string, args: Record<string, unknown> = {}) {
    try {
        const msg = await client.send('tools/call', { name: toolName, arguments: args })
        return parseToolPayload(msg)
    } catch (err: any) {
        return {
            transportOk: false,
            isError: true,
            text: String(err?.message || err),
            json: null,
        } as McpToolResult
    }
}

function extractObservedRoutes(payload: McpToolResult): Set<string> {
    const observed = new Set<string>()
    const routes = payload.json?.routes
    if (!Array.isArray(routes)) return observed

    for (const route of routes) {
        const method = String(route?.method || '').toUpperCase()
        const routePath = String(route?.fullPath || route?.path || '')
        if (!method || !routePath) continue
        observed.add(normalizeRoute(method, routePath))
    }
    return observed
}

async function runSemanticBenchmark() {
    if (!await fileExists(MIKK_CLI)) {
        throw new Error(`Local CLI not found at ${MIKK_CLI}. Build CLI first.`)
    }
    if (!await fileExists(FIXTURE_PROJECT)) {
        throw new Error(`Fixture project not found at ${FIXTURE_PROJECT}.`)
    }

    const truth = await buildGroundTruth()
    const results: MetricResult[] = []

    console.log('============================================================')
    console.log('MIKK GROUND TRUTH BENCHMARK (SEMANTIC, LOCAL-ONLY)')
    console.log('============================================================')
    console.log(`Fixture: ${normalizePath(path.relative(PROJECT_ROOT, FIXTURE_PROJECT))}`)
    console.log(`Expected route count (source): ${truth.routes.size}`)

    const client = startLocalMcpServer(FIXTURE_PROJECT)
    try {
        await client.initialize()

        console.log('\n[1/4] Route Precision/Recall via MCP mikk_get_routes')
        const routesRes = await callTool(client, 'mikk_get_routes', {})
        const observedRoutes = extractObservedRoutes(routesRes)
        const routeMetrics = f1FromSets(truth.routes, observedRoutes)
        const routeScore = Math.round(routeMetrics.f1 * 100)
        results.push({
            test: 'routes',
            metric: 'f1',
            score: routeScore,
            maxScore: 100,
            accuracy: routeScore,
            details: `matched=${routeMetrics.matched}/${truth.routes.size}, precision=${routeMetrics.precision.toFixed(2)}, recall=${routeMetrics.recall.toFixed(2)}`,
        })

        console.log(`  Observed: ${observedRoutes.size}, Matched: ${routeMetrics.matched}`)
        console.log(`  Precision: ${routeMetrics.precision.toFixed(2)} Recall: ${routeMetrics.recall.toFixed(2)} F1: ${routeMetrics.f1.toFixed(2)}`)

        console.log('\n[2/4] Caller Recall via MCP mikk_get_function_detail')
        const callerFunctions = ['verifyToken', 'signToken']
        let callerHits = 0
        let callerExpected = 0
        for (const fnName of callerFunctions) {
            const expectedCallers = truth.jwtCallers[fnName] || new Set<string>()
            const detail = await callTool(client, 'mikk_get_function_detail', { name: fnName })
            const haystack = `${detail.text}\n${JSON.stringify(detail.json || {})}`.toLowerCase()
            for (const caller of expectedCallers) {
                callerExpected += 1
                if (haystack.includes(caller.toLowerCase())) {
                    callerHits += 1
                }
            }
        }
        const callerRecall = callerExpected > 0 ? callerHits / callerExpected : 0
        const callerScore = Math.round(callerRecall * 100)
        results.push({
            test: 'function-detail-callers',
            metric: 'recall',
            score: callerScore,
            maxScore: 100,
            accuracy: callerScore,
            details: `caller_hits=${callerHits}/${callerExpected}`,
        })
        console.log(`  Caller recall: ${callerHits}/${callerExpected} (${callerRecall.toFixed(2)})`)

        console.log('\n[3/4] Semantic Search Hit Rate via MCP mikk_semantic_search')
        const semanticCases = [
            { query: 'validate JWT token and session', expected: ['verifyToken', 'validateSession'] },
            { query: 'issue signed auth token for login', expected: ['signToken', 'loginUser'] },
            { query: 'mark invoice paid after payment intent', expected: ['markInvoicePaid'] },
        ]

        let semanticHits = 0
        for (const c of semanticCases) {
            const res = await callTool(client, 'mikk_semantic_search', { query: c.query, topK: 5 })
            const haystack = `${res.text}\n${JSON.stringify(res.json || {})}`.toLowerCase()
            const hit = c.expected.some((name) => haystack.includes(name.toLowerCase()))
            if (hit) semanticHits += 1
            console.log(`  ${hit ? 'OK' : 'MISS'}: "${c.query}"`)
        }
        const semanticScore = scoreToPct(semanticHits, semanticCases.length)
        results.push({
            test: 'semantic-search',
            metric: 'hit@5',
            score: semanticHits,
            maxScore: semanticCases.length,
            accuracy: semanticScore,
            details: `hits=${semanticHits}/${semanticCases.length}`,
        })

        console.log('\n[4/4] CLI Route Count Consistency (source truth vs local CLI)')
        const stats = runLocalCli(['stats', '--format', 'json'], FIXTURE_PROJECT)
        let routeCount = -1
        try {
            const parsed = JSON.parse(stats.stdout || '{}')
            routeCount = Number(parsed?.summary?.totalRoutes ?? parsed?.routes?.detected ?? parsed?.routes ?? -1)
        } catch {
            routeCount = -1
        }

        const cliRouteScore = routeCount === truth.routes.size ? 100 : 0
        results.push({
            test: 'cli-route-count',
            metric: 'exact-match',
            score: routeCount === truth.routes.size ? 1 : 0,
            maxScore: 1,
            accuracy: cliRouteScore,
            details: `cli=${routeCount}, expected=${truth.routes.size}`,
        })
        console.log(`  CLI route count: ${routeCount}, expected: ${truth.routes.size}`)
    } finally {
        client.close()
    }

    const overallAccuracy = Math.round(results.reduce((acc, r) => acc + r.accuracy, 0) / results.length)

    console.log('\n------------------------------------------------------------')
    console.log('SEMANTIC BENCHMARK SUMMARY')
    console.log('------------------------------------------------------------')
    for (const r of results) {
        console.log(`${r.test}: ${r.accuracy}% (${r.details})`)
    }
    console.log(`Overall semantic accuracy: ${overallAccuracy}%`)

    const payload = {
        timestamp: new Date().toISOString(),
        mode: 'semantic-ground-truth-local',
        fixture: normalizePath(path.relative(PROJECT_ROOT, FIXTURE_PROJECT)),
        overallAccuracy,
        results,
        truth: {
            routeCount: truth.routes.size,
            routes: [...truth.routes].sort(),
            jwtCallers: Object.fromEntries(
                Object.entries(truth.jwtCallers).map(([k, v]) => [k, [...v].sort()]),
            ),
        },
    }
    await fs.writeFile(REPORT_PATH, JSON.stringify(payload, null, 2))
    console.log(`Report saved: ${normalizePath(path.relative(PROJECT_ROOT, REPORT_PATH))}`)
}

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath)
        return true
    } catch {
        return false
    }
}

runSemanticBenchmark().catch((err) => {
    console.error(`Benchmark failed: ${err.message}`)
    process.exitCode = 1
})
