import * as path from 'node:path'
import type { Command } from 'commander'
import ora from 'ora'
import chalk from 'chalk'
import {
    discoverFiles, discoverContextFiles, parseFiles, readFileContent,
    GraphBuilder, ClusterDetector, ContractGenerator,
    LockCompiler, ContractWriter, LockReader,
    setupMikkDirectory, fileExists, generateMikkIgnore,
    detectProjectLanguage, getDiscoveryPatterns,
    type MikkContract
} from '@getmikk/core'

export function registerInitCommand(program: Command) {
    program
        .command('init')
        .description('Initialize Mikk in this project')
        .option('--force', 'Overwrite existing mikk.json and lock file')
        .action(async (options) => {
            const projectRoot = process.cwd()

            try {
                // Guard: warn if already initialized (unless --force)
                const contractPath = path.join(projectRoot, 'mikk.json')
                if (!options.force && await fileExists(contractPath)) {
                    console.error(chalk.yellow(
                        'This project is already initialized (mikk.json exists).\n' +
                        '  Use --force to overwrite, or run "mikk analyze" to update.'
                    ))
                    process.exit(1)
                }

                // 1. Discover all source files
                const spinner = ora('Scanning project...').start()
                const language = await detectProjectLanguage(projectRoot)

                // 1a. Set up .mikk directory and auto-generate .mikkignore
                await setupMikkDirectory(projectRoot)
                const createdIgnore = await generateMikkIgnore(projectRoot, language)
                if (createdIgnore) {
                    spinner.info(chalk.dim('Generated .mikkignore with smart defaults'))
                    spinner.start('Scanning project...')
                }

                const { patterns, ignore } = getDiscoveryPatterns(language)
                const files = await discoverFiles(projectRoot, patterns, ignore)

                // Guard: no files found
                if (files.length === 0) {
                    spinner.fail('No source files found')
                    console.error(chalk.yellow(
                        'No source files were discovered.\n' +
                        `  Detected language: ${language}\n` +
                        '  Make sure you are in the right project root directory.'
                    ))
                    process.exit(1)
                }

                spinner.text = `Found ${files.length} files (${language}). Parsing...`

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

                // 5. Read package.json for project metadata
                const fs = await import('node:fs/promises')
                let pkgJson: any = {}
                try {
                    const pkgRaw = await fs.readFile(path.join(projectRoot, 'package.json'), 'utf-8')
                    pkgJson = JSON.parse(pkgRaw)
                } catch { /* no package.json — fine */ }

                // 6. Generate mikk.json
                const projectName = pkgJson.name || path.basename(projectRoot)
                const generator = new ContractGenerator()
                const contract = generator.generateFromClusters(
                    clusters, parsedFiles, projectName, pkgJson.description
                )

                // 7. Show detected modules
                console.log(chalk.bold('\n📋 Detected modules:'))
                for (const cluster of clusters) {
                    const icon = cluster.confidence > 0.7 ? chalk.green('✓') : chalk.yellow('~')
                    const conf = cluster.confidence.toFixed(2)
                    console.log(`   ${icon} ${chalk.bold(cluster.suggestedName.padEnd(20))} (${cluster.files.length} files, confidence: ${conf})`)
                }

                // 7. Discover context/schema files
                const ctxSpinner = ora('Discovering schema & config files...').start()
                const contextFiles = await discoverContextFiles(projectRoot)
                ctxSpinner.stop()
                if (contextFiles.length > 0) {
                    console.log(chalk.bold(`\n📦 Discovered ${contextFiles.length} context file(s):`))
                    for (const cf of contextFiles) {
                        const sizeKb = (cf.size / 1024).toFixed(1)
                        console.log(`   ${chalk.cyan(cf.type.padEnd(10))} ${chalk.dim(cf.path)} (${sizeKb}KB)`)
                    }
                }

                // 8. Compile lock file
                const compiler = new LockCompiler()
                const lock = compiler.compile(graph, contract, parsedFiles, contextFiles)
                const functionCount = Object.keys(lock.functions).length

                // 9. Write everything to disk
                const contractWriter = new ContractWriter()
                await contractWriter.writeNew(contract, contractPath)
                const lockReader = new LockReader()
                await lockReader.write(lock, path.join(projectRoot, 'mikk.lock.json'))

                const diagSpinner = ora('Generating Mermaid diagrams...').start()
                try {
                    const { DiagramOrchestrator } = await import('@getmikk/diagram-generator')
                    const orchestrator = new DiagramOrchestrator(contract, lock, projectRoot)
                    await orchestrator.generateAll()
                    diagSpinner.succeed('Diagrams generated')
                } catch {
                    diagSpinner.warn('Diagram generation skipped (package not available)')
                }

                // 10. Generate claude.md / AGENTS.md
                const aiSpinner = ora('Generating AI context files...').start()
                try {
                    const { ClaudeMdGenerator } = await import('@getmikk/ai-context')
                    const meta = {
                        description: pkgJson.description,
                        scripts: pkgJson.scripts,
                        dependencies: pkgJson.dependencies,
                        devDependencies: pkgJson.devDependencies,
                    }
                    const mdGenerator = new ClaudeMdGenerator(contract, lock, undefined, meta)
                    const claudeMd = mdGenerator.generate()
                    await fs.writeFile(path.join(projectRoot, 'claude.md'), claudeMd, 'utf-8')
                    await fs.writeFile(path.join(projectRoot, 'AGENTS.md'), claudeMd, 'utf-8')
                    aiSpinner.succeed('AI context files generated')
                } catch {
                    aiSpinner.warn('AI context generation skipped (package not available)')
                }

                console.log(chalk.green('\n✓ Mikk initialized successfully'))
                console.log(`  ${chalk.dim('.mikkignore')}         — edit this to exclude files from analysis`)
                console.log(`  ${chalk.dim('mikk.json')}          — edit this to refine your architecture`)
                console.log(`  ${chalk.dim('mikk.lock.json')}     — auto-generated, commit this`)
                console.log(`  ${chalk.dim('.mikk/diagrams/')}    — Mermaid diagrams of your codebase`)
                console.log(`  ${chalk.dim('claude.md')}          — AI context derived from lock file`)
                console.log(`  ${chalk.dim('AGENTS.md')}          — same, for Codex/Copilot agents`)
                console.log(`\n  ${chalk.dim('Stats:')} ${files.length} files, ${functionCount} functions, ${clusters.length} modules`)
                console.log(`\n  ${chalk.dim('Next:')} Review mikk.json and refine module descriptions`)
                console.log(`  ${chalk.dim('Run:')}  mikk contract validate to check for drift`)

            } catch (err: any) {
                console.error(chalk.red(`\nInitialization failed: ${err.message}`))
                if (process.env.MIKK_DEBUG) console.error(err.stack)
                process.exit(1)
            }
        })
}
