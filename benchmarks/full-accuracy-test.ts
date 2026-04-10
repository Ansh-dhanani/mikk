/**
 * Mikk Comprehensive Accuracy Test
 * Tests actual accuracy of Mikk against ground truth
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { spawn } from 'node:child_process'

const FIXTURE = 'C:/Users/Ansh/Desktop/web/Mesh/benchmarks/fixtures/ts-express-api'
const CLI = 'C:/Users/Ansh/Desktop/web/Mesh/packages/cli/dist/index.js'

interface AccuracyResult {
    test: string
    expected: any
    actual: any
    accuracy: number
    status: 'pass' | 'fail'
    details: string
}

async function readSourceFiles(dir: string): Promise<string> {
    const content: string[] = []
    async function walk(d: string) {
        const entries = await fs.readdir(d, { withFileTypes: true })
        for (const e of entries) {
            const p = path.join(d, e.name)
            if (e.isDirectory()) await walk(p)
            else if (e.name.endsWith('.ts')) content.push(await fs.readFile(p, 'utf8'))
        }
    }
    await walk(dir)
    return content.join('\n')
}

function runCmd(args: string[]): Promise<{ out: string; code: number }> {
    return new Promise((resolve) => {
        const p = spawn('node', [CLI, ...args], { cwd: FIXTURE, encoding: 'utf8' })
        let out = ''
        p.stdout?.on('data', (d) => { out += d })
        p.stderr?.on('data', (d) => { out += d })
        p.on('close', (c) => resolve({ out, code: c || 0 }))
    })
}

async function accuracyTest(): Promise<AccuracyResult[]> {
    const results: AccuracyResult[] = []
    
    console.log('Reading source files...')
    const srcContent = await readSourceFiles(path.join(FIXTURE, 'src'))
    const lockContent = await fs.readFile(path.join(FIXTURE, 'mikk.lock.json'), 'utf8')
    const lock = JSON.parse(lockContent)
    
    // Test 1: File Count (.ts + .js files in project)
    const allFiles: string[] = []
    async function countFiles(d: string) {
        const entries = await fs.readdir(d, { withFileTypes: true })
        for (const e of entries) {
            const p = path.join(d, e.name)
            if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') await countFiles(p)
            else if (e.name.endsWith('.ts') || e.name.endsWith('.js')) allFiles.push(p)
        }
    }
    await countFiles(FIXTURE)
    const expectedFiles = allFiles.length
    const actualFiles = lock.syncState?.parseDiagnostics?.parsedFiles || 0
    
    results.push({
        test: 'File Count',
        expected: expectedFiles,
        actual: actualFiles,
        accuracy: expectedFiles === actualFiles ? 100 : Math.round((Math.min(expectedFiles, actualFiles) / Math.max(expectedFiles, actualFiles)) * 100),
        status: expectedFiles === actualFiles ? 'pass' : 'fail',
        details: `Source has ${expectedFiles} files (.ts+.js), Mikk parsed ${actualFiles}`
    })
    
    // Test 2: Function Count - count function declarations properly
    const fnDeclRegex = /(?:\bexport\s+)?(?:\basync\s+)?\s*(?:function\s+\w+|const\s+\w+\s*(?::\s*\w+\s*)?=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>|class\s+\w+)/g
    const expectedFns = (srcContent.match(fnDeclRegex) || []).length
    const fnIndex = Array.isArray(lock.fnIndex) ? lock.fnIndex.length : 0
    
    results.push({
        test: 'Function Count',
        expected: expectedFns,
        actual: fnIndex,
        accuracy: Math.round((Math.min(expectedFns, fnIndex) / Math.max(expectedFns, fnIndex)) * 100),
        status: Math.abs(expectedFns - fnIndex) <= 15 ? 'pass' : 'fail',
        details: `Source found ${expectedFns} function declarations, Mikk indexed ${fnIndex}`
    })
    
    // Test 3: verifyToken Detection
    const verifyInSource = srcContent.includes('verifyToken')
    const verifyInLock = lockContent.includes('verifyToken')
    results.push({
        test: 'verifyToken Function',
        expected: true,
        actual: verifyInLock,
        accuracy: verifyInLock ? 100 : 0,
        status: verifyInLock ? 'pass' : 'fail',
        details: `Found in source: ${verifyInSource}, Found in lock: ${verifyInLock}`
    })
    
    // Test 4: signToken Detection
    const signInSource = srcContent.includes('signToken')
    const signInLock = lockContent.includes('signToken')
    results.push({
        test: 'signToken Function',
        expected: true,
        actual: signInLock,
        accuracy: signInLock ? 100 : 0,
        status: signInLock ? 'pass' : 'fail',
        details: `Found in source: ${signInSource}, Found in lock: ${signInLock}`
    })
    
    // Test 5: Route Detection
    const routesRegex = /\w+Router\.(get|post|put|patch|delete|use)\s*\(/g
    const routesInSource = (srcContent.match(routesRegex) || []).length
    const stats = await runCmd(['stats'])
    const routesMatch = stats.out.match(/(\d+)\s+routes?/)
    const routesInMikk = routesMatch ? parseInt(routesMatch[1]) : 0
    
    results.push({
        test: 'Route Detection',
        expected: routesInSource,
        actual: routesInMikk,
        accuracy: routesInSource > 0 ? Math.round((Math.min(routesInSource, routesInMikk) / Math.max(routesInSource, routesInMikk)) * 100) : (routesInMikk > 0 ? 50 : 100),
        status: Math.abs(routesInSource - routesInMikk) <= 2 ? 'pass' : 'fail',
        details: `Source has ${routesInSource} routes, Mikk reports ${routesInMikk}`
    })
    
    // Test 6: Module Detection
    const modules = ['auth', 'users', 'payments', 'cache', 'db', 'middleware', 'utils', 'routes']
    let modulesFound = 0
    for (const m of modules) {
        try {
            const stat = await fs.stat(path.join(FIXTURE, 'src', m))
            if (stat.isDirectory()) modulesFound++
        } catch { /* ignore */ }
    }
    const statsOut = await runCmd(['stats'])
    const modulesMatch = statsOut.out.match(/(\d+)\s+modules/)
    const lockModules = modulesMatch ? parseInt(modulesMatch[1]) : 0
    results.push({
        test: 'Module Detection',
        expected: modulesFound,
        actual: lockModules,
        accuracy: Math.round((Math.min(modulesFound, lockModules) / Math.max(modulesFound, lockModules)) * 100),
        status: Math.abs(modulesFound - lockModules) <= 3 ? 'pass' : 'fail',
        details: `Source has ${modulesFound} src subdirs, Mikk reports ${lockModules} modules`
    })
    
    // Test 7: Call Graph Accuracy
    const callGraphEdges = lockContent.match(/"calls":\s*\[[^\]]*\]/g)?.filter(m => !m.includes('[]')).length || 0
    results.push({
        test: 'Call Graph',
        expected: 'Multiple call relationships',
        actual: `${callGraphEdges} functions with calls`,
        accuracy: callGraphEdges > 10 ? 100 : 50,
        status: callGraphEdges > 10 ? 'pass' : 'fail',
        details: `Found ${callGraphEdges} functions with call relationships`
    })
    
    // Test 8: Async Detection
    const asyncInSource = (srcContent.match(/\basync\s+(?:function\s+\w+|function\s*\(|(?:const|let|var)\s+\w+\s*=\s*\()/g) || []).length
    const asyncInLock = (lock.fnIndex || []).filter((f: any) => f.isAsync).length || lockContent.match(/"isAsync":\s*true/g)?.length || 0
    results.push({
        test: 'Async Function Detection',
        expected: asyncInSource,
        actual: asyncInLock,
        accuracy: Math.round((Math.min(asyncInSource, asyncInLock) / Math.max(asyncInSource, asyncInLock)) * 100),
        status: Math.abs(asyncInSource - asyncInLock) <= 8 ? 'pass' : 'fail',
        details: `Source has ${asyncInSource} async, Mikk found ${asyncInLock}`
    })
    
    // Test 9: Export Detection
    const exportedInSource = (srcContent.match(/(?:^|\n)\s*export\s+(?:default\s+)?(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)/g) || []).length
    const exportedInLock = (lock.fnIndex || []).filter((f: any) => f.isExported).length || lockContent.match(/"isExported":\s*true/g)?.length || 0
    results.push({
        test: 'Export Detection',
        expected: exportedInSource,
        actual: exportedInLock,
        accuracy: Math.round((Math.min(exportedInSource, exportedInLock) / Math.max(exportedInSource, exportedInLock)) * 100),
        status: Math.abs(exportedInSource - exportedInLock) <= 15 ? 'pass' : 'fail',
        details: `Source has ${exportedInSource} exports, Mikk found ${exportedInLock}`
    })
    
    // Test 9b: Import Detection
    const importRegex = /import\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+['"][^'"]+['"]|import\s+['""][^'""]+['""]|require\s*\(['""][^'"""]+['""]\)/g
    const importsInSource = (srcContent.match(importRegex) || []).length
    let importsInLock = 0
    const files = lock.files || {}
    for (const f of Object.keys(files)) {
        importsInLock += (files[f].imports || []).length
    }
    results.push({
        test: 'Import Detection',
        expected: importsInSource,
        actual: importsInLock,
        accuracy: Math.round((Math.min(importsInSource, importsInLock) / Math.max(importsInSource, importsInLock)) * 100),
        status: Math.abs(importsInSource - importsInLock) <= 3 ? 'pass' : 'fail',
        details: `Source has ${importsInSource} imports, Mikk detected ${importsInLock}`
    })
    
    // Test 10: Dead Code Detection
    const deadCode = await runCmd(['dead-code'])
    const hasDeadCode = deadCode.out.includes('0%') || deadCode.out.includes('dead')
    results.push({
        test: 'Dead Code Report',
        expected: 'Report generated',
        actual: hasDeadCode ? 'Report generated' : 'No report',
        accuracy: hasDeadCode ? 100 : 0,
        status: hasDeadCode ? 'pass' : 'fail',
        details: deadCode.out.slice(0, 100)
    })
    
    // Test 11: Doctor Check
    const doctor = await runCmd(['doctor'])
    const hasDoctor = doctor.out.includes('mikk.json') && doctor.out.includes('mikk.lock.json')
    results.push({
        test: 'Doctor Health Check',
        expected: 'Health report',
        actual: hasDoctor ? 'Report with config checks' : 'Incomplete report',
        accuracy: hasDoctor ? 100 : 50,
        status: hasDoctor ? 'pass' : 'fail',
        details: doctor.out.slice(0, 100)
    })
    
    // Test 12: Diff Command
    const diff = await runCmd(['diff'])
    const hasDiff = diff.out.includes('No changes') || diff.out.includes('changed')
    results.push({
        test: 'Diff Command',
        expected: 'Status report',
        actual: hasDiff ? 'Reports changes' : 'No output',
        accuracy: hasDiff ? 100 : 0,
        status: hasDiff ? 'pass' : 'fail',
        details: diff.out.slice(0, 100)
    })
    
    return results
}

