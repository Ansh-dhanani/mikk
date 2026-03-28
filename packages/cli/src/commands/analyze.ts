import fs from 'node:fs'
import * as path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Command } from 'commander'
import ora from 'ora'
import chalk from 'chalk'
import { patchFileContent } from '../utils.js'

type CoreModule = typeof import('@getmikk/core')

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

async function resolveCoreModule(projectRoot: string): Promise<CoreModule> {
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
            } catch (err: any) {
                lastError = err
            }
        }

    throw lastError ?? new Error('Unable to resolve @getmikk/core')
}

export function registerAnalyzeCommand(program: Command) {
    program
        .command('analyze')
        .description('Re-analyze codebase and update lock file')
        .action(async () => {
            const spinner = ora('Analyzing project...').start()
            const projectRoot = process.cwd()

            try {
                const core = await resolveCoreModule(projectRoot)
                const {
                    discoverFiles, discoverContextFiles, parseFiles, readFileContent,
                    GraphBuilder, LockCompiler, ContractReader, LockReader,
                    detectProjectLanguage, getDiscoveryPatterns,
                } = core

                const contractReader = new ContractReader()
                const contract = await contractReader.read(path.join(projectRoot, 'mikk.json'))

                const language = await detectProjectLanguage(projectRoot)
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

                const parsedFiles = await parseFiles(files, projectRoot, (fp) =>
                    readFileContent(fp)
                )

                spinner.text = 'Building dependency graph...'
                const graph = new GraphBuilder().build(parsedFiles)

                spinner.text = 'Discovering schema & config files...'
                const contextFiles = await discoverContextFiles(projectRoot)

                spinner.text = 'Compiling lock file...'
                const lock = new LockCompiler().compile(graph, contract, parsedFiles, contextFiles, projectRoot)

                const lockReader = new LockReader()
                await lockReader.write(lock, path.join(projectRoot, 'mikk.lock.json'))

                spinner.text = 'Generating Mermaid diagrams...'
                try {
                    const { DiagramOrchestrator } = await import('@getmikk/diagram-generator')
                    const orchestrator = new DiagramOrchestrator(contract, lock, projectRoot)
                    await orchestrator.generateAll()
                } catch {
                    // diagram package not available — skip silently
                }

                // Generate claude.md / AGENTS.md
                spinner.text = 'Generating AI context files...'
                try {
                    const { ClaudeMdGenerator, OpenClawRulesGenerator } = await import('@getmikk/ai-context')
                    const fs = await import('node:fs/promises')
                    let pkgJson: any = {}
                    try {
                        pkgJson = JSON.parse(await fs.readFile(path.join(projectRoot, 'package.json'), 'utf-8'))
                    } catch { /* no package.json */ }
                    const meta = {
                        description: pkgJson.description,
                        scripts: pkgJson.scripts,
                        dependencies: pkgJson.dependencies,
                        devDependencies: pkgJson.devDependencies,
                    }
                    const mdGenerator = new ClaudeMdGenerator(contract, lock, undefined, meta, projectRoot)
                    const claudeMd = mdGenerator.generate()
                    await fs.writeFile(path.join(projectRoot, 'claude.md'), claudeMd, 'utf-8')
                    await patchFileContent(path.join(projectRoot, 'AGENTS.md'), claudeMd)

                    const projectName = pkgJson.name || path.basename(projectRoot)
                    const openclawGenerator = new OpenClawRulesGenerator(projectName)
                    const clinerules = openclawGenerator.generate()
                    await patchFileContent(path.join(projectRoot, '.clinerules'), clinerules)

                } catch {
                    // ai-context package not available — skip silently
                }

                const functionCount = Object.keys(lock.functions).length
                spinner.succeed(`Analyzed ${files.length} files, ${functionCount} functions`)
            } catch (err: any) {
                spinner.fail('Analysis failed')
                console.error(chalk.red(err.message))
                if (process.env.MIKK_DEBUG) console.error(err.stack)
                process.exit(1)
            }
        })
}
