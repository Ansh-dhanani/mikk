import * as path from 'node:path'
import type { Command } from 'commander'
import chalk from 'chalk'
import { WatcherDaemon } from '@getmikk/watcher'
import { ContractReader, detectProjectLanguage, getDiscoveryPatterns } from '@getmikk/core'

export function registerWatchCommand(program: Command) {
    program
        .command('watch')
        .description('Watch for file changes and sync lock file automatically (daemon)')
        .addHelpText('after',
            `\nExamples:\n` +
            `  mikk watch              Start the watcher daemon\n` +
            `  mikk watch &            Run in background (Unix/macOS)\n` +
            `\nThe watcher monitors file changes with 100ms debounce and auto-updates\n` +
            `the lock file. Press Ctrl+C to stop.\n`)
        .action(async () => {
            const projectRoot = process.cwd()

            // Pre-flight: make sure the project is initialized
            try {
                const contractReader = new ContractReader()
                await contractReader.read(path.join(projectRoot, 'mikk.json'))
            } catch {
                console.error(chalk.red('No mikk.json found. Run "mikk init" first.'))
                process.exit(1)
            }

            console.log(chalk.bold('🔍 Starting Mikk watcher...\n'))

            const language = await detectProjectLanguage(projectRoot)
            const { patterns, ignore } = getDiscoveryPatterns(language)

            const daemon = new WatcherDaemon({
                projectRoot,
                include: patterns,
                exclude: ignore,
                debounceMs: 100,
            })

            daemon.on((event) => {
                try {
                    switch (event.type) {
                        case 'file:changed':
                            console.log(chalk.dim(`  ${event.data.type}: ${event.data.path}`))
                            break
                        case 'graph:updated':
                            console.log(chalk.green(`  ✓ Graph updated (${event.data.changedNodes.length} changed, ${event.data.impactedNodes.length} impacted)`))
                            break
                        case 'sync:drifted':
                            console.log(chalk.yellow(`  ⚠ Sync drifted: ${event.data.reason}`))
                            break
                    }
                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : String(err)
                    console.error(chalk.red(`  Watcher event error: ${message}`))
                }
            })

            try {
                await daemon.start()
                console.log(chalk.green('  Watching for changes... (Ctrl+C to stop)\n'))

                // Keep process alive
                process.once('SIGINT', async () => {
                    console.log(chalk.dim('\n  Stopping watcher...'))
                    try {
                        await daemon.stop()
                        process.exit(0)
                    } catch (err: unknown) {
                        const message = err instanceof Error ? err.message : String(err)
                        console.error(chalk.red(`Failed to stop watcher cleanly: ${message}`))
                        process.exit(1)
                    }
                })
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err)
                console.error(chalk.red(`Failed to start watcher: ${message}`))
                process.exit(1)
            }
        })
}
