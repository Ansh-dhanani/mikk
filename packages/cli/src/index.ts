import { Command } from 'commander'
import { createRequire } from 'node:module'
import { registerInitCommand } from './commands/init.js'
import { registerAnalyzeCommand } from './commands/analyze.js'
import { registerDiffCommand } from './commands/diff.js'
import { registerWatchCommand } from './commands/watch.js'
import { registerContractCommands } from './commands/contract/index.js'
import { registerContextCommands } from './commands/context.js'
import { registerIntentCommand } from './commands/intent.js'
import { registerVisualizeCommands } from './commands/visualize.js'

const require = createRequire(import.meta.url)
const { version } = require('../package.json')

const program = new Command()

program
    .name('mikk')
    .description('The structural nervous system of your codebase')
    .version(version)

// Register all commands
registerInitCommand(program)
registerAnalyzeCommand(program)
registerDiffCommand(program)
registerWatchCommand(program)
registerContractCommands(program)
registerContextCommands(program)
registerIntentCommand(program)
registerVisualizeCommands(program)

program.parse()
