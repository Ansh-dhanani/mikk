import * as path from 'node:path'
import type { Command } from 'commander'
import ora from 'ora'
import chalk from 'chalk'
import { ContractReader, LockReader, discoverFiles, hashFile, detectProjectLanguage, getDiscoveryPatterns } from '@getmikk/core'
import { BoundaryChecker } from '@getmikk/core'

export function registerContractCommands(program: Command) {
    const contract = program
        .command('contract')
        .description('Contract management commands')

    // ── mikk contract validate ───────────────────────────────────────────
    contract
        .command('validate [path]')
        .description('Validate contract: check file drift AND boundary violations (compares lock vs filesystem)')
        .option('--boundaries-only', 'Skip drift check, only check module boundaries')
        .option('--drift-only', 'Skip boundary check, only check file drift')
        .option('--strict', 'Exit 1 on warnings as well as errors')
        .addHelpText('after',
            `\nExamples:\n` +
            `  mikk contract validate              Check drift and boundaries\n` +
            `  mikk contract validate --boundaries-only   Only check module boundaries\n` +
            `  mikk contract validate --drift-only        Only check for new/modified/deleted files\n` +
            `  mikk contract validate --strict           Exit 1 on warnings too\n` +
            `  mikk contract validate ./path/to/project   Check a specific project\n` +
            `\nNote: Drift check compares lock file against current filesystem, not git history.\n`)
        .action(async (projectPath: string, options: any) => {
            const projectRoot = projectPath || process.cwd()

            // Guard: mutually exclusive flags
            if (options.boundariesOnly && options.driftOnly) {
                console.error(chalk.red('Cannot use --boundaries-only and --drift-only together.'))
                process.exit(1)
            }

            try {
                const contractReader = new ContractReader()
                const mikkContract = await contractReader.read(path.join(projectRoot, 'mikk.json'))
                const lockReader = new LockReader()
                const lock = await lockReader.read(path.join(projectRoot, 'mikk.lock.json'))

                let hasErrors = false
                let hasWarnings = false

                // ── 1. File drift check ────────────────────────────────────
                if (!options.boundariesOnly) {
                    const driftSpinner = ora('Checking file drift...').start()
                    // Use same language-aware patterns as `analyze` to avoid
                    // false drift from discovering different file sets.
                    const language = mikkContract.project.language || await detectProjectLanguage(projectRoot)
                    const { patterns, ignore } = getDiscoveryPatterns(language as any)
                    const files = await discoverFiles(projectRoot, patterns, ignore)
                    const drifted: string[] = []
                    const added: string[] = []
                    const deleted: string[] = []

                    const normKey = (p) => p.replace(/\\/g, '/').toLowerCase()
                    for (const filePath of files) {
                        const fullPath = path.join(projectRoot, filePath)
                        const lockKey = normKey(fullPath)
                        const currentHash = await hashFile(fullPath)
                        const lockedFile = lock.files[lockKey]
                        if (!lockedFile) {
                            added.push(filePath)
                        } else if (lockedFile.hash !== currentHash) {
                            drifted.push(filePath)
                        }
                    }
                    const absFileSet = new Set(files.map(f => normKey(path.join(projectRoot, f))))
                    for (const lockedPath of Object.keys(lock.files)) {
                        if (!absFileSet.has(normKey(lockedPath))) deleted.push(path.relative(projectRoot, lockedPath).replace(/\\/g, '/'))
                    }

                    const driftTotal = drifted.length + added.length + deleted.length
                    if (driftTotal === 0) {
                        driftSpinner.succeed(chalk.green('File drift: clean'))
                    } else {
                        hasWarnings = true
                        driftSpinner.warn(chalk.yellow(`File drift: ${driftTotal} file(s) out of sync`))
                        for (const f of drifted) console.log(chalk.yellow(`  ~${f} (modified)`))
                        for (const f of added) console.log(chalk.green(`  + ${f} (new file)`))
                        for (const f of deleted) console.log(chalk.red(`  - ${f} (deleted)`))
                        console.log(chalk.dim('\n  Run "mikk analyze" to sync the lock file.\n'))
                    }
                }

                // ── 2. Boundary violation check ───────────────────────────
                if (!options.driftOnly) {
                    const boundarySpinner = ora('Checking module boundaries...').start()

                    // Parse rules from constraints
                    const hasRules = mikkContract.declared.constraints.some(c =>
                        c.toLowerCase().includes('module:')
                    )

                    if (!hasRules) {
                        boundarySpinner.info(chalk.dim(
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
                            boundarySpinner.succeed(chalk.green(`Boundaries: ${result.summary}`))
                        } else {
                            hasErrors = true
                            boundarySpinner.fail(chalk.red(`Boundaries: ${result.summary}`))
                            console.log('')
                            for (const v of result.violations) {
                                const severity = v.severity === 'error'
                                    ? chalk.red('[ERROR]')
                                    : chalk.yellow('[WARN]')
                                console.log(
                                    `  ${severity} ${chalk.bold(v.from.moduleName)} → ${chalk.bold(v.to.moduleName)}`
                                )
                                console.log(
                                    `         ${v.from.functionName}() in ${v.from.file}`
                                )
                                console.log(
                                    `         calls ${v.to.functionName}() in ${v.to.file}`
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

            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                console.error(chalk.red(`Validation failed: ${message}`))
                if (process.env.MIKK_DEBUG && err instanceof Error) console.error(err.stack)
                process.exit(1)
            }
        })

    // ── mikk contract show-boundaries ────────────────────────────────────
    contract
        .command('show-boundaries [path]')
        .description('Show all current cross-module calls (useful for writing constraints)')
        .action(async (projectPath: string, options: any) => {
            const projectRoot = projectPath || process.cwd()
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

            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                console.error(chalk.red(message))
                process.exit(1)
            }
        })
}