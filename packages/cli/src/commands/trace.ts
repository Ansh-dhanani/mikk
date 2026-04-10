import path from 'node:path'
import { Command } from 'commander'
import ora from 'ora'
import chalk from 'chalk'
import { resolveCoreModule } from './analyze.js'
import fs from 'node:fs'

export interface TraceStep {
  variableName: string
  cause: string
  depth: number
  nodeId: string
}

export function registerTraceCommand(program: Command) {
  program
    .command('trace <functionId> <variable>')
    .description('Trace the origin of a variable through the codebase (taint analysis)')
    .addHelpText('after',
      `\nExamples:\n` +
      `  mikk trace "src/auth/jwt.ts:verifyToken" userId   Trace userId variable\n` +
      `  mikk trace "src/api/handler.ts:handle" req        Trace req variable\n` +
      `\nUse function IDs from "mikk stats" or "mikk search" results.\n`)
    .action(async (functionId: string, variable: string) => {
      const spinner = ora('Analyzing data flow...').start()
      const projectRoot = process.cwd()

      try {
        const core = await resolveCoreModule(projectRoot)
        const { TaintAnalyzer, LockReader } = core

        const lockPath = path.join(projectRoot, 'mikk.lock.json')
        if (!fs.existsSync(lockPath)) {
            spinner.fail('Lock file missing')
            console.error(chalk.red(`\nCould not find mikk.lock.json at ${lockPath}`))
            console.log(chalk.dim('Please run "mikk analyze" first to index your codebase.'))
            process.exit(1)
        }

        const lock = await new LockReader().read(lockPath)

        // Validation: Check if function exists
        if (!lock.functions[functionId]) {
            spinner.fail('Function not found')
            console.error(chalk.yellow(`\nFunction ID ${chalk.bold(functionId)} does not exist in the current index.`))
            console.log(chalk.dim('Try using standard function IDs from "mikk stats" or "mikk search".'))
            process.exit(1)
        }

        const analyzer = new TaintAnalyzer(lock)
        const trace = analyzer.traceSource(functionId, variable)

        spinner.stop()

        if (trace.length === 0) {
          console.log(chalk.yellow(`\nNo data flow found for variable "${variable}" in ${functionId}`))
          console.log(chalk.dim('Check if the variable name is correct or if it is a local temporary variable.'))
          return
        }

        console.log(chalk.green(`\nTrace for ${chalk.bold(variable)} in ${chalk.bold(functionId)}:\n`))

        trace.forEach((step: TraceStep, i: number) => {
          const arrow = i === 0 ? '' : '  ↳ '
          const color = step.cause === 'parameter' || step.cause === 'parameter_bind' ? chalk.red : chalk.cyan
          console.log(`${arrow}${color(step.variableName)} ${chalk.dim(`[${step.cause}]`)}`)
        })
        console.log('')
      } catch (err: unknown) {
        spinner.fail('Trace failed')
        const message = err instanceof Error ? err.message : String(err)
        console.error(chalk.red(message))
        if (process.env.MIKK_DEBUG && err instanceof Error) console.error(err.stack)
        process.exit(1)
      }
    })
}
