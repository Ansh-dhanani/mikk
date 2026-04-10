import * as path from 'node:path'
import type { Command } from 'commander'
import chalk from 'chalk'
import { discoverFiles, hashFile, LockReader } from '@getmikk/core'

interface Change {
    type: 'added' | 'modified' | 'deleted'
    path: string
}

export function registerDiffCommand(program: Command) {
    program
        .command('diff')
        .description('Show what changed since last analysis (compares lock vs current filesystem)')
        .addHelpText('after',
            `\nExamples:\n` +
            `  mikk diff                    Show all changes since last analyze\n` +
            `  mikk diff | head -20        Preview first 20 changes\n` +
            `\nThis compares the lock file against your current filesystem.\n` +
            `Run "mikk analyze" to update the lock file with your changes.\n`)
        .action(async () => {
            const projectRoot = process.cwd()

            try {
                const lockReader = new LockReader()
                const lock = await lockReader.read(path.join(projectRoot, 'mikk.lock.json'))
                const files = await discoverFiles(projectRoot)

                const changes: Change[] = []

                for (const filePath of files) {
                    const fullPath = path.join(projectRoot, filePath)
                    const posixFullPath = fullPath.replace(/\\/g, '/')
                    const currentHash = await hashFile(fullPath)
                    const lockedFile = lock.files[posixFullPath]

                    if (!lockedFile) {
                        changes.push({ type: 'added', path: filePath })
                        continue
                    }

                    if (lockedFile.hash !== currentHash) {
                        changes.push({ type: 'modified', path: filePath })
                    }
                }

                // Find deleted files
                const absoluteFiles = new Set(files.map(f => path.join(projectRoot, f).replace(/\\/g, '/')))
                for (const lockedPath of Object.keys(lock.files)) {
                    if (!absoluteFiles.has(lockedPath)) {
                        changes.push({ type: 'deleted', path: path.relative(projectRoot, lockedPath).replace(/\\/g, '/') })
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
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                console.error(chalk.red(message))
                process.exit(1)
            }
        })
}
