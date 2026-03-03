import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

/**
 * Register all MCP resources — structured data an AI assistant can read.
 */
export function registerResources(server: McpServer, projectRoot: string) {

    server.resource(
        'contract',
        'mikk://contract',
        { description: 'The mikk.json contract — declared modules, entry points, constraints, decisions' },
        async () => {
            const content = await safeRead(path.join(projectRoot, 'mikk.json'))
            return {
                contents: [{
                    uri: 'mikk://contract',
                    mimeType: 'application/json',
                    text: content,
                }],
            }
        },
    )

    server.resource(
        'lock',
        'mikk://lock',
        { description: 'The mikk.lock.json — full function/file dependency graph' },
        async () => {
            const content = await safeRead(path.join(projectRoot, 'mikk.lock.json'))
            return {
                contents: [{
                    uri: 'mikk://lock',
                    mimeType: 'application/json',
                    text: content,
                }],
            }
        },
    )

    server.resource(
        'context',
        'mikk://context',
        { description: 'The claude.md AI context file — structured project summary for LLMs' },
        async () => {
            const content = await safeRead(path.join(projectRoot, 'claude.md'))
            return {
                contents: [{
                    uri: 'mikk://context',
                    mimeType: 'text/markdown',
                    text: content,
                }],
            }
        },
    )
}

async function safeRead(filePath: string): Promise<string> {
    try {
        return await fs.readFile(filePath, 'utf-8')
    } catch {
        throw new Error(`File not found: ${filePath}. Run 'mikk init' or 'mikk analyze' first.`)
    }
}
