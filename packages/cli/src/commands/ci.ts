import * as path from 'node:path'
import type { Command } from 'commander'
import chalk from 'chalk'
import {
    ContractReader, LockReader, BoundaryChecker, DeadCodeDetector,
    type MikkLock, type DependencyGraph, type GraphNode, type GraphEdge,
} from '@getmikk/core'

/**
 * mikk ci — CI pipeline integration command.
 * Exits non-zero on constraint violations.
 * Use: `mikk ci` in CI scripts or `"lint:architecture": "mikk ci"` in package.json
 */
export function registerCiCommand(program: Command) {
    program
        .command('ci')
        .description('Check architectural constraints for CI pipelines. Exits non-zero on violations.')
        .option('--strict', 'Also fail on dead code above threshold')
        .option('--dead-code-threshold <n>', 'Max allowed dead code percentage (default: 20)', '20')
        .option('--format <fmt>', 'Output format: text or json', 'text')
        .action(async (opts) => {
            const projectRoot = process.cwd()
            const isJson = opts.format === 'json'

            try {
                const contractReader = new ContractReader()
                const lockReader = new LockReader()
                const contract = await contractReader.read(path.join(projectRoot, 'mikk.json'))
                const lock = await lockReader.read(path.join(projectRoot, 'mikk.lock.json'))

                // Run boundary checker
                const checker = new BoundaryChecker(contract, lock)
                const result = checker.check()

                // Optionally check dead code
                let deadCodeResult: any = null
                if (opts.strict) {
                    const graph = buildGraphFromLock(lock)
                    const detector = new DeadCodeDetector(graph, lock)
                    deadCodeResult = detector.detect()
                }

                const threshold = parseInt(opts.deadCodeThreshold, 10)
                const deadCodePct = deadCodeResult
                    ? (deadCodeResult.deadCount / Math.max(deadCodeResult.totalCount, 1)) * 100
                    : 0
                const deadCodeFail = opts.strict && deadCodePct > threshold

                if (isJson) {
                    console.log(JSON.stringify({
                        pass: result.pass && !deadCodeFail,
                        violations: result.violations.length,
                        summary: result.summary,
                        ...(deadCodeResult ? {
                            deadCode: {
                                count: deadCodeResult.deadCount,
                                total: deadCodeResult.totalCount,
                                percentage: Math.round(deadCodePct * 10) / 10,
                                pass: !deadCodeFail,
                            }
                        } : {}),
                        details: result.violations.map(v => ({
                            from: `${v.from.moduleName}::${v.from.functionName}`,
                            to: `${v.to.moduleName}::${v.to.functionName}`,
                            rule: v.rule,
                            severity: v.severity,
                        })),
                    }, null, 2))
                } else {
                    console.log()
                    console.log(chalk.bold('  mikk ci — Architectural Constraint Check'))
                    console.log()

                    if (result.violations.length === 0) {
                        console.log(chalk.green(`  ✓ ${result.summary}`))
                    } else {
                        console.log(chalk.red(`  ✗ ${result.summary}`))
                        console.log()
                        for (const v of result.violations.slice(0, 20)) {
                            console.log(chalk.red(`    ❌ ${v.from.moduleName}::${v.from.functionName} → ${v.to.moduleName}::${v.to.functionName}`))
                            console.log(chalk.dim(`       Rule: ${v.rule}`))
                        }
                        if (result.violations.length > 20) {
                            console.log(chalk.dim(`    ... and ${result.violations.length - 20} more`))
                        }
                    }

                    if (opts.strict && deadCodeResult) {
                        console.log()
                        if (deadCodeFail) {
                            console.log(chalk.red(`  ✗ Dead code: ${Math.round(deadCodePct)}% (threshold: ${threshold}%)`))
                        } else {
                            console.log(chalk.green(`  ✓ Dead code: ${Math.round(deadCodePct)}% (threshold: ${threshold}%)`))
                        }
                    }

                    console.log()
                }

                if (!result.pass || deadCodeFail) {
                    process.exit(1)
                }
            } catch (err: any) {
                if (isJson) {
                    console.log(JSON.stringify({ pass: false, error: err.message }, null, 2))
                } else {
                    console.error(chalk.red(`  ✗ ${err.message}`))
                    if (process.env.MIKK_DEBUG) console.error(err.stack)
                }
                process.exit(1)
            }
        })
}

/** Build graph from lock (same logic as MCP server) */
function buildGraphFromLock(lock: MikkLock): DependencyGraph {
    const nodes = new Map<string, GraphNode>()
    const edges: GraphEdge[] = []
    const outEdges = new Map<string, GraphEdge[]>()
    const inEdges = new Map<string, GraphEdge[]>()

    for (const fn of Object.values(lock.functions)) {
        nodes.set(fn.id, {
            id: fn.id, type: 'function', label: fn.name,
            file: fn.file, moduleId: fn.moduleId,
            metadata: { startLine: fn.startLine, endLine: fn.endLine, isExported: fn.isExported },
        })
    }
    for (const fn of Object.values(lock.functions)) {
        for (const calleeId of fn.calls) {
            if (!nodes.has(calleeId)) continue
            const edge: GraphEdge = { source: fn.id, target: calleeId, type: 'calls' }
            edges.push(edge)
            const out = outEdges.get(fn.id) ?? []; out.push(edge); outEdges.set(fn.id, out)
            const inE = inEdges.get(calleeId) ?? []; inE.push(edge); inEdges.set(calleeId, inE)
        }
    }
    return { nodes, edges, outEdges, inEdges }
}
