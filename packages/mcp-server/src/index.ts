export { createMikkMcpServer } from './server.js'
export { startStdioServer } from './stdio.js'

import { startStdioServer } from './stdio.js'

// Auto-start when run directly (not imported)
// Check if this file is the main entry point
const isMain = import.meta.url === `file://${process.argv[1]}` ||
               process.argv[1]?.includes('index.cjs') ||
               process.argv[1]?.includes('index.js')

if (isMain) {
    startStdioServer().catch((err) => {
        console.error('MCP server error:', err)
        process.exit(1)
    })
}
