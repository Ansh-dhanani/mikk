import * as path from 'node:path'
import type { Command } from 'commander'
import chalk from 'chalk'
import { discoverFiles, hashFile, LockReader, detectProjectLanguage, getDiscoveryPatterns } from '@getmikk/core'

interface Change {
    type: 'added' | 'modified' | 'deleted'
    path: string
}

export function registerDiffCommand(program: Command) {
    program
        .command('diff')
        .description('Show files modified since last analyze')
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

                // Use same language-aware patterns as `analyze` so diff and analyze see identical file sets
                const language = (lock as any).project?.language
                    ? (lock as any).project.language
                    : await detectProjectLanguage(projectRoot)
                const { patterns, ignore } = getDiscoveryPatterns(language)
                const files = await discoverFiles(projectRoot, patterns, ignore)

                const changes: Change[] = []

                // Normalise: lowercase + forward-slashes. The lock stores lowercase keys
                // (getPathKey in utils/path.ts lowercases), but path.join returns OS-cased paths
                // on Windows, causing a string mismatch that makes every file appear both added
                // and deleted. Normalise both sides to lowercase before comparison.
                const normKey = (p: string) => p.replace(/\\/g, '/').toLowerCase()

                for (const filePath of files) {
                    const fullPath = path.join(projectRoot, filePath)
                    const posixFullPath = normKey(fullPath)
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

                // Find deleted files — normalise both sets to lowercase
                const absoluteFiles = new Set(files.map(f => normKey(path.join(projectRoot, f))))
                for (const lockedPath of Object.keys(lock.files)) {
                    if (!absoluteFiles.has(normKey(lockedPath))) {
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
