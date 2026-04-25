import * as path from 'node:path'
import type { Command } from 'commander'
import chalk from 'chalk'
import {
    ContractReader, LockReader, BoundaryChecker, DeadCodeDetector,
    type MikkLock,
} from '@getmikk/core'
import { panel, kv, infoBar, healthBar, gap, tw } from '../ui.js'
import { buildGraphFromLock } from '../utils.js'

export function registerStatsCommand(program: Command) {
    program
        .command('stats [path]')
        .description('Codebase health (functions, modules, dead code %)')
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
                const routeCount = lock.routes?.length ?? 0

                // ── Build file→module index from lock.modules (authoritative) ──────────────────────
                // lock.files[key].moduleId is unreliable (LockCompiler assigns functions
                // to path-matched contract modules, but scripts/watcher/etc. files fall
                // back to 'packages-core' or similar). lock.modules[id].files is the
                // authoritative mapping from ClusterDetector.
                const fileToModuleId = new Map<string, string>()
                for (const [modId, mod] of Object.entries(lock.modules)) {
                    for (const file of (mod as any).files ?? []) {
                        fileToModuleId.set(file, modId)
                    }
                }

                // Count functions per module using the file-based index
                const moduleStats = contract.declared.modules.map(mod => {
                    const lockMod = (lock.modules as any)[mod.id]
                    const modFileSet = new Set<string>((lockMod?.files ?? []) as string[])
                    const modFns = fns.filter(f => f.file && modFileSet.has(f.file))
                    return {
                        id: mod.id,
                        name: mod.name,
                        functions: modFns.length,
                        files: modFileSet.size,
                        exported: modFns.filter(f => f.isExported).length,
                    }
                }).sort((a, b) => b.functions - a.functions)

                // Total module count from lock (includes all sub-clusters)
                const totalModules = Object.keys(lock.modules).length

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
                        summary: { totalFunctions, exportedFunctions, asyncFunctions, totalFiles, totalModules, totalClasses: classCount, totalRoutes: routeCount, avgFunctionSize: avgSize },
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
                    chalk.cyan(String(totalModules)) + chalk.dim(` modules   `) +
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
