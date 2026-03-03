import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createMikkMcpServer } from './server.js'

/**
 * Start the MCP server with stdio transport.
 * Reads MIKK_PROJECT_ROOT from env, defaults to cwd.
 */
export async function startStdioServer() {
    const projectRoot = process.env.MIKK_PROJECT_ROOT || process.cwd()
    const server = createMikkMcpServer(projectRoot)
    const transport = new StdioServerTransport()
    await server.connect(transport)
}
