import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerTools } from './tools.js'
import { registerResources } from './resources.js'

declare const __MCP_VERSION__: string

const VERSION = typeof __MCP_VERSION__ !== 'undefined' ? __MCP_VERSION__ : '0.0.0-dev'

/**
 * Create a Mikk MCP server instance with all tools and resources registered.
 */
export function createMikkMcpServer(projectRoot: string) {
    const server = new McpServer({
        name: 'mikk',
        version: VERSION,
    })

    registerTools(server, projectRoot)
    registerResources(server, projectRoot)

    return server
}
