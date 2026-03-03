import { describe, it, expect } from 'bun:test'
import { createMikkMcpServer } from '../src/server'

describe('@getmikk/mcp-server', () => {
    it('creates an MCP server instance', () => {
        const server = createMikkMcpServer(process.cwd())
        expect(server).toBeDefined()
    })
})
