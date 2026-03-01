import * as path from 'node:path'
import type { Command } from 'commander'
import chalk from 'chalk'
import { discoverFiles, hashFile, LockReader } from '@ansh-dhanani/core'

interface Change {
    type: 'added' | 'modified' | 'deleted'
    path: string
}

export function registerDiffCommand(program: Command) {
    program
        .command('diff')
        .description('Show what changed since last analysis')
        .action(async () => {
            const projectRoot = process.cwd()

            try {
                const lockReader = new LockReader()
                const lock = await lockReader.read(path.join(projectRoot, 'mikk.lock.json'))
                const files = await discoverFiles(projectRoot)

                const changes: Change[] = []

                for (const filePath of files) {
                    const fullPath = path.join(projectRoot, filePath)
                    const currentHash = await hashFile(fullPath)
                    const lockedFile = lock.files[filePath]

                    if (!lockedFile) {
                        changes.push({ type: 'added', path: filePath })
                        continue
                    }

                    if (lockedFile.hash !== currentHash) {
                        changes.push({ type: 'modified', path: filePath })
                    }
                }

                // Find deleted files
                for (const lockedPath of Object.keys(lock.files)) {
                    if (!files.includes(lockedPath)) {
                        changes.push({ type: 'deleted', path: lockedPath })
                    }
                }

                if (changes.length === 0) {
                    console.log(chalk.green('✓ No changes since last analysis'))
                    return
                }

                console.log(chalk.bold(`\n${changes.length} changes since last analysis:\n`))

                for (const change of changes) {
                    let icon: string
                    let color: (s: string) => string
                    switch (change.type) {
                        case 'added':
                            icon = '+'
                            color = chalk.green
                            break
                        case 'modified':
                            icon = '~'
                            color = chalk.yellow
                            break
                        case 'deleted':
                            icon = '-'
                            color = chalk.red
                            break
                    }
                    console.log(`  ${color(icon)} ${change.path}`)
                }

                console.log(`\n${chalk.dim('Run "mikk analyze" to update the lock file')}`)
            } catch (err: any) {
                console.error(chalk.red(err.message))
                process.exit(1)
            }
        })
}
