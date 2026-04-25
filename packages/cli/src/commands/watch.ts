import * as path from 'node:path'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import type { Command } from 'commander'
import chalk from 'chalk'
import { WatcherDaemon } from '@getmikk/watcher'
import { ContractReader, detectProjectLanguage, getDiscoveryPatterns } from '@getmikk/core'

function findObsidianScript(projectRoot: string): string | null {
    const candidates = [
        path.join(projectRoot, 'scripts/mikk-to-obsidian.mjs'),
        path.join(projectRoot, 'mikk-to-obsidian.mjs'),
    ]
    for (const p of candidates) {
        if (existsSync(p)) return p
    }
    return null
}

async function updateObsidianVault(projectRoot: string) {
    const scriptPath = findObsidianScript(projectRoot)
    if (!scriptPath) return
    console.log(chalk.dim('  → Syncing Obsidian vault...'))
    return new Promise((resolve) => {
        let errOut = ''
        const child = spawn('node', [scriptPath, '--all-fns'], {
            cwd: projectRoot,
            stdio: ['ignore', 'ignore', 'pipe'],
        })
        child.stderr?.on('data', (d: Buffer) => { errOut += d.toString() })
        child.on('close', (code) => {
            if (code === 0) {
                console.log(chalk.green('  → Obsidian vault synced'))
            } else {
                const hint = errOut.trim().split('\n')[0] ?? ''
                console.log(chalk.yellow(`  → Obsidian vault sync failed${hint ? ': ' + hint : ''}`))
            }
            resolve(undefined)
        })
        child.on('error', (e: Error) => {
            console.log(chalk.yellow(`  → Obsidian vault sync error: ${e.message}`))
            resolve(undefined)
        })
    })
}

export function registerWatchCommand(program: Command) {
    program
        .command('watch')
        .description('Watch for file changes and sync lock file automatically (daemon)')
        .option('--obsidian', 'Also sync Obsidian vault on changes')
        .addHelpText('after',
            `\nExamples:\n` +
            `  mikk watch              Start the watcher daemon\n` +
            `  mikk watch --obsidian  Also sync Obsidian vault on changes\n` +
            `\nThe watcher monitors file changes with 100ms debounce and auto-updates\n` +
            `the lock file. Press Ctrl+C to stop.\n`)
        .action(async (opts) => {
            const projectRoot = process.cwd()
            const syncObsidian = !!opts?.obsidian

            // Pre-flight: make sure the project is initialized
            try {
                const contractReader = new ContractReader()
                await contractReader.read(path.join(projectRoot, 'mikk.json'))
            } catch {
                console.error(chalk.red('No mikk.json found. Run "mikk init" first.'))
                process.exit(1)
            }

            // Initial sync on startup
            if (syncObsidian) {
                console.log(chalk.dim('  → Initial Obsidian vault sync...'))
                await updateObsidianVault(projectRoot)
            }

            console.log(chalk.bold('🔍 Starting Mikk watcher...' +
                (syncObsidian ? ' with Obsidian sync' : '') + '\n'))

            const language = await detectProjectLanguage(projectRoot)
            const { patterns, ignore } = getDiscoveryPatterns(language)

            const daemon = new WatcherDaemon({
                projectRoot,
                include: patterns,
                exclude: ignore,
                debounceMs: 100,
            })

            daemon.on(async (event) => {
                try {
                    switch (event.type) {
                        case 'file:changed':
                            console.log(chalk.dim(`  ${event.data.type}: ${event.data.path}`))
                            break
                        case 'graph:updated':
                            console.log(chalk.green(`  ✓ Graph updated (${event.data.changedNodes.length} changed, ${event.data.impactedNodes.length} impacted)`))
                            if (syncObsidian) {
                                await updateObsidianVault(projectRoot)
                            }
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
