import * as path from 'node:path'
import { readFileSync, statSync, existsSync } from 'node:fs'
import type { Command } from 'commander'
import ora from 'ora'
import chalk from 'chalk'
import { fileExists } from '@getmikk/core'

export function registerEmbeddingsCommand(program: Command) {
    program
        .command('embeddings')
        .description('Generate or update semantic search embeddings from lock file')
        .option('-f, --force', 'Force regenerate embeddings even if cache is valid')
        .option('--project <path>', 'Project root directory', process.cwd())
        .addHelpText('after',
            `\nExamples:\n` +
            `  mikk embeddings              Generate embeddings from lock\n` +
            `  mikk embeddings --force     Force regenerate embeddings\n` +
            `\nCreates .mikk/embeddings.json for semantic search\n`)
        .action(async (options: { force?: boolean; project?: string }) => {
            const projectRoot = path.resolve(options.project || process.cwd())
            const lockPath = path.join(projectRoot, 'mikk.lock.json')
            const spinner = ora('Loading lock file...').start()

            if (!await fileExists(lockPath)) {
                spinner.fail('Lock file not found')
                console.log(chalk.dim(`  Run "mikk init" or "mikk analyze" first`))
                process.exit(1)
            }

            try {
                const lockContent = readFileSync(lockPath, 'utf-8')
                const lock = JSON.parse(lockContent)
                spinner.text = 'Checking embeddings...'

                const { SemanticSearcher } = await import('@getmikk/intent-engine')
                
                if (!await SemanticSearcher.isAvailable()) {
                    spinner.warn('@xenova/transformers not installed')
                    console.log(chalk.yellow('\n  Install it for semantic search:'))
                    console.log(chalk.cyan('    npm install @xenova/transformers'))
                    console.log(chalk.cyan('    # or'))
                    console.log(chalk.cyan('    bun add @xenova/transformers'))
                    process.exit(1)
                }

                const searcher = new SemanticSearcher(projectRoot)
                
                if (!options.force) {
                    spinner.text = 'Checking cache...'
                    try {
                        await searcher.index(lock)
                        const cachePath = path.join(projectRoot, '.mikk', 'embeddings.json')
                        if (existsSync(cachePath)) {
                            const cache = JSON.parse(readFileSync(cachePath, 'utf-8'))
                            const fnCount = Object.keys(cache.embeddings || {}).length
                            spinner.succeed(`Embeddings ready (${fnCount} functions cached)`)
                            return
                        }
                    } catch {
                        // Cache miss, proceed to generate
                    }
                }

                spinner.text = 'Generating embeddings...'
                const fnCount = Object.keys(lock.functions || {}).length
                if (fnCount === 0) {
                    spinner.warn('No functions in lock file')
                    return
                }

                await searcher.index(lock)
                const embPath = path.join(projectRoot, '.mikk', 'embeddings.json')
                const embSize = (statSync(embPath).size / 1024).toFixed(1)
                
                spinner.succeed(`Embeddings generated (${fnCount} functions, ${embSize} KB)`)
                console.log(chalk.dim(`\n  Saved to .mikk/embeddings.json`))
                console.log(chalk.dim('  Use: mikk search "your query"'))

            } catch (err) {
                spinner.fail('Failed to generate embeddings')
                const msg = err instanceof Error ? err.message : String(err)
                console.error(chalk.red(msg))
                if (process.env.MIKK_DEBUG && err instanceof Error) {
                    console.error(err.stack)
                }
                process.exit(1)
            }
        })
}