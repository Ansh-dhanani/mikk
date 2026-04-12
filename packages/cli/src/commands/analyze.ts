import fs from 'node:fs'
import * as path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Command } from 'commander'
import ora from 'ora'
import chalk from 'chalk'
import { patchFileContent } from '../utils.js'

type CoreModule = typeof import('@getmikk/core')
type IntentEngineModule = typeof import('@getmikk/intent-engine')

function findWorkspaceRoot(start: string): string | null {
    let current = path.resolve(start)
    while (true) {
        if (fs.existsSync(path.join(current, 'packages', 'core', 'package.json'))) {
            return current
        }
        const parent = path.dirname(current)
        if (parent === current) break
        current = parent
    }
    return null
}

export async function resolveCoreModule(projectRoot: string): Promise<CoreModule> {
    const workspaceRoot = findWorkspaceRoot(projectRoot)
    const candidates: string[] = []
    if (workspaceRoot) {
        const distPath = path.join(workspaceRoot, 'packages', 'core', 'dist', 'index.js')
        const srcPath = path.join(workspaceRoot, 'packages', 'core', 'src', 'index.ts')
        const hasDist = fs.existsSync(distPath)
        const hasSrc = fs.existsSync(srcPath)
        if (hasDist && hasSrc) {
            const distMtime = fs.statSync(distPath).mtimeMs
            const srcMtime = fs.statSync(srcPath).mtimeMs
            if (srcMtime > distMtime) {
                candidates.push(srcPath, distPath)
            } else {
                candidates.push(distPath, srcPath)
            }
        } else if (hasDist) {
            candidates.push(distPath)
        } else if (hasSrc) {
            candidates.push(srcPath)
        }
    }
    candidates.push('@getmikk/core')

    let lastError: Error | null = null
        for (const candidate of candidates) {
            try {
                if (candidate.startsWith('@')) {
                    return await import(candidate)
                }
                return await import(pathToFileURL(candidate).href)
            } catch (err: unknown) {
                lastError = err instanceof Error ? err : new Error(String(err))
            }
        }

    throw lastError ?? new Error('Unable to resolve @getmikk/core')
}

