import * as path from 'node:path'
import type { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { ContractReader, LockReader } from '@getmikk/core'

export function registerIntentCommand(program: Command) {
    program
        .command('intent <prompt>')
        .description('Full preflight check — interpret intent, suggest changes, detect conflicts')
        .option('--json', 'Output raw JSON result')
        .addHelpText('after',
          `\nExamples:\n` +
          `  mikk intent "Rename auth to authentication module"\n` +
          `  mikk intent "Add rate limiting to payments" --json\n` +
          `\nThis runs a preflight check before making architectural changes.\n` +
          `It analyzes impact, detects conflicts, and suggests implementation steps.\n`)
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
                const { PreflightPipeline } = await import('@getmikk/intent-engine')
                const pipeline = new PreflightPipeline(contract, lock)
                const result = await pipeline.run(prompt)
                spinner.succeed('Preflight complete')

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

                // 🧠 Decision & Explanation (New in Milestone 3)
                const d = result.decision
                const statusColor = d.status === 'BLOCKED' ? chalk.red : d.status === 'WARNING' ? chalk.yellow : chalk.green
                const statusIcon = d.status === 'BLOCKED' ? '🚫' : d.status === 'WARNING' ? '⚠️' : '✅'

                console.log(chalk.bold.magenta('  🧠 Mikk Decision:'), statusColor.bold(`${statusIcon} ${d.status}`))
                
                if (d.reasons.length > 0) {
                    for (const reason of d.reasons) {
                        console.log(`    ${chalk.dim('•')} ${reason}`)
                    }
                }

                console.log(`\n  ${chalk.bold('📜 Explanation:')} ${chalk.italic(result.explanation.summary)}`)
                for (const detail of result.explanation.details) {
                    console.log(`    ${chalk.dim('→')} ${detail}`)
                }

                if (result.explanation.riskBreakdown.length > 0) {
                    console.log(`\n    ${chalk.dim('Top Risks:')}`)
                    for (const rb of result.explanation.riskBreakdown) {
                        console.log(`      ${chalk.bold(rb.symbol.padEnd(20))} ${chalk.red(rb.score + '%')} ${chalk.dim(rb.reason)}`)
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
                const finalStatus = result.approved
                    ? chalk.green.bold('✓ PROCEEDED')
                    : d.status === 'BLOCKED' ? chalk.red.bold('✗ BLOCKED BY POLICY') : chalk.yellow.bold('⚠ NUDGE REQUIRED')
                
                console.log(`  ${finalStatus}`)
                console.log()

            } catch (err: unknown) {
                spinner.fail('Preflight failed')
                const message = err instanceof Error ? err.message : String(err)
                console.error(chalk.red(message))
                process.exit(1)
            }
        })
}
