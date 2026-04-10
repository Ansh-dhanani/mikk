/**
 * Mikk Comprehensive Benchmark Suite
 * 
 * Tests ALL CLI commands and MCP tools across multiple projects
 * with multiple iterations for statistical significance.
 * 
 * Run: bun run benchmarks/comprehensive-benchmark.ts
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import * as os from 'node:os'

const PROJECT_ROOT = process.cwd()
const MIKK_CLI = path.join(PROJECT_ROOT, 'packages/cli/dist/index.js')
const BENCHMARK_OUTPUT = path.join(PROJECT_ROOT, 'benchmarks/comprehensive-report.json')
const FIXTURES_DIR = path.join(PROJECT_ROOT, 'benchmarks/fixtures')

// Configuration
const ITERATIONS = 5
const TIMEOUT_MS = 60000

interface BenchmarkResult {
    timestamp: string
    environment: {
        platform: string
        cpuCores: number
        totalMemory: number
        nodeVersion: string
    }
    projects: string[]
    iterations: number
    summary: {
        totalTests: number
        passed: number
        failed: number
        passRate: number
        overallLatencyMs: LatencyStats
        overallAccuracy: AccuracyStats
    }
    commands: CommandBenchmarkResults
    mcpTools: McpToolBenchmarkResults
    detailedResults: DetailedResult[]
}

interface LatencyStats {
    mean: number
    median: number
    min: number
    max: number
    stdDev: number
    p50: number
    p95: number
    p99: number
}

interface AccuracyStats {
    precision: number
    recall: number
    f1: number
}

interface CommandBenchmarkResults {
    [commandName: string]: {
        executions: number
        successful: number
        failed: number
        errors: string[]
        latencyMs: LatencyStats
        outputSize: number
    }
}

interface McpToolBenchmarkResults {
    [toolName: string]: {
        executions: number
        successful: number
        failed: number
        errors: string[]
        latencyMs: LatencyStats
        responseValid: number
        responseInvalid: number
    }
}

interface DetailedResult {
    category: 'command' | 'mcp-tool'
    name: string
    project: string
    iteration: number
    success: boolean
    latencyMs: number
    error?: string
    output?: string
}

// Utility functions
function normalizePath(filePath: string): string {
    return filePath.replace(/\\/g, '/').replace(/^\.?\//, '')
}

function calculateLatencyStats(values: number[]): LatencyStats {
    if (values.length === 0) {
        return { mean: 0, median: 0, min: 0, max: 0, stdDev: 0, p50: 0, p95: 0, p99: 0 }
    }
    
    const sorted = [...values].sort((a, b) => a - b)
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const median = sorted[Math.floor(sorted.length / 2)]
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
    const stdDev = Math.sqrt(variance)
    
    const percentile = (p: number) => {
        const idx = Math.ceil((p / 100) * sorted.length) - 1
        return sorted[Math.max(0, idx)]
    }
    
    return {
        mean: Math.round(mean),
        median,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        stdDev: Math.round(stdDev),
        p50: percentile(50),
        p95: percentile(95),
        p99: percentile(99),
    }
}

function calculateAccuracyStats(correct: number, total: number, expectedTotal?: number): AccuracyStats {
    const precision = total > 0 ? correct / total : 0
    const recall = expectedTotal && expectedTotal > 0 ? correct / expectedTotal : 0
    const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0
    
    return {
        precision: Math.round(precision * 10000) / 100,
        recall: Math.round(recall * 10000) / 100,
        f1: Math.round(f1 * 10000) / 100,
    }
}

function runCommand(args: string[], cwd: string, timeoutMs = TIMEOUT_MS): { code: number | null; stdout: string; stderr: string; latencyMs: number } {
    const start = Date.now()
    const res = spawnSync('node', [MIKK_CLI, ...args], {
        cwd,
        encoding: 'utf8',
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
    })
    const latencyMs = Date.now() - start
    
    return {
        code: res.status,
        stdout: (res.stdout || '').toString().trim(),
        stderr: (res.stderr || '').toString().trim(),
        latencyMs,
    }
}

class McpClient {
    private proc: ReturnType<typeof spawn> | null = null
    private buffer = ''
    private requestId = 0
    private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>()
    private initialized = false
    private startupPromise: Promise<void> | null = null

    constructor(private projectPath: string) {}

    async start(timeoutMs = 30000): Promise<void> {
        if (this.startupPromise) return this.startupPromise
        
        this.startupPromise = new Promise((resolve, reject) => {
            this.proc = spawn('node', [MIKK_CLI, 'mcp', 'start', '--project', this.projectPath], {
                cwd: PROJECT_ROOT,
                stdio: ['pipe', 'pipe', 'pipe'],
            })

            this.proc.stdout?.on('data', (data) => {
                this.buffer += data.toString()
                const lines = this.buffer.split('\n')
                this.buffer = lines.pop() || ''

                for (const line of lines) {
                    if (!line.trim()) continue
                    let msg: any
                    try {
                        msg = JSON.parse(line)
                    } catch {
                        continue
                    }

                    if (!this.initialized && msg.result) {
                        this.initialized = true
                        this.proc?.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`)
                        resolve()
                    }

                    if (typeof msg.id === 'number' && this.pending.has(msg.id)) {
                        const { resolve: res } = this.pending.get(msg.id)!
                        this.pending.delete(msg.id)
                        res(msg)
                    }
                }
            })

            this.proc.stderr?.on('data', () => {})

            this.proc.on('error', reject)
            this.proc.on('close', (code) => {
                if (!this.initialized) {
                    reject(new Error(`MCP server closed with code ${code}`))
                }
            })

            setTimeout(() => {
                if (!this.initialized) {
                    this.proc?.kill()
                    reject(new Error('MCP start timeout'))
                }
            }, timeoutMs)
        })
        
        return this.startupPromise
    }

    async send(method: string, params: any, timeoutMs = TIMEOUT_MS): Promise<any> {
        if (!this.proc) throw new Error('MCP client not started')

        const id = ++this.requestId
        const payload = { jsonrpc: '2.0', id, method, params }
        this.proc.stdin?.write(`${JSON.stringify(payload)}\n`)

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id)
                reject(new Error(`Timeout calling ${method}`))
            }, timeoutMs)

            this.pending.set(id, {
                resolve: (msg) => {
                    clearTimeout(timer)
                    resolve(msg)
                },
                reject,
            })
        })
    }

    async callTool(name: string, args: Record<string, any> = {}): Promise<{ success: boolean; text: string; json: any; latencyMs: number; error?: string }> {
        const start = Date.now()
        try {
            const msg = await this.send('tools/call', { name, arguments: args })
            const text = msg?.result?.content?.[0]?.text || ''
            let json: any = null
            try {
                json = JSON.parse(text)
            } catch {
                json = null
            }
            return {
                success: !msg?.result?.isError && !msg?.error,
                text,
                json,
                latencyMs: Date.now() - start,
            }
        } catch (err: any) {
            return {
                success: false,
                text: '',
                json: null,
                latencyMs: Date.now() - start,
                error: err.message,
            }
        }
    }

    close(): void {
        if (this.proc) {
            this.proc.kill()
            this.proc = null
            this.startupPromise = null
            this.initialized = false
        }
    }
}

// Define all CLI commands to test (based on actual available commands)
const CLI_COMMANDS = [
    { name: 'analyze', args: [] },
    { name: 'stats', args: [] },
    { name: 'doctor', args: [] },
    { name: 'diff', args: [] },
    { name: 'dead-code', args: [] },
    { name: 'suggest', args: [] },
]

// Define all MCP tools to test
const MCP_TOOLS = [
    { name: 'mikk_test_tool', args: {} },
    { name: 'mikk_get_project_overview', args: {} },
    { name: 'mikk_list_modules', args: {} },
    { name: 'mikk_search_functions', args: { query: 'parse', limit: 5 } },
    { name: 'mikk_get_routes', args: {} },
    { name: 'mikk_get_constraints', args: {} },
]

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath)
        return true
    } catch {
        return false
    }
}

async function getFixtureProjects(): Promise<string[]> {
    const projects: string[] = []
    try {
        const entries = await fs.readdir(FIXTURES_DIR, { withFileTypes: true })
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const projectPath = path.join(FIXTURES_DIR, entry.name)
                const lockFile = path.join(projectPath, 'mikk.lock.json')
                if (await fileExists(lockFile)) {
                    projects.push(entry.name)
                } else {
                    console.log(`[WARN] Skipping ${entry.name}: no mikk.lock.json`)
                }
            }
        }
    } catch (err) {
        console.error('Error reading fixtures:', err)
    }
    return projects
}

async function runCliBenchmarks(
    projects: string[],
    onResult: (result: DetailedResult) => void
): Promise<Map<string, CommandBenchmarkResults[string]>> {
    const results = new Map<string, CommandBenchmarkResults[string]>()
    
    for (const cmd of CLI_COMMANDS) {
        const fullName = `mikk ${cmd.name}${cmd.args.length > 0 ? ' ' + cmd.args.join(' ') : ''}`
        results.set(fullName, {
            executions: 0,
            successful: 0,
            failed: 0,
            errors: [],
            latencyMs: calculateLatencyStats([]),
            outputSize: 0,
        })
    }

    console.log('\n=== CLI Command Benchmarks ===')
    
    for (const project of projects) {
        const projectPath = path.join(FIXTURES_DIR, project)
        console.log(`\nProject: ${project}`)
        
        for (const cmd of CLI_COMMANDS) {
            const fullName = `mikk ${cmd.name}${cmd.args.length > 0 ? ' ' + cmd.args.join(' ') : ''}`
            const latencies: number[] = []
            const outputSizes: number[] = []
            const errors: string[] = []
            let successes = 0
            let failures = 0
            
            console.log(`  Testing: ${fullName}...`)
            
            for (let i = 0; i < ITERATIONS; i++) {
                try {
                    const result = runCommand(cmd.args, projectPath)
                    const latency = result.latencyMs
                    const outputSize = result.stdout.length + result.stderr.length
                    
                    latencies.push(latency)
                    outputSizes.push(outputSize)
                    
                    if (result.code === 0) {
                        successes++
                    } else {
                        failures++
                        const errMsg = result.stderr || `Exit code: ${result.code}`
                        if (!errors.some(e => e.includes(errMsg.slice(0, 50)))) {
                            errors.push(errMsg.slice(0, 100))
                        }
                    }
                    
                    onResult({
                        category: 'command',
                        name: fullName,
                        project,
                        iteration: i + 1,
                        success: result.code === 0,
                        latencyMs: latency,
                        error: result.code !== 0 ? result.stderr.slice(0, 200) : undefined,
                        output: result.stdout.slice(0, 500),
                    })
                } catch (err: any) {
                    failures++
                    if (!errors.includes(err.message.slice(0, 100))) {
                        errors.push(err.message.slice(0, 100))
                    }
                    onResult({
                        category: 'command',
                        name: fullName,
                        project,
                        iteration: i + 1,
                        success: false,
                        latencyMs: 0,
                        error: err.message.slice(0, 200),
                    })
                }
            }
            
            const existing = results.get(fullName)!
            existing.executions += ITERATIONS
            existing.successful += successes
            existing.failed += failures
            existing.errors = [...new Set([...existing.errors, ...errors])]
            existing.outputSize = outputSizes.length > 0 
                ? Math.round(outputSizes.reduce((a, b) => a + b, 0) / outputSizes.length)
                : 0
            existing.latencyMs = calculateLatencyStats(latencies)
            
            console.log(`    ${successes}/${ITERATIONS} passed, avg latency: ${Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)}ms`)
        }
    }

    return results
}

async function runMcpBenchmarks(
    projects: string[],
    onResult: (result: DetailedResult) => void
): Promise<Map<string, McpToolBenchmarkResults[string]>> {
    const results = new Map<string, McpToolBenchmarkResults[string]>()
    
    for (const tool of MCP_TOOLS) {
        results.set(tool.name, {
            executions: 0,
            successful: 0,
            failed: 0,
            errors: [],
            latencyMs: calculateLatencyStats([]),
            responseValid: 0,
            responseInvalid: 0,
        })
    }

    console.log('\n=== MCP Tool Benchmarks ===')

    for (const project of projects) {
        const projectPath = path.join(FIXTURES_DIR, project)
        console.log(`\nProject: ${project}`)
        
        const client = new McpClient(projectPath)
        try {
            console.log('  Connecting to MCP server...')
            await client.start(30000)
            console.log('  MCP server connected')
            
            for (const tool of MCP_TOOLS) {
                const latencies: number[] = []
                const errors: string[] = []
                let successes = 0
                let failures = 0
                let validResponses = 0
                let invalidResponses = 0
                
                console.log(`  Testing: ${tool.name}...`)
                
                for (let i = 0; i < ITERATIONS; i++) {
                    try {
                        const result = await client.callTool(tool.name, tool.args)
                        
                        latencies.push(result.latencyMs)
                        
                        if (result.success) {
                            successes++
                            if (result.json !== null) {
                                validResponses++
                            } else {
                                invalidResponses++
                            }
                        } else {
                            failures++
                            if (result.error && !errors.some(e => e.includes(result.error!.slice(0, 50)))) {
                                errors.push(result.error!.slice(0, 100))
                            }
                        }
                        
                        onResult({
                            category: 'mcp-tool',
                            name: tool.name,
                            project,
                            iteration: i + 1,
                            success: result.success,
                            latencyMs: result.latencyMs,
                            error: result.error,
                            output: result.text.slice(0, 500),
                        })
                    } catch (err: any) {
                        failures++
                        if (!errors.includes(err.message.slice(0, 100))) {
                            errors.push(err.message.slice(0, 100))
                        }
                        onResult({
                            category: 'mcp-tool',
                            name: tool.name,
                            project,
                            iteration: i + 1,
                            success: false,
                            latencyMs: 0,
                            error: err.message.slice(0, 200),
                        })
                    }
                }
                
                const existing = results.get(tool.name)!
                existing.executions += ITERATIONS
                existing.successful += successes
                existing.failed += failures
                existing.errors = [...new Set([...existing.errors, ...errors])]
                existing.responseValid += validResponses
                existing.responseInvalid += invalidResponses
                existing.latencyMs = calculateLatencyStats(latencies)
                
                console.log(`    ${successes}/${ITERATIONS} passed, avg latency: ${Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)}ms`)
            }
            
            client.close()
        } catch (err: any) {
            console.error(`  Failed to start MCP server: ${err.message}`)
            
            for (const tool of MCP_TOOLS) {
                const existing = results.get(tool.name)!
                existing.failed += ITERATIONS
                existing.errors.push(err.message.slice(0, 100))
            }
        }
    }

    return results
}

async function runComprehensiveBenchmark() {
    console.log('============================================================')
    console.log('MIKK COMPREHENSIVE BENCHMARK SUITE')
    console.log('============================================================')
    console.log(`Iterations per test: ${ITERATIONS}`)
    console.log(`Node version: ${process.version}`)
    console.log(`Platform: ${os.platform()}`)
    console.log(`CPU cores: ${os.cpus().length}`)
    console.log(`Total memory: ${Math.round(os.totalmem() / 1024 / 1024 / 1024)} GB`)

    if (!await fileExists(MIKK_CLI)) {
        console.error(`\n[ERROR] CLI not found at ${MIKK_CLI}`)
        console.error('Run "bun run build" first to build the CLI')
        process.exit(1)
    }

    const projects = await getFixtureProjects()
    if (projects.length === 0) {
        console.error('\n[ERROR] No test projects with lock files found')
        process.exit(1)
    }
    console.log(`\nTest projects: ${projects.join(', ')}`)

    const detailedResults: DetailedResult[] = []
    
    const cliResults = await runCliBenchmarks(projects, (r) => detailedResults.push(r))
    const mcpResults = await runMcpBenchmarks(projects, (r) => detailedResults.push(r))

    const allLatencies = detailedResults.map(r => r.latencyMs).filter(l => l > 0)
    const overallLatencyStats = calculateLatencyStats(allLatencies)
    
    let totalTests = 0
    let passedTests = 0
    let failedTests = 0
    
    for (const [, result] of cliResults) {
        totalTests += result.executions
        passedTests += result.successful
        failedTests += result.failed
    }
    for (const [, result] of mcpResults) {
        totalTests += result.executions
        passedTests += result.successful
        failedTests += result.failed
    }
    
    const overallAccuracy = calculateAccuracyStats(passedTests, totalTests)

    const benchmark: BenchmarkResult = {
        timestamp: new Date().toISOString(),
        environment: {
            platform: os.platform(),
            cpuCores: os.cpus().length,
            totalMemory: os.totalmem(),
            nodeVersion: process.version,
        },
        projects,
        iterations: ITERATIONS,
        summary: {
            totalTests,
            passed: passedTests,
            failed: failedTests,
            passRate: Math.round((passedTests / totalTests) * 10000) / 100,
            overallLatencyMs: overallLatencyStats,
            overallAccuracy,
        },
        commands: Object.fromEntries(cliResults),
        mcpTools: Object.fromEntries(mcpResults),
        detailedResults,
    }

    console.log('\n============================================================')
    console.log('BENCHMARK SUMMARY')
    console.log('============================================================')
    console.log(`Total tests: ${totalTests}`)
    console.log(`Passed: ${passedTests} (${benchmark.summary.passRate}%)`)
    console.log(`Failed: ${failedTests}`)
    console.log(`\nOverall latency:`)
    console.log(`  Mean: ${overallLatencyStats.mean}ms`)
    console.log(`  Median: ${overallLatencyStats.median}ms`)
    console.log(`  P95: ${overallLatencyStats.p95}ms`)
    console.log(`  P99: ${overallLatencyStats.p99}ms`)
    console.log(`\nOverall Accuracy:`)
    console.log(`  Precision: ${overallAccuracy.precision}%`)
    console.log(`  Recall: ${overallAccuracy.recall}%`)
    console.log(`  F1: ${overallAccuracy.f1}%`)

    await fs.writeFile(BENCHMARK_OUTPUT, JSON.stringify(benchmark, null, 2))
    console.log(`\nDetailed report saved: ${normalizePath(BENCHMARK_OUTPUT)}`)

    return benchmark
}

runComprehensiveBenchmark().catch((err) => {
    console.error(`\nBenchmark failed: ${err.message}`)
    console.error(err.stack)
    process.exit(1)
})
