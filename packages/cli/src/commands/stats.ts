import * as path from 'node:path'
import type { Command } from 'commander'
import chalk from 'chalk'
import {
    ContractReader, LockReader, BoundaryChecker, DeadCodeDetector,
    type MikkLock, type DependencyGraph, type GraphNode, type GraphEdge,
} from '@getmikk/core'

/**
 * mikk stats — codebase health dashboard.
 * Shows function counts, file counts, dead code %, constraint violations,
 * module breakdown, and average function size.
 */
export function registerStatsCommand(program: Command) {
    program
        .command('stats')
        .description('Show codebase health statistics: functions, files, dead code, violations')
        .option('--format <fmt>', 'Output format: text or json', 'text')
        .action(async (opts) => {
            const projectRoot = process.cwd()
            const isJson = opts.format === 'json'

            try {
                const contractReader = new ContractReader()
                const lockReader = new LockReader()
                const contract = await contractReader.read(path.join(projectRoot, 'mikk.json'))
                const lock = await lockReader.read(path.join(projectRoot, 'mikk.lock.json'))

                // Function stats
                const fns = Object.values(lock.functions)
                const totalFunctions = fns.length
                const exportedFunctions = fns.filter(f => f.isExported).length
                const asyncFunctions = fns.filter(f => f.isAsync).length
                const avgSize = totalFunctions > 0
                    ? Math.round(fns.reduce((sum, f) => sum + (f.endLine - f.startLine + 1), 0) / totalFunctions)
                    : 0

                // File stats
                const totalFiles = Object.keys(lock.files).length

                // Module stats
                const moduleStats = contract.declared.modules.map(mod => {
                    const modFns = fns.filter(f => f.moduleId === mod.id)
                    const modFiles = Object.values(lock.files).filter(f => f.moduleId === mod.id)
                    return {
                        id: mod.id,
                        name: mod.name,
                        functions: modFns.length,
                        files: modFiles.length,
                        exported: modFns.filter(f => f.isExported).length,
                    }
                })

                // Dead code
                const graph = buildGraphFromLock(lock)
                const detector = new DeadCodeDetector(graph, lock)
                const deadResult = detector.detect()
                const deadPct = totalFunctions > 0
                    ? Math.round((deadResult.deadCount / totalFunctions) * 1000) / 10
                    : 0

                // Constraint violations
                const checker = new BoundaryChecker(contract, lock)
                const boundaryResult = checker.check()

                // Route count
                const routeCount = lock.routes?.length ?? 0

                // Class count
                const classCount = lock.classes ? Object.keys(lock.classes).length : 0

                // Generic count
                const genericCount = lock.generics ? Object.keys(lock.generics).length : 0

                const stats = {
                    project: contract.project.name,
                    version: lock.version,
                    generatedAt: lock.generatedAt,
                    summary: {
                        totalFunctions,
                        exportedFunctions,
                        asyncFunctions,
                        totalFiles,
                        totalModules: moduleStats.length,
                        totalClasses: classCount,
                        totalGenerics: genericCount,
                        totalRoutes: routeCount,
                        avgFunctionSize: `${avgSize} lines`,
                    },
                    health: {
                        deadCode: `${deadPct}%`,
                        deadCodeCount: deadResult.deadCount,
                        constraintViolations: boundaryResult.violations.length,
                        constraintsPass: boundaryResult.pass,
                    },
                    modules: moduleStats,
                }

                if (isJson) {
                    console.log(JSON.stringify(stats, null, 2))
                } else {
                    console.log()
                    console.log(chalk.bold(`  mikk stats — ${stats.project}`))
                    console.log(chalk.dim(`  Lock v${stats.version} generated at ${stats.generatedAt}`))
                    console.log()

                    // Summary table
                    console.log(chalk.bold('  Overview'))
                    console.log(`    Functions:  ${chalk.cyan(totalFunctions.toString())} (${exportedFunctions} exported, ${asyncFunctions} async)`)
                    console.log(`    Files:      ${chalk.cyan(totalFiles.toString())}`)
                    console.log(`    Modules:    ${chalk.cyan(moduleStats.length.toString())}`)
                    console.log(`    Classes:    ${chalk.cyan(classCount.toString())}`)
                    console.log(`    Generics:   ${chalk.cyan(genericCount.toString())}`)
                    console.log(`    Routes:     ${chalk.cyan(routeCount.toString())}`)
                    console.log(`    Avg size:   ${chalk.cyan(avgSize + ' lines')} per function`)
                    console.log()

                    // Health
                    console.log(chalk.bold('  Health'))
                    const deadColor = deadPct > 30 ? chalk.red : deadPct > 15 ? chalk.yellow : chalk.green
                    console.log(`    Dead code:  ${deadColor(deadPct + '%')} (${deadResult.deadCount} functions)`)
                    const violationColor = boundaryResult.violations.length > 0 ? chalk.red : chalk.green
                    console.log(`    Violations: ${violationColor(boundaryResult.violations.length.toString())}`)
                    console.log()

                    // Module breakdown
                    if (moduleStats.length > 0) {
                        console.log(chalk.bold('  Modules'))
                        for (const mod of moduleStats) {
                            console.log(`    ${chalk.cyan(mod.id)} — ${mod.functions} fns, ${mod.files} files (${mod.exported} exported)`)
                        }
                        console.log()
                    }
                }
            } catch (err: any) {
                if (isJson) {
                    console.log(JSON.stringify({ error: err.message }, null, 2))
                } else {
                    console.error(chalk.red(`  ✗ ${err.message}`))
                    if (process.env.MIKK_DEBUG) console.error(err.stack)
                }
                process.exit(1)
            }
        })
}

/** Build graph from lock */
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
