/**
 * Performance Benchmark Suite
 * Tests latency, memory, and throughput for Mikk operations
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { spawnSync } from 'node:child_process'

const CLI = 'node packages/cli/dist/index.js'
const FIXTURES = 'benchmarks/fixtures'

interface BenchmarkResult {
    operation: string
    fixture: string
    iterations: number
    mean: number
    median: number
    min: number
    max: number
    p95: number
}

function runCommand(cmd: string, cwd: string): { time: number; output: string } {
    const start = Date.now()
    const result = spawnSync('sh', ['-c', cmd], { cwd, encoding: 'utf8' })
    return { time: Date.now() - start, output: result.stdout }
}

function calculateStats(values: number[]): { mean: number; median: number; min: number; max: number; p95: number } {
    const sorted = [...values].sort((a, b) => a - b)
    return {
        mean: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
        median: sorted[Math.floor(sorted.length / 2)],
        min: sorted[0],
        max: sorted[sorted.length - 1],
        p95: sorted[Math.floor(sorted.length * 0.95)],
    }
}

async function runBenchmark(name: string, fixture: string, operation: () => void, iterations = 5): Promise<BenchmarkResult> {
    const times: number[] = []
    
    for (let i = 0; i < iterations; i++) {
        const start = Date.now()
        operation()
        times.push(Date.now() - start)
    }
    
    const stats = calculateStats(times)
    return { operation: name, fixture, iterations, ...stats }
}

async function main() {
    console.log('='.repeat(60))
    console.log('MIKK PERFORMANCE BENCHMARKS')
    console.log('='.repeat(60))
    console.log()

    const results: BenchmarkResult[] = []

    // TypeScript Express API
    console.log('Testing: ts-express-api (small, ~50 files)')
    const tsFixture = path.join(process.cwd(), FIXTURES, 'ts-express-api')
    
    results.push(await runBenchmark(
        'analyze',
        'ts-express-api',
        () => runCommand(`${CLI} analyze`, tsFixture)
    ))

    results.push(await runBenchmark(
        'search (exact)',
        'ts-express-api',
        () => runCommand(`${CLI} search auth --mode exact`, tsFixture)
    ))

    results.push(await runBenchmark(
        'search (direct)',
        'ts-express-api',
        () => runCommand(`${CLI} search auth --mode direct`, tsFixture)
    ))

    results.push(await runBenchmark(
        'search (semantic)',
        'ts-express-api',
        () => runCommand(`${CLI} search auth --mode semantic`, tsFixture)
    ))

    results.push(await runBenchmark(
        'search (hybrid)',
        'ts-express-api',
        () => runCommand(`${CLI} search auth`, tsFixture)
    ))

    results.push(await runBenchmark(
        'dead-code',
        'ts-express-api',
        () => runCommand(`${CLI} dead-code`, tsFixture)
    ))

    results.push(await runBenchmark(
        'stats',
        'ts-express-api',
        () => runCommand(`${CLI} stats`, tsFixture)
    ))

    results.push(await runBenchmark(
        'ci',
        'ts-express-api',
        () => runCommand(`${CLI} ci`, tsFixture)
    ))

    // Polyglot services
    console.log('Testing: polyglot-services (multi-language)')
    const polyglotFixture = path.join(process.cwd(), FIXTURES, 'polyglot-services')
    
    results.push(await runBenchmark(
        'analyze (polyglot)',
        'polyglot-services',
        () => runCommand(`${CLI} analyze`, polyglotFixture)
    ))

    results.push(await runBenchmark(
        'search (polyglot)',
        'polyglot-services',
        () => runCommand(`${CLI} search user`, polyglotFixture)
    ))

    // Full Mikk codebase (large)
    console.log('Testing: Mikk itself (large, ~1400 functions)')
    const mikkRoot = process.cwd()
    
    results.push(await runBenchmark(
        'analyze',
        'mikk (large)',
        () => runCommand(`${CLI} analyze`, mikkRoot)
    ))

    results.push(await runBenchmark(
        'search',
        'mikk (large)',
        () => runCommand(`${CLI} search parser`, mikkRoot)
    ))

    results.push(await runBenchmark(
        'dead-code',
        'mikk (large)',
        () => runCommand(`${CLI} dead-code`, mikkRoot)
    ))

    // Print results table
    console.log()
    console.log('='.repeat(60))
    console.log('RESULTS')
    console.log('='.repeat(60))
    console.log()
    console.log(`${'Operation'.padEnd(20)} ${'Fixture'.padEnd(20)} ${'Mean'.padStart(8)} ${'Median'.padStart(8)} ${'P95'.padStart(8)} ${'Max'.padStart(8)}`)
    console.log('-'.repeat(80))

    for (const r of results) {
        console.log(
            `${r.operation.padEnd(20)} ${r.fixture.padEnd(20)} ` +
            `${String(r.mean).padStart(7)}ms ${String(r.median).padStart(7)}ms ${String(r.p95).padStart(7)}ms ${String(r.max).padStart(7)}ms`
        )
    }

    console.log()
    console.log('='.repeat(60))

    // Save to file
    const report = {
        timestamp: new Date().toISOString(),
        environment: {
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch,
        },
        results,
    }

    await fs.writeFile('benchmarks/performance-report.json', JSON.stringify(report, null, 2))
    console.log('\nReport saved: benchmarks/performance-report.json')
}

main().catch(console.error)
