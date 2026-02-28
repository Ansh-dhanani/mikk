import * as path from 'node:path'
import type { Command } from 'commander'
import chalk from 'chalk'
import { ContractReader, LockReader, ImpactAnalyzer, GraphBuilder, parseFiles, readFileContent, discoverFiles } from '@mikk/core'

export function registerContextCommands(program: Command) {
    const context = program
        .command('context')
        .description('AI context commands')

    // mikk context query "..."
    context
        .command('query <question>')
        .description('Ask an architecture question')
        .action(async (question: string) => {
            const projectRoot = process.cwd()

            try {
                const lockReader = new LockReader()
                const lock = await lockReader.read(path.join(projectRoot, 'mikk.lock.json'))
                const contractReader = new ContractReader()
                const contract = await contractReader.read(path.join(projectRoot, 'mikk.json'))

                // Build a simple response based on contract data
                const questionLower = question.toLowerCase()
                const matchedModules = contract.declared.modules.filter(m =>
                    questionLower.includes(m.id) || questionLower.includes(m.name.toLowerCase())
                )

                if (matchedModules.length > 0) {
                    for (const mod of matchedModules) {
                        console.log(chalk.bold(`\n📦 Module: ${mod.name} (${mod.id})`))
                        console.log(`   ${chalk.dim('Description:')} ${mod.description}`)
                        if (mod.intent) console.log(`   ${chalk.dim('Intent:')} ${mod.intent}`)
                        console.log(`   ${chalk.dim('Paths:')} ${mod.paths.join(', ')}`)

                        const moduleFunctions = Object.values(lock.functions).filter(f => f.moduleId === mod.id)
                        if (moduleFunctions.length > 0) {
                            console.log(`   ${chalk.dim('Functions:')}`)
                            for (const fn of moduleFunctions) {
                                console.log(`     - ${fn.name} (${fn.file}:${fn.startLine})`)
                            }
                        }
                    }
                } else {
                    // Show general project overview
                    console.log(chalk.bold('\n📊 Project Overview'))
                    console.log(`   ${chalk.dim('Modules:')} ${contract.declared.modules.map(m => m.name).join(', ')}`)
                    console.log(`   ${chalk.dim('Functions:')} ${Object.keys(lock.functions).length}`)
                    console.log(`   ${chalk.dim('Files:')} ${Object.keys(lock.files).length}`)

                    if (contract.declared.constraints.length > 0) {
                        console.log(`\n${chalk.bold('⚠️  Constraints:')}`)
                        for (const c of contract.declared.constraints) {
                            console.log(`   • ${c}`)
                        }
                    }
                }
            } catch (err: any) {
                console.error(chalk.red(err.message))
                process.exit(1)
            }
        })

    // mikk context impact <file>
    context
        .command('impact <file>')
        .description('What breaks if this file changes?')
        .action(async (file: string) => {
            const projectRoot = process.cwd()

            try {
                const files = await discoverFiles(projectRoot)
                const parsedFiles = await parseFiles(files, projectRoot, (fp) => readFileContent(fp))
                const graph = new GraphBuilder().build(parsedFiles)
                const analyzer = new ImpactAnalyzer(graph)

                // Find nodes in the specified file
                const fileNodes = [...graph.nodes.values()].filter(n => n.file.includes(file))
                if (fileNodes.length === 0) {
                    console.log(chalk.yellow(`No nodes found in file matching "${file}"`))
                    return
                }

                const result = analyzer.analyze(fileNodes.map(n => n.id))

                console.log(chalk.bold(`\n💥 Impact Analysis for ${file}\n`))
                console.log(`   ${chalk.dim('Changed nodes:')} ${result.changed.length}`)
                console.log(`   ${chalk.dim('Impacted nodes:')} ${result.impacted.length}`)
                console.log(`   ${chalk.dim('Impact depth:')} ${result.depth}`)
                console.log(`   ${chalk.dim('Confidence:')} ${result.confidence}`)

                if (result.impacted.length > 0) {
                    console.log(`\n   ${chalk.bold('Impacted:')}`)
                    for (const id of result.impacted.slice(0, 20)) {
                        const node = graph.nodes.get(id)
                        console.log(`     ${chalk.yellow('→')} ${node?.label || id} ${chalk.dim(`(${node?.file || ''})`)}`)
                    }
                    if (result.impacted.length > 20) {
                        console.log(chalk.dim(`     ... and ${result.impacted.length - 20} more`))
                    }
                }
            } catch (err: any) {
                console.error(chalk.red(err.message))
                process.exit(1)
            }
        })

    // mikk context for "task"
    context
        .command('for <task>')
        .description('Get context for a specific task')
        .action(async (task: string) => {
            const projectRoot = process.cwd()

            try {
                const contractReader = new ContractReader()
                const contract = await contractReader.read(path.join(projectRoot, 'mikk.json'))
                const lockReader = new LockReader()
                const lock = await lockReader.read(path.join(projectRoot, 'mikk.lock.json'))

                console.log(chalk.bold('ARCHITECTURAL CONTEXT FOR THIS TASK:'))
                console.log(`\nProject: ${contract.project.name} (${contract.project.language})`)

                for (const mod of contract.declared.modules) {
                    console.log(`\n${chalk.bold('Module:')} ${mod.name} (${mod.id})`)
                    console.log(`  ${mod.description}`)
                    if (mod.intent) console.log(`  Intent: ${mod.intent}`)
                }

                if (contract.declared.constraints.length > 0) {
                    console.log(chalk.bold('\nConstraints:'))
                    for (const c of contract.declared.constraints) {
                        console.log(`  • ${c}`)
                    }
                }
            } catch (err: any) {
                console.error(chalk.red(err.message))
                process.exit(1)
            }
        })
}
