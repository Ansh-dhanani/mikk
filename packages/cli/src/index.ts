import { Command } from 'commander'
import { registerInitCommand } from './commands/init.js'
import { registerAnalyzeCommand } from './commands/analyze.js'
import { registerDiffCommand } from './commands/diff.js'
import { registerWatchCommand } from './commands/watch.js'
import { registerContractCommands } from './commands/contract/index.js'
import { registerContextCommands } from './commands/context.js'
import { registerIntentCommand } from './commands/intent.js'
import { registerVisualizeCommands } from './commands/visualize.js'

const program = new Command()

program
    .name('mikk')
    .description('The structural nervous system of your codebase')
    .version(process.env.MIKK_VERSION || '1.0.3')

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
