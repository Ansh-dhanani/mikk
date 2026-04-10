import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import type { Command } from 'commander'
import chalk from 'chalk'

type UpdateChannel = 'stable' | 'latest' | 'version'

function isValidVersion(version: string): boolean {
    return /^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$/.test(version)
}

function resolveTag(channel: UpdateChannel, specificVersion?: string): string {
    if (channel === 'stable') return 'latest'
    if (channel === 'latest') return 'next'
    if (specificVersion && isValidVersion(specificVersion)) return specificVersion
    return 'latest'
}

function runCommand(command: string, args: string[]): Promise<number> {
    return new Promise((resolve) => {
        const proc = spawn(command, args, {
            stdio: 'inherit',
            shell: process.platform === 'win32',
        })
        proc.on('close', (code) => resolve(code ?? 1))
    })
}

function detectPreferredUpdater(): { command: string; argsFor: (pkg: string) => string[] } {
    const ua = process.env.npm_config_user_agent || ''
    if (ua.includes('bun')) {
        return {
            command: 'bun',
            argsFor: (pkg) => ['add', '-g', pkg],
        }
    }

    return {
        command: 'npm',
        argsFor: (pkg) => ['install', '-g', pkg],
    }
}

export function registerUpdateCommand(program: Command) {
    program
        .command('update')
        .description('Update Mikk CLI: stable, latest, or a specific version')
        .option('--channel <stable|latest|version>', 'Update channel')
        .option('--version <x.y.z>', 'Specific version when channel=version')
        .option('--yes', 'Skip confirmation prompts')
        .action(async (options: { channel?: string; version?: string; yes?: boolean }) => {
            try {
            let channel: UpdateChannel | undefined
            if (options.channel === 'stable' || options.channel === 'latest' || options.channel === 'version') {
                channel = options.channel
            }

            let specificVersion = options.version

            if (!channel) {
                const rl = createInterface({ input, output })
                const pick = await rl.question(
                    'Choose update mode:\n' +
                    '1) latest stable\n' +
                    '2) latest (pre-release/canary if available)\n' +
                    '3) specific version\n' +
                    'Select 1/2/3: '
                )
                if (pick.trim() === '1') channel = 'stable'
                else if (pick.trim() === '2') channel = 'latest'
                else channel = 'version'

                if (channel === 'version' && !specificVersion) {
                    specificVersion = (await rl.question('Enter version (example: 2.0.12): ')).trim()
                }
                rl.close()
            }

            if (channel === 'version' && !specificVersion) {
                console.error(chalk.red('Specific version is required when channel=version. Use --version <x.y.z>.'))
                process.exit(1)
            }

            const tag = resolveTag(channel, specificVersion)
            const pkgWithTag = `@getmikk/cli@${tag}`
            const updater = detectPreferredUpdater()
            const args = updater.argsFor(pkgWithTag)

            if (!options.yes) {
                const rl = createInterface({ input, output })
                const confirmation = await rl.question(
                    `Update command: ${updater.command} ${args.join(' ')}\nContinue? (y/N): `
                )
                rl.close()
                if (confirmation.trim().toLowerCase() !== 'y') {
                    console.log(chalk.yellow('Update cancelled.'))
                    return
                }
            }

            console.log(chalk.cyan(`Running: ${updater.command} ${args.join(' ')}`))
            const code = await runCommand(updater.command, args)
            if (code !== 0) {
                console.error(chalk.red('Update failed.'))
                process.exit(code)
            }

            console.log(chalk.green('Mikk CLI updated successfully.'))
            } catch (err) {
                console.error(chalk.red('Update failed:'), err instanceof Error ? err.message : err)
                process.exit(1)
            }
        })
}
