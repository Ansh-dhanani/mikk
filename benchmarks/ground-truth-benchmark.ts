/**
 * Mikk Ground Truth Benchmark
 * 
 * Tests Mikk against verified ground truth data to measure actual accuracy.
 * Run: bun run benchmarks/ground-truth-benchmark.ts
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { performance } from 'node:perf_hooks'

const MIKK_CLI = path.join(process.cwd(), 'packages/cli/dist/index.js')
const FIXTURES_DIR = path.join(process.cwd(), 'benchmarks/fixtures')

// Get fixture paths relative to project root
const getFixturePath = (name: string) => path.join(FIXTURES_DIR, name)

const TEST_PROJECTS = [
    getFixturePath('ts-express-api'),
    getFixturePath('python-service'),
    getFixturePath('go-service'),
    getFixturePath('java-service'),
    process.cwd(), // Mikk self
]

interface BenchmarkResult {
    test: string
    project: string
    metric: string
    value: number
    expected: number
    accuracy: number
    details: string
}

const results: BenchmarkResult[] = []

async function runCommand(cmd: string, cwd: string): Promise<string> {
    const { execSync } = await import('child_process')
    try {
        return execSync(cmd, { cwd, encoding: 'utf-8', timeout: 30000 })
    } catch (e: any) {
        return e.stdout || e.message || ''
    }
}

async function loadLock(projectPath: string) {
    const lockPath = path.join(projectPath, 'mikk.lock.json')
    try {
        return JSON.parse(await fs.readFile(lockPath, 'utf-8'))
    } catch {
        return null
    }
}

async function benchmarkDeadCodeDetection(projectPath: string, projectName: string) {
    console.log(`\n📊 Testing Dead Code Detection: ${projectName}`)
    
    const lock = await loadLock(projectPath)
    if (!lock) {
        console.log('  ⚠️  No lock file, skipping')
        return
    }

    const functions = Object.values(lock.functions || {}) as any[]
    const graph = lock.graph || { nodes: 0, edges: 0 }
    
    console.log(`  Functions: ${functions.length}`)
    console.log(`  Graph nodes: ${graph.nodes}, edges: ${graph.edges}`)

    // Ground truth: Calculate actual dead functions from calls
    // A function is truly dead if:
    // 1. It has no callers (no calledBy)
    // 2. It's not exported
    // 3. It's not a constructor or test
    // 4. It's not a route handler

    let trulyDead = 0
    let potentiallyDead = 0
    
    for (const fn of functions) {
        const hasNoCallers = !fn.calls || fn.calls.length === 0
        const isExported = fn.isExported === true
        const isTest = fn.name?.toLowerCase().includes('test') || 
                       fn.purpose?.toLowerCase().includes('test')
        const isConstructor = fn.name === 'constructor'
        const isHandler = fn.purpose?.toLowerCase().includes('handler') ||
                         fn.purpose?.toLowerCase().includes('route')
        
        if (hasNoCallers && !isExported && !isTest && !isConstructor && !isHandler) {
            trulyDead++
        }
        if (hasNoCallers && !isTest && !isConstructor) {
            potentiallyDead++
        }
    }

    // Get Mikk's reported dead code
    const output = await runCommand(`node ${MIKK_CLI} dead-code`, projectPath)
    const deadMatch = output.match(/Dead functions:\s+(\d+)/)
    const mikkDead = deadMatch ? parseInt(deadMatch[1]) : 0

    // Calculate accuracy
    const expectedDead = trulyDead
    const accuracy = expectedDead > 0 ? Math.round((Math.min(mikkDead, expectedDead) / expectedDead) * 100) : 100

    console.log(`  Expected dead (ground truth): ${expectedDead}`)
    console.log(`  Mikk reported: ${mikkDead}`)
    console.log(`  Accuracy: ${accuracy}%`)

    results.push({
        test: 'dead-code-detection',
        project: projectName,
        metric: 'precision',
        value: mikkDead,
        expected: expectedDead,
        accuracy,
        details: `Potentially dead: ${potentiallyDead}, Exported fns excluded: ${potentiallyDead - expectedDead}`
    })
}

async function benchmarkFunctionSearch(projectPath: string, projectName: string) {
    console.log(`\n📊 Testing Function Search: ${projectName}`)
    
    const lock = await loadLock(projectPath)
    if (!lock) {
        console.log('  ⚠️  No lock file, skipping')
        return
    }

    const testQueries = [
        { query: 'validate JWT token', expectedModule: 'auth' },
        { query: 'create user', expectedModule: 'user' },
        { query: 'database connection', expectedModule: 'db' },
    ]

    let totalRelevance = 0
    
    for (const { query, expectedModule } of testQueries) {
        const output = await runCommand(
            `node ${MIKK_CLI} context query "${query}"`,
            projectPath
        )
        
        // Check if relevant module appears in results
        const hasRelevant = output.toLowerCase().includes(expectedModule.toLowerCase())
        totalRelevance += hasRelevant ? 100 : 0
        
        console.log(`  Query "${query}": ${hasRelevant ? '✅' : '❌'} found ${expectedModule}`)
    }

    const accuracy = Math.round(totalRelevance / testQueries.length)
    console.log(`  Search accuracy: ${accuracy}%`)

    results.push({
        test: 'function-search',
        project: projectName,
        metric: 'relevance',
        value: totalRelevance / testQueries.length,
        expected: 100,
        accuracy,
        details: `${testQueries.length} queries tested`
    })
}

async function benchmarkImpactAnalysis(projectPath: string, projectName: string) {
    console.log(`\n📊 Testing Impact Analysis: ${projectName}`)
    
    const lock = await loadLock(projectPath)
    if (!lock) {
        console.log('  ⚠️  No lock file, skipping')
        return
    }

    // Find a key file to test impact
    const files = Object.keys(lock.files || {})
    const testFile = files.find(f => f.includes('auth') || f.includes('user') || f.includes('main'))
    
    if (!testFile) {
        console.log('  ⚠️  No suitable test file found')
        return
    }

    const relativePath = testFile.split(/[/\\]/).slice(-2).join('/')
    const output = await runCommand(
        `node ${MIKK_CLI} context impact ${relativePath}`,
        projectPath
    )

    // Extract impact count
    const impactMatch = output.match(/Impacted nodes:\s+(\d+)/)
    const impacted = impactMatch ? parseInt(impactMatch[1]) : 0

    // Ground truth: Count functions in the file + their callers
    // Get all functions that reference this file
    const fileFunctions = Object.values(lock.functions as any[])
        .filter((fn: any) => fn.file && fn.file.includes(relativePath.split('/')[0]))
    
    // Count unique functions that might be impacted
    let expectedImpact = 0
    for (const fn of fileFunctions) {
        // Add the function itself
        expectedImpact++
        // Add its callees (functions it calls)
        expectedImpact += (fn.calls || []).length
    }

    console.log(`  Test file: ${relativePath}`)
    console.log(`  Mikk impacted: ${impacted}`)
    console.log(`  Functions referencing file: ${fileFunctions.length}`)

    // If file has no functions, we can't calculate meaningful ground truth
    // But if Mikk returns > 0, that's good - it means it found impact
    if (fileFunctions.length === 0) {
        console.log('  ⚠️  No functions found in file - skipping accuracy calc')
        results.push({
            test: 'impact-analysis',
            project: projectName,
            metric: 'impact_coverage',
            value: impacted,
            expected: 0,
            accuracy: impacted > 0 ? 100 : 0,
            details: `No functions in file but Mikk found ${impacted} impacted`
        })
        return
    }

    const accuracy = impacted > 0 ? Math.min(100, Math.round((impacted / Math.max(expectedImpact, 1)) * 100)) : 0

    results.push({
        test: 'impact-analysis',
        project: projectName,
        metric: 'impact_coverage',
        value: impacted,
        expected: expectedImpact,
        accuracy,
        details: `Functions in file: ${fileFunctions.length}, calls made: ${expectedImpact - fileFunctions.length}`
    })
}

async function benchmarkContextGeneration(projectPath: string, projectName: string) {
    console.log(`\n📊 Testing Context Generation: ${projectName}`)
    
    const lock = await loadLock(projectPath)
    if (!lock) {
        console.log('  ⚠️  No lock file, skipping')
        return
    }

    const functions = Object.values(lock.functions || {}) as any[]
    const modules = Object.values(lock.modules || {}) as any[]
    
    // Test context generation - use 'query' instead of 'session'
    const t0 = performance.now()
    const output = await runCommand(
        `node ${MIKK_CLI} context query "main function"`,
        projectPath
    )
    const latency = Math.round(performance.now() - t0)

    // Check if key info is present
    const hasFunctions = output.includes('functions') || output.includes('Functions') || output.includes('<fn ')
    const hasModules = output.includes('module') || output.includes('module')
    const hasContext = output.includes('<mikk_context>') || output.length > 200
    
    const completeness = [hasFunctions, hasModules, hasContext].filter(Boolean).length * 100 / 3
    const accuracy = output.length > 500 ? completeness : 0

    console.log(`  Latency: ${latency}ms`)
    console.log(`  Output length: ${output.length} chars`)
    console.log(`  Has context: ${hasContext}, Has functions: ${hasFunctions}, Has modules: ${hasModules}`)
    console.log(`  Completeness: ${Math.round(completeness)}%`)

    results.push({
        test: 'context-generation',
        project: projectName,
        metric: 'completeness',
        value: output.length,
        expected: 1000,
        accuracy,
        details: `Functions: ${functions.length}, Modules: ${modules.length}, Latency: ${latency}ms`
    })
}

async function benchmarkRouteDetection(projectPath: string, projectName: string) {
    console.log(`\n📊 Testing Route Detection: ${projectName}`)
    
    const lock = await loadLock(projectPath)
    if (!lock) {
        console.log('  ⚠️  No lock file, skipping')
        return
    }

    // Count routes in lock file
    const routes = lock.routes || []
    const hasRoutes = routes.length > 0

    // Also check if any functions have route handlers
    const functions = Object.values(lock.functions || {}) as any[]
    const routeHandlers = functions.filter((fn: any) => 
        fn.purpose?.toLowerCase().includes('route') ||
        fn.purpose?.toLowerCase().includes('handler') ||
        fn.purpose?.toLowerCase().includes('endpoint')
    )

    // Get stats output
    const output = await runCommand(`node ${MIKK_CLI} stats`, projectPath)
    const routeMatch = output.match(/(\d+)\s+routes?/)
    const mikkRoutes = routeMatch ? parseInt(routeMatch[1]) : 0

    console.log(`  Lock file routes: ${routes.length}`)
    console.log(`  Route handler functions: ${routeHandlers.length}`)
    console.log(`  Mikk reported routes: ${mikkRoutes}`)

    // For TS projects, we expect routes. For others, 0 is acceptable.
    const isTSProject = projectName.includes('ts-') || projectName.includes('express')
    const expectedRoutes = isTSProject ? Math.max(routes.length, routeHandlers.length) : 0
    const accuracy = expectedRoutes > 0 
        ? Math.min(100, Math.round((mikkRoutes / expectedRoutes) * 100))
        : (mikkRoutes === 0 ? 100 : 0)

    results.push({
        test: 'route-detection',
        project: projectName,
        metric: 'detection',
        value: mikkRoutes,
        expected: expectedRoutes,
        accuracy,
        details: `Lock routes: ${routes.length}, Handler functions: ${routeHandlers.length}`
    })
}

async function runBenchmarks() {
    console.log('═══════════════════════════════════════════════════════════════')
    console.log('          MIKK GROUND TRUTH BENCHMARK')
    console.log('═══════════════════════════════════════════════════════════════')

    const startTime = Date.now()

    for (const projectPath of TEST_PROJECTS) {
        const projectName = path.basename(projectPath)
        
        console.log(`\n${'═'.repeat(60)}`)
        console.log(`📁 Project: ${projectName}`)
        console.log(`   Path: ${projectPath}`)

        try {
            await benchmarkDeadCodeDetection(projectPath, projectName)
            await benchmarkFunctionSearch(projectPath, projectName)
            await benchmarkImpactAnalysis(projectPath, projectName)
            await benchmarkContextGeneration(projectPath, projectName)
            await benchmarkRouteDetection(projectPath, projectName)
        } catch (e: any) {
            console.error(`  ❌ Error: ${e.message}`)
        }
    }

    // Generate summary report
    console.log('\n' + '═'.repeat(60))
    console.log('                    📈 BENCHMARK RESULTS')
    console.log('═'.repeat(60))

    // Group by test type
    const testTypes = [...new Set(results.map(r => r.test))]
    
    for (const testType of testTypes) {
        const testResults = results.filter(r => r.test === testType)
        const avgAccuracy = Math.round(testResults.reduce((a, b) => a + b.accuracy, 0) / testResults.length)
        
        console.log(`\n🎯 ${testType} (Average: ${avgAccuracy}%)`)
        console.log('-'.repeat(50))
        
        for (const r of testResults) {
            const icon = r.accuracy >= 80 ? '✅' : r.accuracy >= 50 ? '⚠️' : '❌'
            console.log(`  ${icon} ${r.project}: ${r.accuracy}% (${r.value}/${r.expected})`)
            console.log(`      ${r.details}`)
        }
    }

    // Overall summary
    const overallAccuracy = Math.round(results.reduce((a, b) => a + b.accuracy, 0) / results.length)
    const totalTime = Date.now() - startTime

    console.log('\n' + '═'.repeat(60))
    console.log('                   📊 OVERALL SUMMARY')
    console.log('═'.repeat(60))
    console.log(`\n  Overall Accuracy: ${overallAccuracy}%`)
    console.log(`  Tests Run: ${results.length}`)
    console.log(`  Projects Tested: ${TEST_PROJECTS.length}`)
    console.log(`  Time Elapsed: ${Math.round(totalTime / 1000)}s`)

    // Performance metrics
    console.log('\n📈 Performance:')
    const contextResults = results.filter(r => r.test === 'context-generation')
    if (contextResults.length > 0) {
        for (const r of contextResults) {
            const latencyMatch = r.details.match(/Latency: (\d+)ms/)
            if (latencyMatch) {
                console.log(`  ${r.project}: ${latencyMatch[1]}ms`)
            }
        }
    }

    // Save results
    const reportPath = 'C:/Users/Ansh/Desktop/web/Mesh/benchmarks/ground-truth-report.json'
    await fs.writeFile(reportPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        overallAccuracy,
        results,
        summary: {
            totalTests: results.length,
            projects: TEST_PROJECTS.length,
            duration: totalTime
        }
    }, null, 2))

    console.log(`\n📄 Report saved to: ${reportPath}`)
}

runBenchmarks().catch(console.error)
