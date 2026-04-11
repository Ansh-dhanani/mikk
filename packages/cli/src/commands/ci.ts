import * as path from 'node:path'
import type { Command } from 'commander'
import chalk from 'chalk'
import {
    ContractReader, LockReader, DeadCodeDetector,
    type MikkLock, type DependencyGraph, type GraphNode, type GraphEdge,
} from '@getmikk/core'
import { panel, sq, gap } from '../ui.js'

export function registerCiCommand(program: Command) {
    program
        .command('ci [path]')
        .description('Check project health for CI pipelines (exits non-zero on issues)')
        .option('--strict', 'Also check dead code and complexity thresholds')
        .option('--dead-code-threshold <n>', 'Max allowed dead code % (default: 20)', '20')
        .option('--complexity-threshold <n>', 'Max function complexity (default: 15)', '15')
        .option('--files-threshold <n>', 'Max files per module (default: 100)', '100')
        .option('--format <fmt>', 'Output format: text or json', 'text')
        .addHelpText('after',
            `\nExamples:\n` +
            `  mikk ci                              Fast check (file drift only)\n` +
            `  mikk ci --strict                     Full health check\n` +
            `  mikk ci --strict --dead-code-threshold 15   Custom threshold\n` +
            `  mikk ci --format json                Machine-readable output\n` +
            `  mikk ci ./path/to/project            Check specific project\n` +
            `\nChecks:\n` +
            `  • File drift - are files analyzed after changes?\n` +
            `  • Dead code - unused functions above threshold?\n` +
            `  • Cyclic deps - are new dependency cycles forming?\n` +
            `  • Complexity - overly complex functions?\n` +
            `  • Module size - modules with too many files?\n`)
        .action(async (projectPath: string, opts: any) => {
            const projectRoot = projectPath || process.cwd()
            const isJson = opts.format === 'json'

            try {
                const contractReader = new ContractReader()
                const lockReader = new LockReader()
                const contract = await contractReader.read(path.join(projectRoot, 'mikk.json'))
                const lock = await lockReader.read(path.join(projectRoot, 'mikk.lock.json'))

                const results: CheckResult[] = []

                // Check 1: File Drift
                const driftResult = checkFileDrift(lock)
                results.push(driftResult)

                // Check 2: Dead Code (if --strict)
                let deadCodeResult: DeadCodeCheckResult | null = null
                if (opts.strict) {
                    const graph = buildGraphFromLock(lock)
                    const detector = new DeadCodeDetector(graph, lock)
                    const detected = detector.detect()
                    const threshold = parseInt(opts.deadCodeThreshold, 10)
                    const totalCount = detected.totalCount || Object.keys(lock.functions || {}).length
                    const deadCount = detected.deadCount || 0
                    const pct = totalCount > 0 ? (deadCount / totalCount) * 100 : 0
                    deadCodeResult = {
                        deadCount,
                        totalCount,
                        percentage: Math.round(pct * 10) / 10,
                        threshold,
                        pass: pct <= threshold,
                        functions: (detected.deadFunctions || []).slice(0, 5)
                    }
                    results.push({
                        name: 'Dead Code',
                        pass: deadCodeResult.pass,
                        message: `${deadCodeResult.percentage}% (${deadCodeResult.deadCount}/${deadCodeResult.totalCount})`,
                        details: deadCodeResult.pass ? [] : deadCodeResult.functions.map(f => f.name)
                    })
                }

                // Check 3: Cyclic Dependencies
                const cycleResult = checkCyclicDependencies(lock)
                results.push(cycleResult)

                // Check 4: Complexity (if --strict)
                let complexityResult: ComplexityCheckResult | null = null
                if (opts.strict) {
                    const threshold = parseInt(opts.complexityThreshold, 10)
                    complexityResult = checkComplexity(lock, threshold)
                    results.push({
                        name: 'Complexity',
                        pass: complexityResult.pass,
                        message: `${complexityResult.overThreshold.length} functions over threshold`,
                        details: complexityResult.overThreshold.slice(0, 10)
                    })
                }

                // Check 5: Module Size (if --strict)
                let moduleSizeResult: ModuleSizeCheckResult | null = null
                if (opts.strict) {
                    const threshold = parseInt(opts.filesThreshold, 10)
                    moduleSizeResult = checkModuleSize(lock, threshold)
                    results.push({
                        name: 'Module Size',
                        pass: moduleSizeResult.pass,
                        message: `${moduleSizeResult.overSize.length} modules over threshold`,
                        details: moduleSizeResult.overSize.slice(0, 10).map(m => `${m.name}: ${m.fileCount} files`)
                    })
                }

                const overallPass = results.every(r => r.pass)

                if (isJson) {
                    console.log(JSON.stringify({
                        pass: overallPass,
                        checks: results.map(r => ({
                            name: r.name,
                            pass: r.pass,
                            message: r.message,
                            details: r.details
                        })),
                        summary: `${results.filter(r => r.pass).length}/${results.length} checks passed`
                    }, null, 2))
                } else {
                    const W = 58
                    const rows: string[] = []

                    // Summary row
                    const statusIcon = overallPass ? sq.pass : sq.fail
                    const statusLabel = overallPass
                        ? chalk.green.bold('PASS') + chalk.dim('  all checks passed')
                        : chalk.red.bold('FAIL') + chalk.dim(`  ${results.filter(r => !r.pass).length} check(s) failed`)
                    rows.push(statusIcon + '  ' + statusLabel)
                    rows.push('')

                    // Check results
                    for (const r of results) {
                        const icon = r.pass ? sq.pass : sq.fail
                        const msg = r.pass ? chalk.green(r.message) : chalk.red(r.message)
                        rows.push(icon + '  ' + chalk.cyan(r.name) + ': ' + msg)

                        if (!r.pass && r.details.length > 0) {
                            for (const d of r.details.slice(0, 3)) {
                                rows.push('     ' + chalk.yellow('▸') + ' ' + chalk.white(d))
                            }
                            if (r.details.length > 3) {
                                rows.push(chalk.dim(`     ... and ${r.details.length - 3} more`))
                            }
                        }
                    }

                    panel('mikk ci — Project Health Check', rows, W)
                    gap()
                }

                if (!overallPass) process.exit(1)
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                if (isJson) {
                    console.log(JSON.stringify({ pass: false, error: message }, null, 2))
                } else {
                    process.stderr.write(chalk.red(`\n  error  ${message}\n\n`))
                }
                process.exit(1)
            }
        })
}