export function registerAnalyzeCommand(program: Command) {
    program
        .command('analyze [path]')
        .description('Re-scan code. Updates: lock, AI context')
        .option('--strict-parsing', 'Fail if any files could not be parsed cleanly')
        .addHelpText('after',
            `\nExamples:\n` +
            `  mikk analyze                   Analyze and update all artifacts\n` +
            `  mikk analyze --strict-parsing  Use stricter parsing (faster but may miss code)\n` +
            `  mikk analyze ./path/to/project  Analyze a specific project\n` +
            `\nThis updates: mikk.lock.json, claude.md, AGENTS.md, .clinerules\n`)
        .action(async (projectPath, options) => {
            const spinner = ora('Analyzing project...').start()
            const projectRoot = projectPath || process.cwd()

            try {
                const core = await resolveCoreModule(projectRoot)
                const {
                    discoverFiles, discoverContextFiles, parseFilesWithDiagnostics, parseFiles, readFileContent,
                    GraphBuilder, LockCompiler, ContractReader, LockReader,
                    detectProjectLanguage, getDiscoveryPatterns,
                    runArtifactWriteTransaction, recoverArtifactWriteTransactions,
                } = core

                await recoverArtifactWriteTransactions(projectRoot)

                const contractReader = new ContractReader()
                const contract = await contractReader.read(path.join(projectRoot, 'mikk.json'))

                // Use contract's language for discovery, with fallback to detection
                const detectedLang = contract.project.language || await detectProjectLanguage(projectRoot)
                const language = detectedLang as 'typescript' | 'javascript' | 'python' | 'go' | 'rust' | 'java' | 'kotlin' | 'swift' | 'csharp' | 'unknown'
                const { patterns, ignore } = getDiscoveryPatterns(language)
                const files = await discoverFiles(projectRoot, patterns, ignore)

                if (files.length === 0) {
                    spinner.fail('No source files found')
                    console.error(chalk.yellow(
                        'No source files were discovered.\n' +
                        `  Detected language: ${language}\n` +
                        '  Check your .mikkignore — it may be excluding too many files.'
                    ))
                    process.exit(1)
                }

                spinner.text = `Parsing ${files.length} files...`

                const parseResult = typeof parseFilesWithDiagnostics === 'function'
                    ? await parseFilesWithDiagnostics(files, projectRoot, (fp) => readFileContent(fp), {
                        strictParserPreflight: Boolean(options.strictParsing),
                        treeSitterRuntimeAvailable: true
                    })
                    : {
                        files: await parseFiles(files, projectRoot, (fp) => readFileContent(fp)),
                        diagnostics: [],
                        summary: {
                            requestedFiles: files.length,
                            parsedFiles: files.length,
                            fallbackFiles: 0,
                            unreadableFiles: 0,
                            unsupportedFiles: 0,
                            diagnostics: 0,
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
                const graph = new GraphBuilder().build(parsedFiles)

                spinner.text = 'Discovering schema & config files...'
                const contextFiles = await discoverContextFiles(projectRoot)

                spinner.text = 'Compiling lock file...'
                const lock = new LockCompiler().compile(graph, contract, parsedFiles, contextFiles, projectRoot)
                lock.syncState.parseDiagnostics = {
                    requestedFiles: parseResult.summary.requestedFiles,
                    parsedFiles: parseResult.summary.parsedFiles,
                    fallbackFiles: parseResult.summary.fallbackFiles,
                    diagnostics: parseResult.summary.diagnostics,
                }

                const lockReader = new LockReader()
                const lockPath = path.join(projectRoot, 'mikk.lock.json')
                const preparedLock = await lockReader.prepareForWrite(lock, lockPath)
                const functionCount = Object.keys(preparedLock.functions).length
                const callEdgeCount = Object.values(preparedLock.functions).reduce((sum, fn) => sum + fn.calls.length, 0)

                // Robustness gate: in strict mode, reject suspicious lock outputs that
                // would make impact analysis silently return near-zero blast radius.
                if (options.strictParsing && functionCount >= 50 && callEdgeCount === 0) {
                    spinner.fail(
                        'Strict parsing failed: generated lock has zero call edges for a large codebase. ' +
                        'Blast radius would be unreliable. Check parser extraction and re-run analyze.'
                    )
                    process.exit(1)
                }

                if (!options.strictParsing && functionCount >= 50 && callEdgeCount === 0) {
                    spinner.warn(
                        'Degraded analysis: generated lock has zero call edges. Blast radius may be underestimated. '
                        + 'Use --strict-parsing to fail on this condition.'
                    )
                    spinner.start('Processing graph data...')
                }

                const artifactWrites: Array<{ targetPath: string; content: string }> = [
                    {
                        targetPath: lockPath,
                        content: lockReader.serialize(preparedLock),
                    },
                ]

                let claudeMd: string | undefined
                let clinerules: string | undefined

                // Generate claude.md / AGENTS.md
                spinner.text = 'Generating AI context files...'
                try {
                    const { ClaudeMdGenerator, OpenClawRulesGenerator } = await import('@getmikk/ai-context')
                    const fs = await import('node:fs/promises')
                    let pkgJson: Record<string, unknown> = {}
                    try {
                        pkgJson = JSON.parse(await fs.readFile(path.join(projectRoot, 'package.json'), 'utf-8'))
                    } catch { /* no package.json */ }
                    const meta: {
                        description?: string
                        scripts?: Record<string, string>
                        dependencies?: Record<string, string>
                        devDependencies?: Record<string, string>
                    } = {
                        description: pkgJson.description,
                        scripts: pkgJson.scripts,
                        dependencies: pkgJson.dependencies,
                        devDependencies: pkgJson.devDependencies,
                    }
                    const mdGenerator = new ClaudeMdGenerator(contract, preparedLock, undefined, meta, projectRoot)
                    claudeMd = mdGenerator.generate()
                    artifactWrites.push({
                        targetPath: path.join(projectRoot, 'claude.md'),
                        content: claudeMd,
                    })

                    const projectName = pkgJson.name || path.basename(projectRoot)
                    const openclawGenerator = new OpenClawRulesGenerator(projectName)
                    clinerules = openclawGenerator.generate()

                } catch {
                    // ai-context package not available — skip silently
                }

                await runArtifactWriteTransaction(projectRoot, 'analyze-artifacts', artifactWrites)
                if (claudeMd) {
                    await patchFileContent(path.join(projectRoot, 'AGENTS.md'), claudeMd)
                }
                if (clinerules) {
                    await patchFileContent(path.join(projectRoot, '.clinerules'), clinerules)
                }

                // Generate embeddings for semantic search
                const embSpinner = ora('Generating embeddings for semantic search...').start()
                try {
                    const { SemanticSearcher } = await import('@getmikk/intent-engine')
                    if (await SemanticSearcher.isAvailable()) {
                        const searcher = new SemanticSearcher(projectRoot, (progress) => {
                            embSpinner.text = `Generating embeddings for semantic search... ${progress}%`
                        })
                        await searcher.index(preparedLock)
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

                spinner.succeed(`Analyzed ${files.length} files, ${functionCount} functions`)
            } catch (err: unknown) {
                spinner.fail('Analysis failed')
                const message = err instanceof Error ? err.message : String(err)
                console.error(chalk.red(message))
                if (process.env.MIKK_DEBUG && err instanceof Error) console.error(err.stack)
                process.exit(1)
            }
        })
}
