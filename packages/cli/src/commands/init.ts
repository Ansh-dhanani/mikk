import * as path from 'node:path'
import type { Command } from 'commander'
import ora from 'ora'
import chalk from 'chalk'
import {
    discoverFiles, parseFiles, readFileContent,
    GraphBuilder, ClusterDetector, ContractGenerator,
    LockCompiler, ContractWriter, LockReader,
    setupMikkDirectory,
    type MikkContract
} from '@ansh_dhanani/core'

export function registerInitCommand(program: Command) {
    program
        .command('init')
        .description('Initialize Mikk in this project')
        .option('--yes', 'Skip interactive prompts, use smart defaults')
        .option('--ai', 'Use AI interview to generate mikk.json (Phase 2)')
        .action(async (options) => {
            const spinner = ora('Scanning project...').start()
            const projectRoot = process.cwd()

            try {
                // 1. Discover all source files
                const files = await discoverFiles(projectRoot)
                spinner.text = `Found ${files.length} files. Parsing...`

                // 2. Parse all files
                const parsedFiles = await parseFiles(files, projectRoot, (fp) =>
                    readFileContent(fp)
                )
                spinner.text = 'Building dependency graph...'

                // 3. Build graph
                const builder = new GraphBuilder()
                const graph = builder.build(parsedFiles)

                // 4. Detect natural module clusters
                const detector = new ClusterDetector(graph)
                const clusters = detector.detect()
                spinner.succeed(`Analysis complete: ${files.length} files, ${graph.nodes.size} nodes`)

                // 5. Generate mikk.json
                const projectName = path.basename(projectRoot)
                const generator = new ContractGenerator()
                const contract = generator.generateFromClusters(clusters, parsedFiles, projectName)

                // 6. Show detected modules
                console.log(chalk.bold('\n📋 Detected modules:'))
                for (const cluster of clusters) {
                    const icon = cluster.confidence > 0.7 ? chalk.green('✓') : chalk.yellow('~')
                    const conf = cluster.confidence.toFixed(2)
                    console.log(`   ${icon} ${chalk.bold(cluster.suggestedName.padEnd(20))} (${cluster.files.length} files, confidence: ${conf})`)
                }

                // 7. Compile lock file
                const compiler = new LockCompiler()
                const lock = compiler.compile(graph, contract, parsedFiles)
                const functionCount = Object.keys(lock.functions).length

                // 8. Write everything to disk
                await setupMikkDirectory(projectRoot)
                const contractWriter = new ContractWriter()
                await contractWriter.writeNew(contract, path.join(projectRoot, 'mikk.json'))
                const lockReader = new LockReader()
                await lockReader.write(lock, path.join(projectRoot, 'mikk.lock.json'))

                spinner.text = 'Generating Mermaid diagrams...'
                const { DiagramOrchestrator } = await import('@ansh_dhanani/diagram-generator')
                const orchestrator = new DiagramOrchestrator(contract, lock, projectRoot)
                const { generated } = await orchestrator.generateAll()

                // 9. Generate claude.md / AGENTS.md
                spinner.text = 'Generating AI context files...'
                const { ClaudeMdGenerator } = await import('@ansh_dhanani/ai-context')
                const mdGenerator = new ClaudeMdGenerator(contract, lock)
                const claudeMd = mdGenerator.generate()
                const fs = await import('node:fs/promises')
                await fs.writeFile(path.join(projectRoot, 'claude.md'), claudeMd, 'utf-8')
                await fs.writeFile(path.join(projectRoot, 'AGENTS.md'), claudeMd, 'utf-8')

                console.log(chalk.green('\n✓ Mikk initialized successfully'))
                console.log(`  ${chalk.dim('mikk.json')}          — edit this to refine your architecture`)
                console.log(`  ${chalk.dim('mikk.lock.json')}     — auto-generated, commit this`)
                console.log(`  ${chalk.dim('.mikk/diagrams/')}    — Mermaid diagrams of your codebase`)
                console.log(`  ${chalk.dim('claude.md')}          — AI context derived from lock file`)
                console.log(`  ${chalk.dim('AGENTS.md')}          — same, for Codex/Copilot agents`)
                console.log(`\n  ${chalk.dim('Stats:')} ${files.length} files, ${functionCount} functions, ${clusters.length} modules`)
                console.log(`\n  ${chalk.dim('Next:')} Review mikk.json and refine module descriptions`)
                console.log(`  ${chalk.dim('Run:')}  mikk contract validate to check for drift`)

            } catch (err: any) {
                spinner.fail('Initialization failed')
                console.error(chalk.red(err.message))
                process.exit(1)
            }
        })
}
