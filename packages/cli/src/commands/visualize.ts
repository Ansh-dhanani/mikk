import type { Command } from 'commander'
import chalk from 'chalk'
import * as path from 'node:path'
import ora from 'ora'
import { ContractReader, LockReader } from '@getmikk/core'
import type { MikkContract, MikkLock } from '@getmikk/core'

/**
 * Load contract + lock + diagram orchestrator.
 * Throws on failure — callers must catch.
 */
async function loadProjectContext(projectRoot: string) {
    const contractReader = new ContractReader()
    const lockReader = new LockReader()
    const contract = await contractReader.read(path.join(projectRoot, 'mikk.json'))
    const lock = await lockReader.read(path.join(projectRoot, 'mikk.lock.json'))
    const { DiagramOrchestrator } = await import('@getmikk/diagram-generator')
    const orchestrator = new DiagramOrchestrator(contract, lock, projectRoot)
    return { orchestrator, contract, lock }
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
                const { orchestrator } = await loadProjectContext(process.cwd())
                const { generated } = await orchestrator.generateAll()
                spinner.succeed(`Generated ${generated.length} diagrams in .mikk/diagrams/`)
            } catch (err: any) {
                spinner.fail('Failed to generate diagrams')
                console.error(chalk.red(err.message))
                process.exit(1)
            }
        })

    visualize
        .command('module <id>')
        .description('Regenerate specific module diagram')
        .action(async (id: string) => {
            const spinner = ora(`Generating diagram for module: ${id}`).start()
            try {
                const { contract, lock } = await loadProjectContext(process.cwd())

                // Validate module ID exists
                const validIds = contract.declared.modules.map((m: any) => m.id)
                if (!validIds.includes(id)) {
                    spinner.fail(`Module "${id}" not found`)
                    console.error(chalk.yellow(
                        `  Available modules: ${validIds.join(', ')}`
                    ))
                    process.exit(1)
                }

                const { ModuleDiagramGenerator } = await import('@getmikk/diagram-generator')
                const moduleGen = new ModuleDiagramGenerator(contract, lock)
                const content = moduleGen.generate(id)
                const fs = await import('node:fs/promises')
                const projectRoot = process.cwd()
                const fullPath = path.join(projectRoot, '.mikk', 'diagrams', 'modules', `${id}.mmd`)
                await fs.mkdir(path.dirname(fullPath), { recursive: true })
                await fs.writeFile(fullPath, content, 'utf-8')

                spinner.succeed(`Generated diagram at .mikk/diagrams/modules/${id}.mmd`)
            } catch (err: any) {
                spinner.fail('Failed to generate diagram')
                console.error(chalk.red(err.message))
                process.exit(1)
            }
        })

    // Impact visualization is performed via `mikk context impact <file>`.
    // No separate stub command needed — keeping the subcommand tree clean.
}
