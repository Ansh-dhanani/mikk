import type { Command } from 'commander'
import chalk from 'chalk'
import { WatcherDaemon } from '@mikk/watcher'

export function registerWatchCommand(program: Command) {
    program
        .command('watch')
        .description('Start live file watcher daemon')
        .action(async () => {
            const projectRoot = process.cwd()

            console.log(chalk.bold('🔍 Starting Mikk watcher...\n'))

            const daemon = new WatcherDaemon({
                projectRoot,
                include: ['src/**/*.ts', 'src/**/*.tsx'],
                exclude: ['**/node_modules/**', '**/dist/**', '**/.mikk/**'],
                debounceMs: 100,
            })

            daemon.on((event) => {
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
            })

            try {
                await daemon.start()
                console.log(chalk.green('  Watching for changes... (Ctrl+C to stop)\n'))

                // Keep process alive
                process.on('SIGINT', async () => {
                    console.log(chalk.dim('\n  Stopping watcher...'))
                    await daemon.stop()
                    process.exit(0)
                })
            } catch (err: any) {
                console.error(chalk.red(`Failed to start watcher: ${err.message}`))
                process.exit(1)
            }
        })
}
