import * as path from 'node:path'
import type { Command } from 'commander'
import chalk from 'chalk'
import {
    ContractReader, LockReader, BoundaryChecker, DeadCodeDetector,
    type MikkLock, type DependencyGraph, type GraphNode, type GraphEdge,
} from '@getmikk/core'
import { panel, kv, infoBar, healthBar, gap, tw } from '../ui.js'

export function registerStatsCommand(program: Command) {
    program
        .command('stats [path]')
        .description('Show codebase health statistics (functions, modules, dead code, violations)')
        .option('--format <fmt>', 'Output format: text or json', 'text')
        .addHelpText('after',
          `\nExamples:\n` +
          `  mikk stats              Show formatted statistics\n` +
          `  mikk stats --format json   Machine-readable output\n` +
          `  mikk stats ./path/to/project   Show stats for a specific project\n`)
        .action(async (projectPath, options) => {
            const projectRoot = projectPath || process.cwd()
            const isJson = options.format === 'json'

            try {
                const contractReader = new ContractReader()
                const lockReader = new LockReader()
                const contract = await contractReader.read(path.join(projectRoot, 'mikk.json'))
                const lock = await lockReader.read(path.join(projectRoot, 'mikk.lock.json'))

                const fns = Object.values(lock.functions)
                const totalFunctions = fns.length
                const exportedFunctions = fns.filter(f => f.isExported).length
                const asyncFunctions = fns.filter(f => f.isAsync).length
                const avgSize = totalFunctions > 0
                    ? Math.round(fns.reduce((s, f) => s + (f.endLine - f.startLine + 1), 0) / totalFunctions)
                    : 0

                const totalFiles = Object.keys(lock.files).length
                const classCount = lock.classes ? Object.keys(lock.classes).length : 0
                const genericCount = lock.generics ? Object.keys(lock.generics).length : 0
                const routeCount = lock.routes?.length ?? 0

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
                }).sort((a, b) => b.functions - a.functions)

                const graph = buildGraphFromLock(lock)
                const detector = new DeadCodeDetector(graph, lock)
                const deadResult = detector.detect()
                const deadPct = totalFunctions > 0
                    ? Math.round((deadResult.deadCount / totalFunctions) * 1000) / 10 : 0

                const checker = new BoundaryChecker(contract, lock)
                const boundaryResult = checker.check()

                if (isJson) {
                    console.log(JSON.stringify({
                        project: contract.project.name,
                        version: lock.version,
                        generatedAt: lock.generatedAt,
                        summary: { totalFunctions, exportedFunctions, asyncFunctions, totalFiles, totalModules: moduleStats.length, totalClasses: classCount, totalGenerics: genericCount, totalRoutes: routeCount, avgFunctionSize: avgSize },
                        health: { deadCode: deadPct, deadCodeCount: deadResult.deadCount, constraintViolations: boundaryResult.violations.length, constraintsPass: boundaryResult.pass },
                        modules: moduleStats,
                    }, null, 2))
                    return
                }

                const W = tw()
                const date = new Date(lock.generatedAt).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })

                // ── Project panel ─────────────────────────────────────────────
                panel('Project', [
                    kv('name', chalk.cyan(contract.project.name)),
                    kv('lock', chalk.dim(`v${lock.version}  ·  ${date}`)),
                    kv('language', chalk.dim(contract.project.language)),
                ], W)

                // ── Codebase panel ────────────────────────────────────────────
                const fnsLine = chalk.cyan(String(totalFunctions)) + chalk.dim(` functions   `) +
                    chalk.cyan(String(exportedFunctions)) + chalk.dim(` exported   `) +
                    chalk.cyan(String(asyncFunctions)) + chalk.dim(` async   `) +
                    chalk.cyan(avgSize + ' lines') + chalk.dim(` avg`)
                const filesLine = chalk.cyan(String(totalFiles)) + chalk.dim(` files   `) +
                    chalk.cyan(String(moduleStats.length)) + chalk.dim(` modules   `) +
                    chalk.cyan(String(classCount)) + chalk.dim(` classes   `) +
                    chalk.cyan(String(routeCount)) + chalk.dim(` routes`)

                panel('Codebase', [fnsLine, filesLine], W)

                // ── Health panel ──────────────────────────────────────────────
                const deadBar = healthBar(deadResult.deadCount, totalFunctions, 16)
                const deadColour = deadPct > 30 ? chalk.red : deadPct > 15 ? chalk.yellow : chalk.green
                const deadRow = kv('dead code', deadBar + '  ' + deadColour(`${deadPct}%`) + chalk.dim(`  ·  ${deadResult.deadCount} functions`))

                const violRow = boundaryResult.violations.length === 0
                    ? kv('violations', chalk.green('none') + chalk.dim('  ·  all boundaries respected'))
                    : kv('violations', chalk.red(String(boundaryResult.violations.length)) + chalk.dim('  boundary errors'))

                panel('Health', [deadRow, violRow], W)

                // ── Modules panel ─────────────────────────────────────────────
                if (moduleStats.length > 0) {
                    const maxFns = Math.max(...moduleStats.map(m => m.functions), 1)
                    const ID_W = Math.min(28, Math.max(...moduleStats.map(m => m.id.length)) + 2)
                    const BAR_W = 12

                    const rows: string[] = moduleStats.map(m => {
                        const idStr = chalk.cyan(m.id.padEnd(ID_W))
                        const b = infoBar(m.functions, maxFns, BAR_W)
                        const fnsStr = chalk.dim(`${String(m.functions).padStart(4)} fns`)
                        const filesStr = chalk.dim(`${String(m.files).padStart(4)} files`)
                        const expStr = chalk.dim(`${String(m.exported).padStart(4)} exp`)
                        return `${idStr}  ${b}  ${fnsStr}  ${filesStr}  ${expStr}`
                    })
                    panel('Modules', rows, W)
                }

                gap()
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                if (isJson) console.log(JSON.stringify({ error: message }, null, 2))
                else process.stderr.write(chalk.red(`\n  error  ${message}\n\n`))
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