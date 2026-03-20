import * as path from 'node:path'
import { Command } from 'commander'
import chalk from 'chalk'
import { AdrManager } from '@getmikk/core'

export function registerAdrCommand(program: Command) {
    const adr = program
        .command('adr')
        .description('Manage Architectural Decision Records (ADRs)')

    const getManager = () => new AdrManager(path.join(process.cwd(), 'mikk.json'))

    // ── mikk adr list ────────────────────────────────────────────────────────
    adr
        .command('list')
        .description('List all architectural decisions')
        .action(async () => {
            try {
                const manager = getManager()
                const decisions = await manager.list()

                if (decisions.length === 0) {
                    console.log(chalk.dim('\n  No architectural decisions found.'))
                    console.log(chalk.dim('  Run `mikk adr add --id <id> --title <title> --reason <reason>` to create one.\n'))
                    return
                }

                console.log(chalk.bold('\nArchitectural Decision Records:\n'))
                for (const d of decisions) {
                    const dateStr = d.date ? chalk.dim(`[${d.date}] `) : ''
                    console.log(`  ${dateStr}${chalk.cyan(d.id.padEnd(20))} ${d.title}`)
                }
                console.log('')
            } catch (err: any) {
                console.error(chalk.red(`Failed to list ADRs: ${err.message}`))
                process.exit(1)
            }
        })

    // ── mikk adr get <id> ────────────────────────────────────────────────────
    adr
        .command('get <id>')
        .description('Get details for a specific architectural decision')
        .action(async (id: string) => {
            try {
                const manager = getManager()
                const decision = await manager.get(id)

                if (!decision) {
                    console.error(chalk.red(`\n  ADR "${id}" not found.\n`))
                    process.exit(1)
                }

                console.log(chalk.bold(`\nADR: ${decision.title}`))
                console.log(chalk.dim('─'.repeat(50)))
                console.log(`${chalk.cyan('ID:')}     ${decision.id}`)
                console.log(`${chalk.cyan('Date:')}   ${decision.date || 'Unknown'}`)
                console.log(chalk.dim('─'.repeat(50)))
                
                // Simple word-wrap for reason (assuming ~80 char terminal)
                const words = decision.reason.split(' ')
                let line = ''
                console.log(chalk.cyan('Reason:'))
                for (const word of words) {
                    if ((line + word).length > 70) {
                        console.log(`  ${line}`)
                        line = `${word} `
                    } else {
                        line += `${word} `
                    }
                }
                if (line) console.log(`  ${line}`)
                console.log('')

            } catch (err: any) {
                console.error(chalk.red(`Failed to get ADR: ${err.message}`))
                process.exit(1)
            }
        })

    // ── mikk adr add ─────────────────────────────────────────────────────────
    adr
        .command('add')
        .description('Add a new architectural decision')
        .requiredOption('-i, --id <id>', 'Unique identifier (e.g., "wasm-parsing")')
        .requiredOption('-t, --title <title>', 'Short, descriptive title')
        .requiredOption('-r, --reason <reason>', 'Detailed reason for the decision')
        .option('-d, --date <date>', 'Date (defaults to today yyyy-mm-dd)')
        .action(async (options) => {
            try {
                const manager = getManager()
                const date = options.date || new Date().toISOString().split('T')[0]
                
                await manager.add({
                    id: options.id,
                    title: options.title,
                    reason: options.reason,
                    date
                })

                console.log(chalk.green(`\n✓ Added ADR "${options.id}" successfully.\n`))
            } catch (err: any) {
                console.error(chalk.red(`\nFailed to add ADR: ${err.message}\n`))
                process.exit(1)
            }
        })

    // ── mikk adr rm <id> ─────────────────────────────────────────────────────
    adr
        .command('rm <id>')
        .description('Remove an architectural decision')
        .action(async (id: string) => {
            try {
                const manager = getManager()
                const removed = await manager.remove(id)

                if (removed) {
                    console.log(chalk.green(`\n✓ Removed ADR "${id}".\n`))
                } else {
                    console.error(chalk.red(`\n  ADR "${id}" not found.\n`))
                    process.exit(1)
                }
            } catch (err: any) {
                console.error(chalk.red(`Failed to remove ADR: ${err.message}`))
                process.exit(1)
            }
        })
}