interface CheckResult {
    name: string
    pass: boolean
    message: string
    details: string[]
}

interface DeadCodeCheckResult {
    deadCount: number
    totalCount: number
    percentage: number
    threshold: number
    pass: boolean
    functions: { name: string; file: string }[]
}

interface ComplexityCheckResult {
    pass: boolean
    overThreshold: { name: string; file: string; complexity: number }[]
}

interface ModuleSizeCheckResult {
    pass: boolean
    overSize: { name: string; fileCount: number }[]
}

function checkFileDrift(lock: MikkLock): CheckResult {
    const status = lock.syncState?.status || 'unknown'
    const lastSync = lock.syncState?.lastSyncAt || 'unknown'

    if (status === 'clean') {
        return {
            name: 'File Drift',
            pass: true,
            message: 'All files in sync',
            details: []
        }
    }

    return {
        name: 'File Drift',
        pass: false,
        message: `Files out of sync (status: ${status})`,
        details: ['Run: mikk analyze to sync']
    }
}

function checkCyclicDependencies(lock: MikkLock): CheckResult {
    const modules = new Map<string, Set<string>>()
    const fnCalls = lock.functions || {}

    // Build module dependency map
    for (const [fnId, fn] of Object.entries(fnCalls)) {
        const fromModule = fn.moduleId || 'unknown'
        if (!modules.has(fromModule)) {
            modules.set(fromModule, new Set())
        }
        const calls = fn.calls || []
        for (const callId of calls) {
            const toFn = fnCalls[callId]
            if (toFn) {
                const toModule = toFn.moduleId || 'unknown'
                if (fromModule !== toModule) {
                    modules.get(fromModule)!.add(toModule)
                }
            }
        }
    }

    // Detect cycles using DFS
    const cycles: string[][] = []
    const visited = new Set<string>()
    const recStack = new Set<string>()

    function dfs(node: string, path: string[]): void {
        visited.add(node)
        recStack.add(node)

        const deps = modules.get(node) || new Set()
        for (const dep of deps) {
            if (!visited.has(dep)) {
                dfs(dep, [...path, dep])
            } else if (recStack.has(dep)) {
                // Found a cycle
                const cycleStart = path.indexOf(dep)
                if (cycleStart !== -1) {
                    cycles.push([...path.slice(cycleStart), dep])
                }
            }
        }

        recStack.delete(node)
    }

    for (const module of modules.keys()) {
        if (!visited.has(module)) {
            dfs(module, [module])
        }
    }

    if (cycles.length === 0) {
        return {
            name: 'Cyclic Dependencies',
            pass: true,
            message: 'No cycles detected',
            details: []
        }
    }

    return {
        name: 'Cyclic Dependencies',
        pass: false,
        message: `${cycles.length} cycle(s) detected`,
        details: cycles.slice(0, 5).map(c => c.join(' → '))
    }
}

