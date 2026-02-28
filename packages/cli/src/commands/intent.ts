import type { Command } from 'commander'
import chalk from 'chalk'

export function registerIntentCommand(program: Command) {
    program
        .command('intent <prompt>')
        .description('Full preflight — interpret, suggest, confirm')
        .option('--no-confirm', 'Skip confirmation, just show suggestions')
        .action(async (prompt: string, options) => {
            console.log(chalk.bold('\n🧠 Mikk Intent Engine\n'))
            console.log(chalk.dim(`  Prompt: "${prompt}"\n`))

            // Phase 2 placeholder — intent engine interprets the prompt
            // For now, show a helpful message
            console.log(chalk.yellow('  Intent engine is available in Phase 2.'))
            console.log(chalk.dim('  The intent engine requires @mikk/intent-engine and an AI provider.'))
            console.log(chalk.dim('  Run "mikk context for <task>" for architecture context.'))
        })
}
