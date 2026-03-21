import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import * as readline from 'node:readline'
import { cleanupGitIgnore } from '@getmikk/core'

const artifacts = [
    'mikk.json',
    'mikk.lock.json',
    '.mikk',
    '.mikkignore',
    'CLAUDE.md',
    'AGENTS.md'
]

async function confirm(message: string): Promise<boolean> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })

    return new Promise(resolve => {
        rl.question(`${message} (y/N): `, answer => {
            rl.close()
            resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes')
        })
    })
}

export function registerRemoveCommand(program: Command) {
    program
        .command('remove')
        .description('Remove Mikk from the project and delete all generated artifacts.')
        .option('-f, --force', 'Skip confirmation prompt and immediately delete artifacts')
        .action(async (options) => {
            console.log(chalk.bold.red('\nDestructive Operation: Removing Mikk'))
            console.log(chalk.dim('This command will permanently delete the following files/directories from your project:'))
            
            for (const item of artifacts) {
                console.log(`  - ${item}`)
            }
            console.log('') // Newline

            if (!options.force) {
                const confirmed = await confirm(chalk.yellow('Are you sure you want to proceed?'))
                if (!confirmed) {
                    console.log(chalk.blue('\nOperation cancelled. No files were removed.\n'))
                    return
                }
            }

            const spinner = ora('Removing Mikk artifacts...').start()
            const cwd = process.cwd()

            let removedCount = 0
            const errors: string[] = []

            for (const item of artifacts) {
                const targetPath = join(cwd, item)
                try {
                    await rm(targetPath, { recursive: true, force: true })
                    removedCount++
                } catch (e: any) {
                    // Only push an error if it wasn't a standard 'ENOENT' (file not found)
                    if (e.code !== 'ENOENT') {
                        errors.push(`Failed to remove ${item}: ${e.message}`)
                    }
                }
            }

            // Cleanup .gitignore
            await cleanupGitIgnore(cwd)

            if (errors.length > 0) {
                spinner.fail(chalk.red('Failed to cleanly remove all artifacts.'))
                for (const err of errors) {
                    console.log(chalk.red(`  x ${err}`))
                }
                process.exit(1)
            } else {
                spinner.succeed(chalk.green(`Successfully removed ${removedCount} Mikk artifact targets from the project.`))
                console.log(chalk.dim('\nMikk has been uninstalled from your local repository. Thank you for using Mikk!\n'))
            }
        })
}