function checkComplexity(lock: MikkLock, threshold: number): ComplexityCheckResult {
    const overThreshold: { name: string; file: string; complexity: number }[] = []

    for (const fn of Object.values(lock.functions || {})) {
        const complexity = fn.complexity || 1
        if (complexity > threshold) {
            overThreshold.push({
                name: fn.name || 'anonymous',
                file: fn.file?.split('/').pop() || 'unknown',
                complexity
            })
        }
    }

    return {
        pass: overThreshold.length === 0,
        overThreshold: overThreshold.sort((a, b) => b.complexity - a.complexity)
    }
}

function checkModuleSize(lock: MikkLock, threshold: number): ModuleSizeCheckResult {
    const moduleFiles = new Map<string, Set<string>>()

    for (const fn of Object.values(lock.functions || {})) {
        const moduleId = fn.moduleId || 'unknown'
        if (!moduleFiles.has(moduleId)) {
            moduleFiles.set(moduleId, new Set())
        }
        if (fn.file) {
            moduleFiles.get(moduleId)!.add(fn.file)
        }
    }

    const overSize: { name: string; fileCount: number }[] = []
    for (const [module, files] of moduleFiles) {
        if (files.size > threshold) {
            overSize.push({ name: module, fileCount: files.size })
        }
    }

    return {
        pass: overSize.length === 0,
        overSize: overSize.sort((a, b) => b.fileCount - a.fileCount)
    }
}

function buildGraphFromLock(lock: MikkLock): DependencyGraph {
    const nodes = new Map<string, GraphNode>()
    const edges: GraphEdge[] = []
    const outEdges = new Map<string, GraphEdge[]>()
    const inEdges = new Map<string, GraphEdge[]>()

    for (const fn of Object.values(lock.functions)) {
        nodes.set(fn.id, { id: fn.id, type: 'function', name: fn.name, file: fn.file, moduleId: fn.moduleId, metadata: { startLine: fn.startLine, endLine: fn.endLine, isExported: fn.isExported } })
    }

    for (const fn of Object.values(lock.functions)) {
        for (const calleeId of fn.calls ?? []) {
            if (!nodes.has(calleeId)) continue
            const edge: GraphEdge = { from: fn.id, to: calleeId, type: 'calls', confidence: 1.0 }
            edges.push(edge)
            const out = outEdges.get(fn.id) ?? []; out.push(edge); outEdges.set(fn.id, out)
            const inE = inEdges.get(calleeId) ?? []; inE.push(edge); inEdges.set(calleeId, inE)
        }
    }

    for (const fn of Object.values(lock.functions)) {
        for (const callerId of fn.calledBy ?? []) {
            if (!nodes.has(fn.id) || !nodes.has(callerId)) continue
            const edge: GraphEdge = { from: callerId, to: fn.id, type: 'calls', confidence: 0.9 }
            edges.push(edge)
            const out = outEdges.get(callerId) ?? []; out.push(edge); outEdges.set(callerId, out)
            const inE = inEdges.get(fn.id) ?? []; inE.push(edge); inEdges.set(fn.id, inE)
        }
    }

    return { nodes, edges, outEdges, inEdges }
}