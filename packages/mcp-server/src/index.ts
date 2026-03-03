export { createMikkMcpServer } from './server.js'
export { startStdioServer } from './stdio.js'

import { startStdioServer } from './stdio.js'

// Auto-start when loaded as a standalone process
startStdioServer()
