import * as path from 'node:path'
import fs from 'node:fs'
import type { Command } from 'commander'
import ora from 'ora'
import chalk from 'chalk'
import {
    discoverFiles, discoverContextFiles, parseFiles, readFileContent,
    GraphBuilder, ClusterDetector, ContractGenerator,
    LockCompiler, LockReader,
    setupMikkDirectory, fileExists, generateMikkIgnore, updateGitIgnore,
    detectProjectLanguage, getDiscoveryPatterns,
    runArtifactWriteTransaction, recoverArtifactWriteTransactions,
} from '@getmikk/core'
import { panel, kv, cols, gap, line, sq } from '../ui.js'
import { patchFileContent } from '../utils.js'

export function registerInitCommand(program: Command) {
    program
        .command('init')
        .description('First-time setup. Creates: mikk.json, lock, claude.md, AGENTS.md')
        .option('--force', 'Overwrite existing mikk.json and lock file')
        .option('--strict-parsing', 'Fail if any files could not be parsed cleanly')
        .option('--no-context', 'Skip context file discovery for faster init')
        .addHelpText('after',
          `\nExamples:\n` +
          `  mikk init                  Initialize with auto-detected settings\n` +
          `  mikk init --force         Re-initialize (overwrites existing files)\n` +
          `  mikk init --no-context    Skip schema file discovery\n` +
          `\nCreates: mikk.json, mikk.lock.json, .mikk/, claude.md, AGENTS.md, .clinerules\n`)
        .action(async (options) => {
            const projectRoot = process.cwd()

            try {
                await recoverArtifactWriteTransactions(projectRoot)

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
                
                // 1b. Update .gitignore if it exists
                const gitIgnoreUpdated = await updateGitIgnore(projectRoot)
                if (gitIgnoreUpdated) {
                    spinner.info(chalk.dim('Added .mikk/ to .gitignore'))
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
                const maybeCore = await import('@getmikk/core') as { parseFilesWithDiagnostics?: unknown }
                const parseWithDiagnostics = maybeCore.parseFilesWithDiagnostics as
                    | ((
                        filePaths: string[],
                        root: string,
                        reader: (fp: string) => Promise<string>,
                        options?: { strictParserPreflight?: boolean }
                    ) => Promise<{
                        files: unknown[]
                        diagnostics: Array<{ reason: string }>
                        summary: { diagnostics: number; fallbackFiles: number }
                    }>)
                    | undefined

                const parseResult = typeof parseWithDiagnostics === 'function'
                    ? await parseWithDiagnostics(files, projectRoot, (fp) => readFileContent(fp), {
                        strictParserPreflight: Boolean(options.strictParsing),
                    })
                    : {
                        files: await parseFiles(files, projectRoot, (fp) => readFileContent(fp)),
                        diagnostics: [],
                        summary: {
                            diagnostics: 0,
                            fallbackFiles: 0,
                        },
                    }
                const parsedFiles = parseResult.files

                if (parseResult.summary.diagnostics > 0) {
                    const reasonCounts = new Map<string, number>()
                    for (const diagnostic of parseResult.diagnostics) {
                        reasonCounts.set(diagnostic.reason, (reasonCounts.get(diagnostic.reason) || 0) + 1)
                    }
                    const reasonText = [...reasonCounts.entries()]
                        .sort((a, b) => b[1] - a[1])
                        .map(([reason, count]) => `${reason}: ${count}`)
                        .join(', ')

                    const message =
                        `Parse diagnostics: ${parseResult.summary.diagnostics} issue(s), ` +
                        `${parseResult.summary.fallbackFiles} fallback file(s). ${reasonText}`

                    if (options.strictParsing) {
                        spinner.fail(message)
                        process.exit(1)
                    }

                    spinner.warn(message)
                    spinner.start('Building dependency graph...')
                }

                spinner.text = 'Building dependency graph...'

                // 3. Build graph
                const builder = new GraphBuilder()
                const graph = builder.build(parsedFiles)

                // --- CLI help texts ---natural module clusters
                const detector = new ClusterDetector(graph)
                const clusters = detector.detect()
                spinner.succeed(`Analysis complete: ${files.length} files, ${graph.nodes.size} nodes`)
                const parsedFunctionCount = parsedFiles.reduce((sum, file) => sum + file.functions.length, 0)
                const exportedFunctionCount = parsedFiles.reduce((sum, file) =>
                    sum + file.functions.filter(fn => fn.isExported).length, 0)
                const snapshotRows = [
                    kv('Files', files.length.toString()),
                    kv('Graph nodes', graph.nodes.size.toString()),
                    kv('Graph edges', graph.edges.length.toString()),
                    kv('Functions', parsedFunctionCount.toString()),
                    kv('Exported APIs', exportedFunctionCount.toString()),
                    kv('Modules', clusters.length.toString()),
                ]
                panel('Project snapshot', snapshotRows)
                line(sq.info, 'Graph density', `${(graph.edges.length / Math.max(1, graph.nodes.size)).toFixed(2)} edges/node`)
                gap()
                if (clusters.length > 0) {
                    const topClusters = clusters.slice(0, 6)
                    const moduleRows = topClusters.map(cluster => {
                        const conf = (cluster.confidence * 100).toFixed(0)
                        const detail = `${cluster.files.length} files · ${cluster.functions.length} functions · ${conf}% confidence`
                        return cols(cluster.suggestedName, detail)
                    })
                    panel(`Top ${moduleRows.length} modules`, moduleRows)
                    if (clusters.length > moduleRows.length) {
                        line(sq.dim, 'Modules remaining', `${clusters.length - moduleRows.length} more clusters (see mikk.json)`)
                    }
                    gap()
                }

                // 5. Read package.json for project metadata
                const fs = await import('node:fs/promises')
                let pkgJson: Record<string, unknown> = {}
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

                // 7. Discover context/schema files
                let contextFiles: Awaited<ReturnType<typeof discoverContextFiles>> = []
                if (options.context !== false) {
                    const ctxSpinner = ora('Discovering schema & config files...').start()
                    contextFiles = await discoverContextFiles(projectRoot, {
                        maxFiles: 20,
                        onProgress: (current, total, file) => {
                            ctxSpinner.text = `Discovering schema & config files... (${current}/${total})`
                        },
                    })
                    ctxSpinner.stop()
                    if (contextFiles.length > 0) {
                        const maxRows = 10
                        const displayFiles = contextFiles.slice(0, maxRows)
                        const contextRows = displayFiles.map(cf => {
                            const sizeKb = (cf.size / 1024).toFixed(1)
                            const label = `${chalk.cyan(cf.type.padEnd(10))} ${chalk.dim(cf.path)}`
                            return `${label} ${chalk.dim(`(${sizeKb} KB)`)}`
                        })
                        if (contextFiles.length > maxRows) {
                            contextRows.push(chalk.dim(`... and ${contextFiles.length - maxRows} more`))
                        }
                        panel('Context & schema files', contextRows)
                        gap()
                    } else {
                        console.log(chalk.dim('\nNo schema or config files detected.'))
                        gap()
                    }
                } else {
                    console.log(chalk.dim('\nSkipping context file discovery (--no-context).'))
                    gap()
                }

                // 8. Compile lock file
                console.log(chalk.dim('\n- Compiling lock file...'))
                const compiler = new LockCompiler()
                const lock = compiler.compile(graph, contract, parsedFiles, contextFiles, projectRoot)
                lock.syncState.parseDiagnostics = {
                    requestedFiles: files.length,
                    parsedFiles: parsedFiles.length,
                    fallbackFiles: parseResult.summary.fallbackFiles,
                    diagnostics: parseResult.summary.diagnostics,
                }
                const functionCount = Object.keys(lock.functions).length

                // 9. Write everything to disk
                console.log(chalk.dim('- Writing artifacts...'))
                const lockReader = new LockReader()
                const lockPath = path.join(projectRoot, 'mikk.lock.json')
                const preparedLock = await lockReader.prepareForWrite(lock, lockPath)
                const callEdgeCount = Object.values(preparedLock.functions).reduce((sum, fn) => sum + fn.calls.length, 0)

                // Robustness gate: detect edge-less locks that would break blast radius tools.
                if (options.strictParsing && functionCount >= 50 && callEdgeCount === 0) {
                    throw new Error(
                        'Strict parsing failed: generated lock has zero call edges for a large codebase. ' +
                        'Blast radius would be unreliable. Check parser extraction and retry.'
                    )
                }

                if (!options.strictParsing && functionCount >= 50 && callEdgeCount === 0) {
                    console.log(chalk.yellow(
                        '\n⚠ Degraded analysis: generated lock has zero call edges. ' +
                        'Blast radius may be underestimated. Use --strict-parsing to fail on this condition.'
                    ))
                }

                const artifactWrites: Array<{ targetPath: string; content: string }> = [
                    {
                        targetPath: contractPath,
                        content: JSON.stringify(contract, null, 2),
                    },
                    {
                        targetPath: lockPath,
                        content: lockReader.serialize(preparedLock),
                    },
                ]

                // 10. Generate claude.md / AGENTS.md
                console.log(chalk.dim('\n- Generating AI context files...'))
                const aiSpinner = ora('').start()
                try {
                    const { ClaudeMdGenerator, OpenClawRulesGenerator } = await import('@getmikk/ai-context')
                    const meta = {
                        description: pkgJson.description,
                        scripts: pkgJson.scripts,
                        dependencies: pkgJson.dependencies,
                        devDependencies: pkgJson.devDependencies,
                    }
                    const mdGenerator = new ClaudeMdGenerator(contract, preparedLock, undefined, meta, projectRoot, (progress) => {
                        aiSpinner.text = `Generating AI context... ${progress}%`
                    })
                    const claudeMd = mdGenerator.generate()
                    artifactWrites.push({
                        targetPath: path.join(projectRoot, 'claude.md'),
                        content: claudeMd,
                    })

                    const openclawGenerator = new OpenClawRulesGenerator(projectName)
                    const clinerules = openclawGenerator.generate()

                    await runArtifactWriteTransaction(projectRoot, 'init-artifacts', artifactWrites)
                    await patchFileContent(path.join(projectRoot, 'AGENTS.md'), claudeMd)
                    await patchFileContent(path.join(projectRoot, '.clinerules'), clinerules)

                    aiSpinner.succeed('AI context generated')
                } catch {
                    await runArtifactWriteTransaction(projectRoot, 'init-artifacts', artifactWrites)
                    aiSpinner.warn('AI context generation skipped (package not available)')
                }

                // Generate embeddings for semantic search
                console.log(chalk.dim('- Generating embeddings for semantic search...'))
                const embSpinner = ora('').start()
                try {
                    const { SemanticSearcher } = await import('@getmikk/intent-engine')
                    if (await SemanticSearcher.isAvailable()) {
                        const lockPath = path.join(projectRoot, 'mikk.lock.json')
                        const lockContent = await fs.readFile(lockPath, 'utf-8')
                        const lock = JSON.parse(lockContent)
                        const searcher = new SemanticSearcher(projectRoot, (progress) => {
                            embSpinner.text = `Generating embeddings for semantic search... ${progress}%`
                        })
                        await searcher.index(lock)
                        embSpinner.succeed('Embeddings generated')
                    } else {
                        embSpinner.warn('Embeddings skipped (install @xenova/transformers for semantic search)')
                    }
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err)
                    if (msg.includes('transformers') || msg.includes('Cannot find module')) {
                        embSpinner.warn('Embeddings skipped (install @xenova/transformers for semantic search)')
                    } else {
                        embSpinner.warn(`Embeddings generation failed: ${msg}`)
                    }
                }

                console.log(chalk.green('\n✓ Mikk initialized successfully'))
                console.log(`  ${chalk.dim('.mikkignore')}         — edit this to exclude files from analysis`)
                console.log(`  ${chalk.dim('mikk.json')}          — edit this to refine your architecture`)
                console.log(`  ${chalk.dim('mikk.lock.json')}     — auto-generated, commit this`)
                console.log(`  ${chalk.dim('.mikk/cache/')}        — cached data for faster operations`)
                console.log(`  ${chalk.dim('claude.md')}          — AI context derived from lock file`)
                console.log(`  ${chalk.dim('AGENTS.md')}          — same, for Codex/Copilot agents`)
                console.log(`  ${chalk.dim('.clinerules')}        — auto-imported system instructions for Cline/OpenClaw agents`)
                console.log(`\n  ${chalk.dim('Stats:')} ${files.length} files, ${parsedFunctionCount} functions, ${clusters.length} modules`)
                console.log(`\n  ${chalk.dim('Next:')} Review mikk.json and refine module descriptions`)
                console.log(`  ${chalk.dim('Run:')}  mikk contract validate to check for drift`)

            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                console.error(chalk.red(`\nInitialization failed: ${message}`))
                if (process.env.MIKK_DEBUG && err instanceof Error) console.error(err.stack)
                process.exit(1)
            }
        })
}
