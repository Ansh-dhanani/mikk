import * as path from 'node:path'
import type { Command } from 'commander'
import ora from 'ora'
import chalk from 'chalk'
import {
    discoverFiles, parseFiles, readFileContent,
    GraphBuilder, LockCompiler, ContractReader, LockReader,
} from '@ansh_dhanani/core'

export function registerAnalyzeCommand(program: Command) {
    program
        .command('analyze')
        .description('Re-analyze codebase and update lock file')
        .option('--incremental', 'Only analyze changed files')
        .action(async (options) => {
            const spinner = ora('Analyzing project...').start()
            const projectRoot = process.cwd()

            try {
                const contractReader = new ContractReader()
                const contract = await contractReader.read(path.join(projectRoot, 'mikk.json'))

                const files = await discoverFiles(projectRoot)
                spinner.text = `Parsing ${files.length} files...`

                const parsedFiles = await parseFiles(files, projectRoot, (fp) =>
                    readFileContent(fp)
                )

                spinner.text = 'Building dependency graph...'
                const graph = new GraphBuilder().build(parsedFiles)

                spinner.text = 'Compiling lock file...'
                const lock = new LockCompiler().compile(graph, contract, parsedFiles)

                const lockReader = new LockReader()
                await lockReader.write(lock, path.join(projectRoot, 'mikk.lock.json'))

                spinner.text = 'Generating Mermaid diagrams...'
                const { DiagramOrchestrator } = await import('@ansh_dhanani/diagram-generator')
                const orchestrator = new DiagramOrchestrator(contract, lock, projectRoot)
                await orchestrator.generateAll()

                // Generate claude.md / AGENTS.md
                spinner.text = 'Generating AI context files...'
                const { ClaudeMdGenerator } = await import('@ansh_dhanani/ai-context')
                const mdGenerator = new ClaudeMdGenerator(contract, lock)
                const claudeMd = mdGenerator.generate()
                const fs = await import('node:fs/promises')
                await fs.writeFile(path.join(projectRoot, 'claude.md'), claudeMd, 'utf-8')
                await fs.writeFile(path.join(projectRoot, 'AGENTS.md'), claudeMd, 'utf-8')

                const functionCount = Object.keys(lock.functions).length
                spinner.succeed(`Analyzed ${files.length} files, ${functionCount} functions`)
            } catch (err: any) {
                spinner.fail('Analysis failed')
                console.error(chalk.red(err.message))
                process.exit(1)
            }
        })
}