async function main() {
    console.log('╔════════════════════════════════════════════════════════════════╗')
    console.log('║          MIKK ACCURACY TEST - ts-express-api              ║')
    console.log('╚════════════════════════════════════════════════════════════════╝\n')
    
    const results = await accuracyTest()
    
    console.log('┌─────────────────────────────────────────────────────────────┐')
    console.log('│ ACCURACY RESULTS                                          │')
    console.log('├──────────────┬──────────┬──────────┬────────┬────────────────┤')
    console.log('│ Test        │ Expected │ Actual   │ Acc %  │ Status         │')
    console.log('├──────────────┼──────────┼──────────┼────────┼────────────────┤')
    
    let totalAcc = 0
    let passCount = 0
    
    for (const r of results) {
        totalAcc += r.accuracy
        if (r.status === 'pass') passCount++
        
        const test = r.test.padEnd(12).slice(0, 12)
        const exp = String(r.expected).padEnd(10).slice(0, 10)
        const act = String(r.actual).padEnd(10).slice(0, 10)
        const acc = r.accuracy.toString().padEnd(6)
        const status = r.status.toUpperCase().padEnd(14).slice(0, 14)
        
        console.log(`│ ${test} │ ${exp} │ ${act} │ ${acc} │ ${status} │`)
    }
    
    console.log('└──────────────┴──────────┴──────────┴────────┴────────────────┘\n')
    
    const avgAcc = Math.round(totalAcc / results.length)
    console.log(`Overall Accuracy: ${avgAcc}%`)
    console.log(`Tests Passed: ${passCount}/${results.length}`)
    console.log(`\nDETAILED RESULTS:\n`)
    
    for (const r of results) {
        console.log(`[${r.status.toUpperCase()}] ${r.test}`)
        console.log(`  Expected: ${r.expected}`)
        console.log(`  Actual: ${r.actual}`)
        console.log(`  Accuracy: ${r.accuracy}%`)
        console.log(`  Details: ${r.details}`)
        console.log()
    }
}

main().catch(console.error)
