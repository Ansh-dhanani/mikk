import * as path from 'node:path'
import type { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { ContractReader, LockReader } from '@ansh_dhanani/core'

export function registerIntentCommand(program: Command) {
    program
        .command('intent <prompt>')
        .description('Full preflight — interpret, suggest, confirm')
        .option('--no-confirm', 'Skip confirmation, just show suggestions')
        .option('--json', 'Output raw JSON result')
        .action(async (prompt: string, options) => {
            const projectRoot = process.cwd()
            const spinner = ora('Running preflight pipeline...').start()

            try {
                // Load contract & lock
                const contractReader = new ContractReader()
                const contract = await contractReader.read(path.join(projectRoot, 'mikk.json'))
                const lockReader = new LockReader()
                const lock = await lockReader.read(path.join(projectRoot, 'mikk.lock.json'))

                // Run pipeline
                const { PreflightPipeline } = await import('@ansh_dhanani/intent-engine')
                const pipeline = new PreflightPipeline(contract, lock)
                const result = await pipeline.run(prompt)
                spinner.stop()

                // JSON mode — dump and exit
                if (options.json) {
                    console.log(JSON.stringify(result, null, 2))
                    return
                }

                // ── Pretty output ────────────────────────────────
                console.log(chalk.bold('\n🧠 Mikk Intent Engine\n'))
                console.log(chalk.dim(`  Prompt: "${prompt}"\n`))

                // Intents
                console.log(chalk.bold.cyan('  Detected Intents:'))
                for (const intent of result.intents) {
                    const conf = (intent.confidence * 100).toFixed(0)
                    const icon = intent.confidence >= 0.7 ? chalk.green('●') : chalk.yellow('●')
                    console.log(`    ${icon} ${chalk.bold(intent.action)} ${intent.target.type} ${chalk.white(intent.target.name)} ${chalk.dim(`(${conf}% confidence)`)}`)
                    if (intent.target.moduleId) {
                        console.log(`      ${chalk.dim(`module: ${intent.target.moduleId}`)}`)
                    }
                    if (intent.target.filePath) {
                        console.log(`      ${chalk.dim(`file: ${intent.target.filePath}`)}`)
                    }
                }
                console.log()

                // Conflicts
                if (result.conflicts.hasConflicts) {
                    console.log(chalk.bold.red('  ⚠ Conflicts:'))
                    for (const conflict of result.conflicts.conflicts) {
                        const icon = conflict.severity === 'error' ? chalk.red('✗') : chalk.yellow('!')
                        console.log(`    ${icon} [${conflict.type}] ${conflict.message}`)
                        if (conflict.suggestedFix) {
                            console.log(`      ${chalk.dim(`Fix: ${conflict.suggestedFix}`)}`)
                        }
                    }
                    console.log()
                } else {
                    console.log(chalk.green('  ✓ No conflicts detected\n'))
                }

                // Suggestions
                console.log(chalk.bold.cyan('  Suggestions:'))
                for (const suggestion of result.suggestions) {
                    console.log(`    ${chalk.bold(suggestion.intent.action)} → ${suggestion.implementation}`)
                    if (suggestion.affectedFiles.length > 0) {
                        console.log(`      ${chalk.dim('Affected files:')} ${suggestion.affectedFiles.join(', ')}`)
                    }
                    if (suggestion.newFiles.length > 0) {
                        console.log(`      ${chalk.dim('New files:')} ${suggestion.newFiles.join(', ')}`)
                    }
                    console.log(`      ${chalk.dim(`Impact: ${suggestion.estimatedImpact} file(s)`)}`)
                }
                console.log()

                // Summary line
                const status = result.approved
                    ? chalk.green('✓ Approved — no conflicts')
                    : chalk.red('✗ Blocked — resolve conflicts first')
                console.log(`  ${status}`)
                console.log()

            } catch (err: any) {
                spinner.fail('Preflight failed')
                console.error(chalk.red(err.message))
                process.exit(1)
            }
        })
}
