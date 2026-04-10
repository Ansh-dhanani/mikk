import * as path from 'node:path'
import type { Command } from 'commander'
import chalk from 'chalk'
import {
    ContractReader, LockReader, BoundaryChecker, DeadCodeDetector,
    type MikkLock, type DependencyGraph, type GraphNode, type GraphEdge,
} from '@getmikk/core'
import { panel, sq, gap } from '../ui.js'

export function registerCiCommand(program: Command) {
    program
        .command('ci [path]')
        .description('Check architectural constraints for CI pipelines (exits non-zero on violations)')
        .option('--strict', 'Also fail on dead code above threshold')
        .option('--dead-code-threshold <n>', 'Max allowed dead code percentage (default: 20)', '20')
        .option('--format <fmt>', 'Output format: text or json', 'text')
        .addHelpText('after',
            `\nExamples:\n` +
            `  mikk ci --strict                         Basic CI check (boundaries only)\n` +
            `  mikk ci --strict --dead-code-threshold 15   Also check dead code (15% threshold)\n` +
            `  mikk ci --strict --format json           JSON output for CI parsing\n` +
            `  mikk ci ./path/to/project                 Check a specific project\n` +
            `\nThis command is designed for CI/CD pipelines. Use "mikk contract validate"\n` +
            `for interactive development workflows.\n`)
        .action(async (projectPath: string, opts: any) => {
            const projectRoot = projectPath || process.cwd()
            const isJson = opts.format === 'json'

            try {
                const contractReader = new ContractReader()
                const lockReader = new LockReader()
                const contract = await contractReader.read(path.join(projectRoot, 'mikk.json'))
                const lock = await lockReader.read(path.join(projectRoot, 'mikk.lock.json'))

                const checker = new BoundaryChecker(contract, lock)
                const result = checker.check()

                let deadCodeResult: { deadCount: number; totalCount: number } | null = null
                if (opts.strict) {
                    const graph = buildGraphFromLock(lock)
                    const detector = new DeadCodeDetector(graph, lock)
                    deadCodeResult = detector.detect()
                }

                const threshold = parseInt(opts.deadCodeThreshold, 10)
                const deadCodePct = deadCodeResult
                    ? (deadCodeResult.deadCount / Math.max(deadCodeResult.totalCount, 1)) * 100 : 0
                const deadCodeFail = opts.strict && deadCodePct > threshold
                const overallPass = result.pass && !deadCodeFail

                if (isJson) {
                    console.log(JSON.stringify({
                        pass: overallPass,
                        violations: result.violations.length,
                        summary: result.summary,
                        ...(deadCodeResult ? { deadCode: { count: deadCodeResult.deadCount, total: deadCodeResult.totalCount, percentage: Math.round(deadCodePct * 10) / 10, pass: !deadCodeFail } } : {}),
                        details: result.violations.map(v => ({ from: `${v.from.moduleName}::${v.from.functionName}`, to: `${v.to.moduleName}::${v.to.functionName}`, rule: v.rule, severity: v.severity })),
                    }, null, 2))
                } else {
                    const W = 58
                    const statusIcon = overallPass ? sq.pass : sq.fail
                    const statusLabel = overallPass
                        ? chalk.green.bold('PASS') + chalk.dim('  all boundaries respected')
                        : chalk.red.bold('FAIL') + chalk.dim(`  ${result.violations.length} violation(s)`)

                    const rows: string[] = [statusIcon + '  ' + statusLabel]

                    if (result.violations.length > 0) {
                        rows.push('')
                        const shown = result.violations.slice(0, 20)
                        for (const v of shown) {
                            rows.push(sq.fail + '  ' + chalk.red(`${v.from.moduleName}`) + chalk.dim('::') + chalk.white(v.from.functionName))
                            rows.push('     ' + chalk.dim('→ ') + chalk.yellow(`${v.to.moduleName}`) + chalk.dim('::') + v.to.functionName)
                            rows.push('     ' + chalk.dim(v.rule))
                            if (shown.indexOf(v) < shown.length - 1) rows.push('')
                        }
                        if (result.violations.length > 20) {
                            rows.push('')
                            rows.push(chalk.dim(`   ... and ${result.violations.length - 20} more`))
                        }
                    }

                    if (opts.strict && deadCodeResult) {
                        rows.push('')
                        const dcIcon = deadCodeFail ? sq.fail : sq.pass
                        const dcLabel = deadCodeFail
                            ? chalk.red(`Dead code ${Math.round(deadCodePct)}%`) + chalk.dim(` (threshold ${threshold}%)`)
                            : chalk.green(`Dead code ${Math.round(deadCodePct)}%`) + chalk.dim(` (threshold ${threshold}%)`)
                        rows.push(dcIcon + '  ' + dcLabel)
                    }

                    panel('mikk ci — Architectural Constraint Check', rows, W)
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