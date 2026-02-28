import type { Command } from 'commander'
import chalk from 'chalk'

export function registerVisualizeCommands(program: Command) {
    const visualize = program
        .command('visualize')
        .description('Generate Mermaid diagrams')

    visualize
        .command('all')
        .description('Regenerate all diagrams')
        .action(async () => {
            console.log(chalk.bold('\n📊 Generating all diagrams...\n'))
            console.log(chalk.dim('  Diagram generation available via @mikk/diagram-generator package.'))
            console.log(chalk.dim('  Run "mikk init" or "mikk analyze" to auto-generate diagrams.'))
        })

    visualize
        .command('module <id>')
        .description('Regenerate specific module diagram')
        .action(async (id: string) => {
            console.log(chalk.dim(`  Generating diagram for module: ${id}`))
        })

    visualize
        .command('impact')
        .description('Generate impact diagram for current changes')
        .action(async () => {
            console.log(chalk.dim('  Impact diagram generation requires changed file analysis.'))
        })
}
