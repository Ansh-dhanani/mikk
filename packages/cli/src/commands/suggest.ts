import * as path from 'node:path'
import type { Command } from 'commander'
import chalk from 'chalk'
import {
    ContractReader,
    LockReader,
    BoundaryChecker,
    DeadCodeDetector,
    type MikkLock,
    type MikkContract,
} from '@getmikk/core'
import { panel, sq, gap } from '../ui.js'
import { buildGraphFromLock } from '../utils.js'

export function registerSuggestCommand(program: Command) {
    program
        .command('suggest')
        .description('Show practical next steps based on current project state')
        .option('-p, --path <path>', 'Project path (defaults to current directory)')
        .addHelpText('after',
          `\nExamples:\n` +
          `  mikk suggest                        See what to do next\n` +
          `  mikk suggest --path ./my-project    Check a specific project\n` +
          `\nThis analyzes your project state and suggests relevant next steps,\n` +
          `such as refreshing stale locks, fixing boundary violations, or\n` +
          `reviewing dead code candidates.\n`)
        .action(async (opts: { path?: string }) => {
            try {
            const projectRoot = opts.path || process.cwd()
            const suggestions: string[] = []

            let contract: MikkContract | null = null
            let lock: MikkLock | null = null

            try {
                contract = await new ContractReader().read(path.join(projectRoot, 'mikk.json'))
            } catch {
                suggestions.push(`${sq.fail}  ${chalk.white('Initialize architecture context')}`)
                suggestions.push(chalk.dim('    mikk init'))
            }

            try {
                lock = await new LockReader().read(path.join(projectRoot, 'mikk.lock.json'))
            } catch {
                if (contract) {
                    suggestions.push(`${sq.warn}  ${chalk.white('Generate lock and derived artifacts')}`)
                    suggestions.push(chalk.dim('    mikk analyze'))
                }
            }

            if (lock && contract) {
                const lockStatus = lock.syncState?.status ?? 'unknown'
                if (lockStatus !== 'clean') {
                    suggestions.push(`${sq.warn}  ${chalk.white('Refresh stale lock before coding')}`)
                    suggestions.push(chalk.dim('    mikk analyze'))
                }

                const boundary = new BoundaryChecker(contract, lock).check()
                if (boundary.violations.length > 0) {
                    suggestions.push(`${sq.fail}  ${chalk.white('Fix boundary violations before merge')}`)
                    suggestions.push(chalk.dim('    mikk ci --strict'))
                    suggestions.push(chalk.dim('    mikk contract validate --boundaries-only --strict'))
                }

                const graph = buildGraphFromLock(lock)
                const dead = new DeadCodeDetector(graph, lock).detect()
                const deadPct = dead.totalFunctions > 0 ? (dead.deadCount / dead.totalFunctions) * 100 : 0
                if (dead.deadCount > 0) {
                    suggestions.push(`${sq.warn}  ${chalk.white(`Review dead code candidates (${Math.round(deadPct)}%)`)}`)
                    suggestions.push(chalk.dim('    mikk dead-code'))
                }

                suggestions.push(`${sq.info}  ${chalk.white('Before a refactor, run an impact preflight')}`)
                suggestions.push(chalk.dim('    mikk intent "Rename auth flow and update call sites"'))

                suggestions.push(`${sq.info}  ${chalk.white('When an AI agent asks for context, use graph-traced query')}`)
                suggestions.push(chalk.dim('    mikk context for "Add rate limiting to auth endpoints"'))
            }

            if (suggestions.length === 0) {
                suggestions.push(`${sq.pass}  ${chalk.white('No immediate actions. Keep using:')}`)
                suggestions.push(chalk.dim('    mikk analyze   # refresh after code changes'))
                suggestions.push(chalk.dim('    mikk ci        # gate architecture before merge'))
            }

            panel('mikk suggest — Practical Next Steps', suggestions)
            gap()
            } catch (err) {
                console.error(chalk.red('Suggest failed:'), err instanceof Error ? err.message : err)
                process.exit(1)
            }
        })
}
