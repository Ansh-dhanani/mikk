import * as path from 'node:path'
import type { Command } from 'commander'
import ora from 'ora'
import chalk from 'chalk'
import { ContractReader, LockReader, ContractWriter, discoverFiles, hashFile } from '@getmikk/core'
import { BoundaryChecker } from '@getmikk/core'
import type { MikkContract, MikkLock } from '@getmikk/core'

export function registerContractCommands(program: Command) {
    const contract = program
        .command('contract')
        .description('Contract management commands')

    // ── mikk contract validate ───────────────────────────────────────────
    contract
        .command('validate')
        .description('Validate contract: check file drift AND boundary violations')
        .option('--boundaries-only', 'Skip drift check, only check module boundaries')
        .option('--drift-only', 'Skip boundary check, only check file drift')
        .option('--strict', 'Exit 1 on warnings as well as errors')
        .action(async (options) => {
            const spinner = ora('Validating contract...').start()
            const projectRoot = process.cwd()

            try {
                const contractReader = new ContractReader()
                const mikkContract = await contractReader.read(path.join(projectRoot, 'mikk.json'))
                const lockReader = new LockReader()
                const lock = await lockReader.read(path.join(projectRoot, 'mikk.lock.json'))

                let hasErrors = false
                let hasWarnings = false

                // ── 1. File drift check ────────────────────────────────────
                if (!options.boundariesOnly) {
                    spinner.text = 'Checking file drift...'
                    const files = await discoverFiles(projectRoot)
                    const drifted: string[] = []
                    const added: string[] = []
                    const deleted: string[] = []

                    for (const filePath of files) {
                        const fullPath = path.join(projectRoot, filePath)
                        const currentHash = await hashFile(fullPath)
                        const lockedFile = lock.files[filePath]
                        if (!lockedFile) {
                            added.push(filePath)
                        } else if (lockedFile.hash !== currentHash) {
                            drifted.push(filePath)
                        }
                    }
                    for (const lockedPath of Object.keys(lock.files)) {
                        if (!files.includes(lockedPath)) deleted.push(lockedPath)
                    }

                    const driftTotal = drifted.length + added.length + deleted.length
                    if (driftTotal === 0) {
                        spinner.succeed(chalk.green('File drift: clean'))
                    } else {
                        hasWarnings = true
                        spinner.warn(chalk.yellow(`File drift: ${driftTotal} file(s) out of sync`))
                        for (const f of drifted) console.log(chalk.yellow(`  ~${f} (modified)`))
                        for (const f of added) console.log(chalk.green(`  + ${f} (new file)`))
                        for (const f of deleted) console.log(chalk.red(`  - ${f} (deleted)`))
                        console.log(chalk.dim('\n  Run "mikk analyze" to sync the lock file.\n'))
                    }
                }

                // ── 2. Boundary violation check ───────────────────────────
                if (!options.driftOnly) {
                    spinner.text = 'Checking module boundaries...'

                    // Parse rules from constraints
                    const hasRules = mikkContract.declared.constraints.some(c =>
                        c.toLowerCase().includes('module:')
                    )

                    if (!hasRules) {
                        spinner.info(chalk.dim(
                            'Boundaries: no module constraints defined in mikk.json.\n' +
                            '  Add constraints like:\n' +
                            '    "module:cli cannot import module:db"\n' +
                            '    "module:core has no imports"\n' +
                            '  to enforce architectural boundaries.'
                        ))
                    } else {
                        const checker = new BoundaryChecker(mikkContract, lock)
                        const result = checker.check()

                        if (result.pass) {
                            spinner.succeed(chalk.green(`Boundaries: ${result.summary} `))
                        } else {
                            hasErrors = true
                            spinner.fail(chalk.red(`Boundaries: ${result.summary} `))
                            console.log('')
                            for (const v of result.violations) {
                                const severity = v.severity === 'error'
                                    ? chalk.red('[ERROR]')
                                    : chalk.yellow('[WARN]')
                                console.log(
                                    `  ${severity} ${chalk.bold(v.from.moduleName)} → ${chalk.bold(v.to.moduleName)} `
                                )
                                console.log(
                                    `         ${v.from.functionName} () in ${v.from.file} `
                                )
                                console.log(
                                    `         calls ${v.to.functionName} () in ${v.to.file} `
                                )
                                console.log(chalk.dim(`         Rule: "${v.rule}"\n`))
                            }
                        }
                    }
                }

                // ── Exit code ─────────────────────────────────────────────
                if (hasErrors || (options.strict && hasWarnings)) {
                    process.exit(1)
                }

            } catch (err: any) {
                spinner.fail('Validation failed')
                console.error(chalk.red(err.message))
                process.exit(1)
            }
        })

    // ── mikk contract generate ───────────────────────────────────────────
    contract
        .command('generate')
        .description('Regenerate mikk.json skeleton from current analysis')
        .action(async () => {
            console.log(chalk.dim('Use "mikk init" to generate a fresh contract.'))
        })

    // ── mikk contract update ─────────────────────────────────────────────
    contract
        .command('update')
        .description('Update lock file to current state')
        .action(async () => {
            console.log(chalk.dim('Run "mikk analyze" to update the lock file.'))
        })

    // ── mikk contract show-boundaries ────────────────────────────────────
    contract
        .command('show-boundaries')
        .description('Show all current cross-module calls (useful for writing constraints)')
        .action(async () => {
            const projectRoot = process.cwd()
            try {
                const contractReader = new ContractReader()
                const mikkContract = await contractReader.read(path.join(projectRoot, 'mikk.json'))
                const lockReader = new LockReader()
                const lock = await lockReader.read(path.join(projectRoot, 'mikk.lock.json'))

                const checker = new BoundaryChecker(mikkContract, lock)
                const calls = checker.allCrossModuleCalls()

                if (calls.length === 0) {
                    console.log(chalk.green('\n✓ No cross-module calls found. Modules are fully isolated.\n'))
                    return
                }

                console.log(chalk.bold('\n📊 Cross-module dependency map:\n'))
                for (const { from, to, count } of calls) {
                    console.log(
                        `  ${chalk.cyan(from.padEnd(20))} → ${chalk.yellow(to.padEnd(20))} ` +
                        chalk.dim(`(${count} call${count !== 1 ? 's' : ''})`)
                    )
                }
                console.log(chalk.dim('\n  Copy these into mikk.json constraints to enforce boundaries:'))
                console.log(chalk.dim('  e.g., "module:cli cannot import module:db"\n'))

            } catch (err: any) {
                console.error(chalk.red(err.message))
                process.exit(1)
            }
        })
}