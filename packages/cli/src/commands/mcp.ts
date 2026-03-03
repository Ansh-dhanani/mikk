import type { Command } from 'commander'

/**
 * Register the `mikk mcp` command — starts the MCP server.
 */
export function registerMcpCommand(program: Command) {
    program
        .command('mcp')
        .description('Start the MCP (Model Context Protocol) server for AI assistants')
        .option('-p, --project <path>', 'Project root directory', process.cwd())
        .action(async (opts: { project: string }) => {
            process.env.MIKK_PROJECT_ROOT = opts.project

            // Dynamic import to avoid loading MCP deps when not needed
            const { startStdioServer } = await import('@getmikk/mcp-server')
            await startStdioServer()
        })
}
