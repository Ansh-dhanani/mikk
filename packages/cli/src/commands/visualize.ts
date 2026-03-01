import type { Command } from 'commander'
import chalk from 'chalk'
import * as path from 'node:path'
import ora from 'ora'
import { ContractReader, LockReader } from '@getmikk/core'

async function getOrchestrator() {
    const projectRoot = process.cwd()
    const contractReader = new ContractReader()
    const lockReader = new LockReader()

    try {
        const contract = await contractReader.read(path.join(projectRoot, 'mikk.json'))
        const lock = await lockReader.read(path.join(projectRoot, 'mikk.lock.json'))
        const { DiagramOrchestrator } = await import('@getmikk/diagram-generator')
        return { orchestrator: new DiagramOrchestrator(contract, lock, projectRoot), projectRoot }
    } catch (e) {
        console.error(chalk.red('Error reading mikk.json or mikk.lock.json. Please run "mikk init" or "mikk analyze" first.'))
        process.exit(1)
    }
}

export function registerVisualizeCommands(program: Command) {
    const visualize = program
        .command('visualize')
        .description('Generate Mermaid diagrams')

    visualize
        .command('all')
        .description('Regenerate all diagrams')
        .action(async () => {
            console.log(chalk.bold('\n📊 Generating all diagrams...\n'))
            const spinner = ora('Generating Mermaid diagrams...').start()
            try {
                const { orchestrator } = await getOrchestrator()
                const { generated } = await orchestrator.generateAll()
                spinner.succeed(`Generated ${generated.length} diagrams in .mikk/diagrams/`)
            } catch (err: any) {
                spinner.fail('Failed to generate diagrams')
                console.error(chalk.red(err.message))
            }
        })

    visualize
        .command('module <id>')
        .description('Regenerate specific module diagram')
        .action(async (id: string) => {
            console.log(chalk.dim(`  Generating diagram for module: ${id}`))
            const spinner = ora('Generating Mermaid diagram...').start()
            try {
                const { orchestrator } = await getOrchestrator()
                // The orchestrator currently only has generateAll() and generateImpact().
                // However, generateAll() runs through modules.
                // Let's import the specific generator to do just one.
                const { ModuleDiagramGenerator } = await import('@getmikk/diagram-generator')
                const projectRoot = process.cwd()
                const contractReader = new ContractReader()
                const lockReader = new LockReader()
                const contract = await contractReader.read(path.join(projectRoot, 'mikk.json'))
                const lock = await lockReader.read(path.join(projectRoot, 'mikk.lock.json'))

                const moduleGen = new ModuleDiagramGenerator(contract, lock)
                const content = moduleGen.generate(id)
                const fs = await import('node:fs/promises')
                const fullPath = path.join(projectRoot, '.mikk', 'diagrams', 'modules', `${id}.mmd`)
                await fs.mkdir(path.dirname(fullPath), { recursive: true })
                await fs.writeFile(fullPath, content, 'utf-8')

                spinner.succeed(`Generated diagram at .mikk/diagrams/modules/${id}.mmd`)
            } catch (err: any) {
                spinner.fail('Failed to generate diagram')
                console.error(chalk.red(err.message))
            }
        })

    visualize
        .command('impact')
        .description('Generate impact diagram for current changes')
        .action(async () => {
            // Impact diagram generation requires knowing what changed.
            // Currently left as a stub or we can let orchestrator handle it if arguments are provided.
            console.log(chalk.dim('  Impact diagram generation requires changed file analysis (not fully implemented in CLI yet).'))
        })
}
