import path from 'node:path'
import fs from 'node:fs'
import { Command } from 'commander'
import ora from 'ora'
import chalk from 'chalk'
import { LockReader } from '@getmikk/core'
import { SemanticSearcher } from '@getmikk/intent-engine'

export function registerSearchCommand(program: Command) {
  program
    .command('search <query>')
    .description('Search codebase semantically using natural language')
    .option('-l, --limit <number>', 'Maximum number of results', '10')
    .addHelpText('after',
      `\nExamples:\n` +
      `  mikk search "authentication middleware"       Find auth-related functions\n` +
      `  mikk search "database connection pooling"     Find DB connection code\n` +
      `\nUses local embeddings via @xenova/transformers (no API key needed).\n`)
    .action(async (query, options) => {
      const spinner = ora('Initializing semantic engine...').start()
      const projectRoot = process.cwd()

      try {
        const lockPath = path.join(projectRoot, 'mikk.lock.json')
        if (!fs.existsSync(lockPath)) {
            spinner.fail('Lock file missing')
            console.error(chalk.red(`\nCould not find mikk.lock.json at ${lockPath}`))
            console.log(chalk.dim('Please run "mikk analyze" first to index your codebase.'))
            process.exit(1)
        }

        const lock = await new LockReader().read(lockPath)

        spinner.text = 'Indexing functions...'
        const searcher = new SemanticSearcher(projectRoot)
        await searcher.index(lock)

        spinner.text = 'Searching...'
        const results = await searcher.search(query, lock, parseInt(options.limit))

        spinner.stop()

        if (results.length === 0) {
          console.log(chalk.yellow(`\nNo results found for: "${query}"`))
          console.log(chalk.dim('Try using more general keywords or ensure your code is indexed.'))
          return
        }

        console.log(chalk.green(`\nFound ${results.length} results for: "${query}"\n`))

        results.forEach((res, i) => {
          console.log(`${chalk.blue(i + 1)}. ${chalk.bold(res.name)} ${chalk.dim(`(${res.score.toFixed(4)})`)}`)
          console.log(`   ${chalk.dim(res.file)}`)
          if (res.purpose) {
            console.log(`   ${chalk.italic(res.purpose)}`)
          }
          console.log('')
        })
      } catch (err: unknown) {
        spinner.fail('Search failed')
        const message = err instanceof Error ? err.message : String(err)
        console.error(chalk.red(message))
        if (process.env.MIKK_DEBUG && err instanceof Error) console.error(err.stack)
        process.exit(1)
      }
    })
}
