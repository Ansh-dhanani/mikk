import { Command } from 'commander'
import { registerInitCommand } from './commands/init.js'
import { registerAnalyzeCommand } from './commands/analyze.js'
import { registerDiffCommand } from './commands/diff.js'
import { registerWatchCommand } from './commands/watch.js'
import { registerContractCommands } from './commands/contract/index.js'
import { registerContextCommands } from './commands/context.js'
import { registerIntentCommand } from './commands/intent.js'
import { registerVisualizeCommands } from './commands/visualize.js'
import { registerMcpCommand } from './commands/mcp.js'
import { registerDeadCodeCommand } from './commands/dead-code.js'
import { registerCiCommand } from './commands/ci.js'
import { registerDoctorCommand } from './commands/doctor.js'
import { registerStatsCommand } from './commands/stats.js'

declare const __MIKK_VERSION__: string

// ── Global error handlers ───────────────────────────────────────────
process.on('unhandledRejection', (reason: any) => {
    console.error(`\nUnhandled error: ${reason?.message ?? reason}`)
    if (process.env.MIKK_DEBUG) console.error(reason?.stack ?? reason)
    process.exit(1)
})
process.on('uncaughtException', (err) => {
    console.error(`\nFatal error: ${err.message}`)
    if (process.env.MIKK_DEBUG) console.error(err.stack)
    process.exit(1)
})

const program = new Command()

program
    .name('mikk')
    .description('The structural nervous system of your codebase')
    .version(typeof __MIKK_VERSION__ !== 'undefined' ? __MIKK_VERSION__ : '0.0.0-dev')

// Register all commands
registerInitCommand(program)
registerAnalyzeCommand(program)
registerDiffCommand(program)
registerWatchCommand(program)
registerContractCommands(program)
registerContextCommands(program)
registerIntentCommand(program)
registerVisualizeCommands(program)
registerMcpCommand(program)
registerDeadCodeCommand(program)
registerCiCommand(program)
registerDoctorCommand(program)
registerStatsCommand(program)

program.parse()
