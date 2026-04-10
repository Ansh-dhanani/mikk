import { Command } from 'commander'
import { ErrorHandler, createDefaultErrorListener } from '@getmikk/core'
// Register default error listener once at CLI bootstrap
ErrorHandler.getInstance().addListener(createDefaultErrorListener())


// Force UTF-8 on Windows so Unicode block chars render correctly
if (process.platform === 'win32') {
    try {
        if (typeof (process.stdout as { setEncoding?: unknown }).setEncoding === 'function') (process.stdout as { setEncoding: (enc: string) => void }).setEncoding('utf8')
        if (typeof (process.stderr as { setEncoding?: unknown }).setEncoding === 'function') (process.stderr as { setEncoding: (enc: string) => void }).setEncoding('utf8')
    } catch { /* non-fatal */ }
}

import { registerInitCommand } from './commands/init.js'
import { registerAnalyzeCommand } from './commands/analyze.js'
import { registerDiffCommand } from './commands/diff.js'
import { registerWatchCommand } from './commands/watch.js'
import { registerContractCommands } from './commands/contract/index.js'
import { registerContextCommands } from './commands/context.js'
import { registerIntentCommand } from './commands/intent.js'
import { registerMcpCommand } from './commands/mcp.js'
import { registerDeadCodeCommand } from './commands/dead-code.js'
import { registerCiCommand } from './commands/ci.js'
import { registerDoctorCommand } from './commands/doctor.js'
import { registerStatsCommand } from './commands/stats.js'
import { registerEmbeddingsCommand } from './commands/embeddings.js'
import { registerRemoveCommand } from './commands/remove.js'
import { registerSuggestCommand } from './commands/suggest.js'
import { registerUpdateCommand } from './commands/update.js'
import { registerSearchCommand } from './commands/search.js'
import { banner, sq, gap } from './ui.js'

declare const __MIKK_VERSION__: string

process.on('unhandledRejection', (reason: unknown) => {
    const message = reason instanceof Error ? reason.message : String(reason)
    process.stderr.write(`\nerror  ${message}\n`)
    if (process.env.MIKK_DEBUG && reason instanceof Error) process.stderr.write(reason.stack ?? '')
    process.exit(1)
})
process.on('uncaughtException', (err) => {
    process.stderr.write(`\nfatal  ${err.message}\n`)
    if (process.env.MIKK_DEBUG) process.stderr.write(err.stack ?? '')
    process.exit(1)
})

// ── Show retro banner + command list when invoked with no arguments ───────────
if (process.argv.length <= 2) {
    banner()

    const cmds = [
        ['init',      'Scan project, build dependency graph, generate all artifacts'],
        ['analyze',   'Re-analyze after code changes'],
        ['watch',     'Live watcher daemon — incremental, debounced'],
        ['diff',      'Files changed since last analysis'],
        ['ci',        'Architecture gate — exits non-zero on violations'],
        ['stats',     'Codebase health dashboard'],
        ['doctor',    'Project diagnostic check'],
        ['update',    'Update CLI (stable/latest/specific version)'],
        ['suggest',   'Task-oriented recommendations for next command'],
        ['intent',    'Pre-flight a refactor before writing code'],
        ['context',   'Graph-traced context queries'],
        ['dead-code', 'Detect unused functions'],
        ['search',    'Semantic search using local embeddings'],
        ['mcp',       'Start MCP server (22 tools)'],
        ['visualize', 'Regenerate Mermaid diagrams'],
    ]

    process.stdout.write('  ' + sq.info + '  Commands\n')
    process.stdout.write('  ' + '─'.repeat(50) + '\n')
    for (const [cmd, desc] of cmds) {
        const padded = ('  mikk ' + cmd).padEnd(22)
        process.stdout.write(padded + '  \x1B[2m' + desc + '\x1B[0m\n')
    }
    gap()
    process.stdout.write('  \x1B[2mRun \x1B[0mmikk <command> --help\x1B[2m for options.\x1B[0m\n')
    gap()
    process.exit(0)
}

const program = new Command()

program
    .name('mikk')
    .description('Live architectural context for your AI agent')
    .version(typeof __MIKK_VERSION__ !== 'undefined' ? __MIKK_VERSION__ : '0.0.0-dev')

registerInitCommand(program)
registerAnalyzeCommand(program)
registerDiffCommand(program)
registerWatchCommand(program)
registerContractCommands(program)
registerContextCommands(program)
registerIntentCommand(program)
registerMcpCommand(program)
registerDeadCodeCommand(program)
registerCiCommand(program)
registerDoctorCommand(program)
registerStatsCommand(program)
registerEmbeddingsCommand(program)
registerRemoveCommand(program)
registerSuggestCommand(program)
registerUpdateCommand(program)
registerSearchCommand(program)

program.parse()