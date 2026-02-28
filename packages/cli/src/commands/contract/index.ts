import * as path from 'node:path'
import type { Command } from 'commander'
import ora from 'ora'
import chalk from 'chalk'
import { ContractReader, LockReader, ContractWriter, discoverFiles, hashFile } from '@mikk/core'

export function registerContractCommands(program: Command) {
    const contract = program
        .command('contract')
        .description('Contract management commands')

    // mikk contract validate
    contract
        .command('validate')
        .description('Validate contract against current code')
        .action(async () => {
            const spinner = ora('Validating contract...').start()
            const projectRoot = process.cwd()

            try {
                const contractReader = new ContractReader()
                const mikkContract = await contractReader.read(path.join(projectRoot, 'mikk.json'))

                const lockReader = new LockReader()
                const lock = await lockReader.read(path.join(projectRoot, 'mikk.lock.json'))

                // Check for drift
                const files = await discoverFiles(projectRoot)
                let driftCount = 0

                for (const filePath of files) {
                    const fullPath = path.join(projectRoot, filePath)
                    const currentHash = await hashFile(fullPath)
                    const lockedFile = lock.files[filePath]

                    if (!lockedFile || lockedFile.hash !== currentHash) {
                        driftCount++
                    }
                }

                if (driftCount === 0) {
                    spinner.succeed(chalk.green('Contract is valid — no drift detected'))
                } else {
                    spinner.warn(chalk.yellow(`${driftCount} files have drifted from lock. Run "mikk analyze" to sync.`))
                }
            } catch (err: any) {
                spinner.fail('Validation failed')
                console.error(chalk.red(err.message))
                process.exit(1)
            }
        })

    // mikk contract generate
    contract
        .command('generate')
        .description('Regenerate mikk.json skeleton')
        .action(async () => {
            console.log(chalk.dim('Use "mikk init" to generate a fresh contract.'))
        })

    // mikk contract update
    contract
        .command('update')
        .description('Update contract after code changes')
        .action(async () => {
            console.log(chalk.dim('Run "mikk analyze" to update the lock file.'))
        })
}
