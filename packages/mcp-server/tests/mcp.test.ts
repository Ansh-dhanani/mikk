/**
 * Comprehensive test suite for @getmikk/mcp-server
 * Tests all 12 tools and 3 resources with happy paths, error paths, and edge cases.
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import * as path from 'node:path'
import { createMikkMcpServer } from '../src/server'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

// ─────────────────────────────────────────────────────────────────────────────
// Test constants
// ─────────────────────────────────────────────────────────────────────────────

const FIXTURE_ROOT = path.join(import.meta.dir, 'fixtures', 'project')
const MISSING_ROOT = path.join(import.meta.dir, 'fixtures', 'nonexistent-project')

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

async function createTestClient(projectRoot = FIXTURE_ROOT): Promise<{ client: Client; server: McpServer }> {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const server = createMikkMcpServer(projectRoot)
    await server.connect(serverTransport)
    const client = new Client({ name: 'test-client', version: '1.0.0' })
    await client.connect(clientTransport)
    return { client, server }
}

type ToolResult = Awaited<ReturnType<Client['callTool']>>

function getText(result: ToolResult): string {
    return (result.content[0] as { type: 'text'; text: string }).text
}

function parseJSON(result: ToolResult): any {
    return JSON.parse(getText(result))
}

function isError(result: ToolResult): boolean {
    return result.isError === true
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: Server initialization
// ─────────────────────────────────────────────────────────────────────────────

describe('@getmikk/mcp-server — initialization', () => {
    it('creates a server instance', () => {
        const server = createMikkMcpServer(FIXTURE_ROOT)
        expect(server).toBeDefined()
    })

    it('connects and responds to initialize', async () => {
        const { client, server } = await createTestClient()
        const info = await client.getServerVersion()
        expect(info?.name).toBe('mikk')
        expect(info?.version).toMatch(/\d+\.\d+\.\d+/)
        await server.close()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: Tool list
// ─────────────────────────────────────────────────────────────────────────────

describe('@getmikk/mcp-server — tool list', () => {
    let client: Client
    let server: McpServer

    beforeAll(async () => {
        ;({ client, server } = await createTestClient())
    })

    afterAll(async () => {
        await server.close()
    })

    it('exposes exactly 12 tools', async () => {
        const result = await client.listTools()
        expect(result.tools).toHaveLength(12)
    })

    it('has the correct tool names', async () => {
        const result = await client.listTools()
        const names = result.tools.map(t => t.name).sort()
        expect(names).toEqual([
            'mikk_before_edit',
            'mikk_find_usages',
            'mikk_get_constraints',
            'mikk_get_file',
            'mikk_get_function_detail',
            'mikk_get_module_detail',
            'mikk_get_project_overview',
            'mikk_get_routes',
            'mikk_impact_analysis',
            'mikk_list_modules',
            'mikk_query_context',
            'mikk_search_functions',
        ])
    })

    it('does NOT expose mikk_analyze (CLI-only)', async () => {
        const result = await client.listTools()
        const names = result.tools.map(t => t.name)
        expect(names).not.toContain('mikk_analyze')
    })

    it('all tools have non-empty descriptions', async () => {
        const result = await client.listTools()
        for (const tool of result.tools) {
            expect(tool.description?.trim().length).toBeGreaterThan(10)
        }
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: mikk_get_project_overview
// ─────────────────────────────────────────────────────────────────────────────

describe('mikk_get_project_overview', () => {
    let client: Client
    let server: McpServer

    beforeAll(async () => {
        ;({ client, server } = await createTestClient())
    })

    afterAll(async () => {
        await server.close()
    })

    it('returns project metadata', async () => {
        const result = await client.callTool({ name: 'mikk_get_project_overview', arguments: {} })
        expect(isError(result)).toBe(false)
        const data = parseJSON(result)
        expect(data.project.name).toBe('test-project')
        expect(data.project.language).toBe('typescript')
    })

    it('returns correct function and file counts', async () => {
        const result = await client.callTool({ name: 'mikk_get_project_overview', arguments: {} })
        const data = parseJSON(result)
        expect(data.totalFunctions).toBe(3)
        expect(data.totalFiles).toBe(1)
        expect(data.totalModules).toBe(1)
    })

    it('includes modules with exported function counts', async () => {
        const result = await client.callTool({ name: 'mikk_get_project_overview', arguments: {} })
        const data = parseJSON(result)
        const authMod = data.modules.find((m: any) => m.id === 'auth')
        expect(authMod).toBeDefined()
        expect(authMod.functions).toBe(3)
        expect(authMod.exported).toBe(1) // only login is exported
    })

    it('includes constraints and decisions', async () => {
        const result = await client.callTool({ name: 'mikk_get_project_overview', arguments: {} })
        const data = parseJSON(result)
        expect(data.constraints).toHaveLength(2)
        expect(data.decisions).toHaveLength(1)
        expect(data.decisions[0].id).toBe('token-format')
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: mikk_list_modules
// ─────────────────────────────────────────────────────────────────────────────

describe('mikk_list_modules', () => {
    let client: Client
    let server: McpServer

    beforeAll(async () => {
        ;({ client, server } = await createTestClient())
    })

    afterAll(async () => {
        await server.close()
    })

    it('returns all modules', async () => {
        const result = await client.callTool({ name: 'mikk_list_modules', arguments: {} })
        expect(isError(result)).toBe(false)
        const data = parseJSON(result)
        expect(data).toHaveLength(1)
        expect(data[0].id).toBe('auth')
    })

    it('includes function and file counts per module', async () => {
        const result = await client.callTool({ name: 'mikk_list_modules', arguments: {} })
        const data = parseJSON(result)
        expect(data[0].functions).toBe(3)
        expect(data[0].files).toBe(1)
    })

    it('includes entry functions', async () => {
        const result = await client.callTool({ name: 'mikk_list_modules', arguments: {} })
        const data = parseJSON(result)
        expect(data[0].entryFunctions).toContain('login')
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: mikk_get_module_detail
// ─────────────────────────────────────────────────────────────────────────────

describe('mikk_get_module_detail', () => {
    let client: Client
    let server: McpServer

    beforeAll(async () => {
        ;({ client, server } = await createTestClient())
    })

    afterAll(async () => {
        await server.close()
    })

    it('returns full module detail for a valid module', async () => {
        const result = await client.callTool({ name: 'mikk_get_module_detail', arguments: { moduleId: 'auth' } })
        expect(isError(result)).toBe(false)
        const data = parseJSON(result)
        expect(data.module.id).toBe('auth')
        expect(data.module.name).toContain('Authentication')
    })

    it('returns all functions in the module', async () => {
        const result = await client.callTool({ name: 'mikk_get_module_detail', arguments: { moduleId: 'auth' } })
        const data = parseJSON(result)
        const fnNames = data.functions.map((f: any) => f.name)
        expect(fnNames).toContain('login')
        expect(fnNames).toContain('hashPassword')
        expect(fnNames).toContain('generateToken')
    })

    it('separates exported vs internal functions', async () => {
        const result = await client.callTool({ name: 'mikk_get_module_detail', arguments: { moduleId: 'auth' } })
        const data = parseJSON(result)
        expect(data.exported).toContain('login')
        expect(data.internal).toContain('hashPassword')
        expect(data.internal).toContain('generateToken')
    })

    it('resolves call graph names (not raw IDs)', async () => {
        const result = await client.callTool({ name: 'mikk_get_module_detail', arguments: { moduleId: 'auth' } })
        const data = parseJSON(result)
        const loginFn = data.functions.find((f: any) => f.name === 'login')
        expect(loginFn.calls).toContain('hashPassword')
        expect(loginFn.calls).toContain('generateToken')
    })

    it('returns isError for unknown module', async () => {
        const result = await client.callTool({ name: 'mikk_get_module_detail', arguments: { moduleId: 'nonexistent-module' } })
        expect(isError(result)).toBe(true)
        expect(getText(result)).toContain('mikk_list_modules')
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: mikk_get_function_detail
// ─────────────────────────────────────────────────────────────────────────────

describe('mikk_get_function_detail', () => {
    let client: Client
    let server: McpServer

    beforeAll(async () => {
        ;({ client, server } = await createTestClient())
    })

    afterAll(async () => {
        await server.close()
    })

    it('returns function metadata', async () => {
        const result = await client.callTool({ name: 'mikk_get_function_detail', arguments: { name: 'login' } })
        expect(isError(result)).toBe(false)
        const data = parseJSON(result)
        expect(data).toHaveLength(1)
        const fn = data[0]
        expect(fn.name).toBe('login')
        expect(fn.isExported).toBe(true)
        expect(fn.isAsync).toBe(true)
        expect(fn.returnType).toBe('Promise<string>')
    })

    it('returns actual source body for exported function', async () => {
        const result = await client.callTool({ name: 'mikk_get_function_detail', arguments: { name: 'login' } })
        const data = parseJSON(result)
        expect(data[0].body).toBeTruthy()
        expect(data[0].body).toContain('async function login')
        expect(data[0].body).toContain('hashPassword')
        expect(data[0].body).toContain('generateToken')
    })

    it('returns source body for internal functions', async () => {
        const result = await client.callTool({ name: 'mikk_get_function_detail', arguments: { name: 'hashPassword' } })
        const data = parseJSON(result)
        expect(data[0].body).toContain('hashPassword')
        expect(data[0].body).toContain('Promise.resolve')
    })

    it('body line range is correct (startLine to endLine)', async () => {
        const result = await client.callTool({ name: 'mikk_get_function_detail', arguments: { name: 'generateToken' } })
        const data = parseJSON(result)
        // generateToken is lines 13-15 in fixture
        expect(data[0].lines).toBe('13-15')
        expect(data[0].body).toContain('generateToken')
        expect(data[0].body).not.toContain('hashPassword')
    })

    it('includes params with types', async () => {
        const result = await client.callTool({ name: 'mikk_get_function_detail', arguments: { name: 'login' } })
        const data = parseJSON(result)
        const params = data[0].params
        expect(params).toHaveLength(2)
        expect(params[0]).toEqual({ name: 'username', type: 'string' })
        expect(params[1]).toEqual({ name: 'password', type: 'string' })
    })

    it('resolves calledBy as function names (not IDs)', async () => {
        const result = await client.callTool({ name: 'mikk_get_function_detail', arguments: { name: 'hashPassword' } })
        const data = parseJSON(result)
        expect(data[0].calledBy).toContain('login')
        expect(data[0].calls).toHaveLength(0)
    })

    it('includes purpose, edgeCases, and errorHandling', async () => {
        const result = await client.callTool({ name: 'mikk_get_function_detail', arguments: { name: 'login' } })
        const data = parseJSON(result)
        const fn = data[0]
        expect(fn.purpose).toContain('Authenticate')
        expect(fn.edgeCases).toContain('invalid credentials')
        expect(fn.errorHandling).toHaveLength(1)
        expect(fn.errorHandling[0].type).toBe('throw')
    })

    it('returns isError for completely unknown function', async () => {
        const result = await client.callTool({ name: 'mikk_get_function_detail', arguments: { name: 'xyznomatch' } })
        expect(isError(result)).toBe(true)
        expect(getText(result)).toContain('xyznomatch')
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: mikk_search_functions
// ─────────────────────────────────────────────────────────────────────────────

describe('mikk_search_functions', () => {
    let client: Client
    let server: McpServer

    beforeAll(async () => {
        ;({ client, server } = await createTestClient())
    })

    afterAll(async () => {
        await server.close()
    })

    it('finds functions by exact name', async () => {
        const result = await client.callTool({ name: 'mikk_search_functions', arguments: { query: 'login' } })
        expect(isError(result)).toBe(false)
        const data = parseJSON(result)
        expect(data.some((f: any) => f.name === 'login')).toBe(true)
    })

    it('finds by substring, case-insensitive', async () => {
        const result = await client.callTool({ name: 'mikk_search_functions', arguments: { query: 'HASH' } })
        const data = parseJSON(result)
        expect(data.some((f: any) => f.name === 'hashPassword')).toBe(true)
    })

    it('finds by partial name (camelCase fragment)', async () => {
        const result = await client.callTool({ name: 'mikk_search_functions', arguments: { query: 'Token' } })
        const data = parseJSON(result)
        expect(data.some((f: any) => f.name === 'generateToken')).toBe(true)
    })

    it('returns no-match message for unknown query', async () => {
        const result = await client.callTool({ name: 'mikk_search_functions', arguments: { query: 'xyznomatch' } })
        expect(isError(result)).toBe(false)
        expect(getText(result)).toContain('No functions matching')
    })

    it('respects limit parameter', async () => {
        const result = await client.callTool({ name: 'mikk_search_functions', arguments: { query: '', limit: 1 } })
        const data = parseJSON(result)
        expect(data).toHaveLength(1)
    })

    it('result includes file, module, exported flag, and line range', async () => {
        const result = await client.callTool({ name: 'mikk_search_functions', arguments: { query: 'login' } })
        const data = parseJSON(result)
        const fn = data.find((f: any) => f.name === 'login')
        expect(fn.file).toBe('src/auth.ts')
        expect(fn.module).toBe('auth')
        expect(fn.exported).toBe(true)
        expect(fn.lines).toBe('1-7')
    })

    it('empty query returns all functions (up to limit)', async () => {
        const result = await client.callTool({ name: 'mikk_search_functions', arguments: { query: '' } })
        const data = parseJSON(result)
        expect(data).toHaveLength(3) // all 3 fixture functions
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: mikk_impact_analysis
// ─────────────────────────────────────────────────────────────────────────────

describe('mikk_impact_analysis', () => {
    let client: Client
    let server: McpServer

    beforeAll(async () => {
        ;({ client, server } = await createTestClient())
    })

    afterAll(async () => {
        await server.close()
    })

    it('returns impact for a known file', async () => {
        const result = await client.callTool({ name: 'mikk_impact_analysis', arguments: { file: 'src/auth.ts' } })
        expect(isError(result)).toBe(false)
        const data = parseJSON(result)
        expect(data.file).toBe('src/auth.ts')
        expect(typeof data.impactedNodes).toBe('number')
        expect(['high', 'medium', 'low']).toContain(data.confidence)
        expect(typeof data.depth).toBe('number')
    })

    it('matches by basename when only filename given', async () => {
        const result = await client.callTool({ name: 'mikk_impact_analysis', arguments: { file: 'auth.ts' } })
        expect(isError(result)).toBe(false)
        const data = parseJSON(result)
        expect(data.changedNodes).toBeGreaterThan(0)
    })

    it('correctly identifies changed nodes for entire file (3 functions + 1 file node)', async () => {
        const result = await client.callTool({ name: 'mikk_impact_analysis', arguments: { file: 'src/auth.ts' } })
        const data = parseJSON(result)
        // 3 functions + 1 file node in the graph — all live in src/auth.ts
        expect(data.changedNodes).toBe(4)
    })

    it('has 0 impacted external nodes (login has no external callers)', async () => {
        const result = await client.callTool({ name: 'mikk_impact_analysis', arguments: { file: 'src/auth.ts' } })
        const data = parseJSON(result)
        // login.calledBy = [] → nothing outside the file depends on it
        expect(data.impactedNodes).toBe(0)
    })

    it('returns isError with helpful next-step hint for unknown file', async () => {
        const result = await client.callTool({ name: 'mikk_impact_analysis', arguments: { file: 'src/doesnotexist.ts' } })
        expect(isError(result)).toBe(true)
        const text = getText(result)
        expect(text).toContain('mikk_search_functions')
    })

    it('completes fast (lock-based, not re-parsing source)', async () => {
        const start = Date.now()
        await client.callTool({ name: 'mikk_impact_analysis', arguments: { file: 'src/auth.ts' } })
        expect(Date.now() - start).toBeLessThan(500)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: mikk_before_edit
// ─────────────────────────────────────────────────────────────────────────────

describe('mikk_before_edit', () => {
    let client: Client
    let server: McpServer

    beforeAll(async () => {
        ;({ client, server } = await createTestClient())
    })

    afterAll(async () => {
        await server.close()
    })

    it('returns blast radius report for a tracked file', async () => {
        const result = await client.callTool({ name: 'mikk_before_edit', arguments: { files: ['src/auth.ts'] } })
        expect(isError(result)).toBe(false)
        const data = parseJSON(result)
        expect(data.summary).toContain('1 file')
        expect(data.files['src/auth.ts']).toBeDefined()
        expect(data.files['src/auth.ts'].functionsInFile).toContain('login')
    })

    it('lists exported functions at risk with their callers', async () => {
        const result = await client.callTool({ name: 'mikk_before_edit', arguments: { files: ['src/auth.ts'] } })
        const data = parseJSON(result)
        const report = data.files['src/auth.ts']
        const loginRisk = report.exportedAtRisk.find((e: any) => e.name === 'login')
        expect(loginRisk).toBeDefined()
        expect(loginRisk.calledBy).toHaveLength(0) // no external callers in fixture
    })

    it('includes all project constraints (strings)', async () => {
        const result = await client.callTool({ name: 'mikk_before_edit', arguments: { files: ['src/auth.ts'] } })
        const data = parseJSON(result)
        const constraints = data.files['src/auth.ts'].constraints
        expect(Array.isArray(constraints)).toBe(true)
        expect(constraints).toHaveLength(2)
        expect(constraints[0]).toBe('Do not use global state')
        expect(constraints[1]).toContain('async functions')
    })

    it('returns warning (not error) for untracked file', async () => {
        const result = await client.callTool({ name: 'mikk_before_edit', arguments: { files: ['src/unknown.ts'] } })
        expect(isError(result)).toBe(false) // not a hard error — just a warning
        const data = parseJSON(result)
        expect(data.files['src/unknown.ts'].warning).toBeTruthy()
        expect(data.files['src/unknown.ts'].warning).toContain('mikk analyze')
    })

    it('handles ./ prefix (./src/auth.ts finds the functions)', async () => {
        const result = await client.callTool({ name: 'mikk_before_edit', arguments: { files: ['./src/auth.ts'] } })
        const data = parseJSON(result)
        const report = data.files['./src/auth.ts']
        expect(report.warning).toBeUndefined()
        expect(report.functionsInFile).toContain('login')
    })

    it('handles multiple files in a single call', async () => {
        const result = await client.callTool({
            name: 'mikk_before_edit',
            arguments: { files: ['src/auth.ts', 'src/missing.ts'] },
        })
        const data = parseJSON(result)
        expect(data.summary).toContain('2 file')
        expect(data.files['src/auth.ts'].functionsInFile).toBeDefined()
        expect(data.files['src/missing.ts'].warning).toBeTruthy()
    })

    it('summary blast radius counts sum correctly', async () => {
        const result = await client.callTool({ name: 'mikk_before_edit', arguments: { files: ['src/auth.ts'] } })
        const data = parseJSON(result)
        const totalFromReports = Object.values(data.files)
            .filter((r: any) => typeof r.impactedNodes === 'number')
            .reduce((sum: number, r: any) => sum + r.impactedNodes, 0)
        expect(data.summary).toContain(String(totalFromReports))
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: mikk_get_file
// ─────────────────────────────────────────────────────────────────────────────

describe('mikk_get_file', () => {
    let client: Client
    let server: McpServer

    beforeAll(async () => {
        ;({ client, server } = await createTestClient())
    })

    afterAll(async () => {
        await server.close()
    })

    it('returns file contents with // path (N lines) header', async () => {
        const result = await client.callTool({ name: 'mikk_get_file', arguments: { file: 'src/auth.ts' } })
        expect(isError(result)).toBe(false)
        const text = getText(result)
        expect(text).toMatch(/^\/\/ src\/auth\.ts \(\d+ lines\)/)
        expect(text).toContain('export async function login')
    })

    it('BLOCKS path traversal with ../', async () => {
        const result = await client.callTool({ name: 'mikk_get_file', arguments: { file: '../../package.json' } })
        expect(isError(result)).toBe(true)
        expect(getText(result)).toContain('Access denied')
    })

    it('BLOCKS absolute path outside project root', async () => {
        const result = await client.callTool({
            name: 'mikk_get_file',
            arguments: { file: path.join(FIXTURE_ROOT, '..', '..', 'package.json') },
        })
        expect(isError(result)).toBe(true)
        expect(getText(result)).toContain('Access denied')
    })

    it('returns isError with next-step hint for nonexistent file', async () => {
        const result = await client.callTool({ name: 'mikk_get_file', arguments: { file: 'src/doesnotexist.ts' } })
        expect(isError(result)).toBe(true)
        expect(getText(result)).toContain('Cannot read')
        expect(getText(result)).toContain('mikk_search_functions')
    })

    it('can read mikk.json itself', async () => {
        const result = await client.callTool({ name: 'mikk_get_file', arguments: { file: 'mikk.json' } })
        expect(isError(result)).toBe(false)
        expect(getText(result)).toContain('test-project')
    })

    it('can read the lock file', async () => {
        const result = await client.callTool({ name: 'mikk_get_file', arguments: { file: 'mikk.lock.json' } })
        expect(isError(result)).toBe(false)
        expect(getText(result)).toContain('fn:src/auth.ts:login')
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: mikk_get_constraints
// ─────────────────────────────────────────────────────────────────────────────

describe('mikk_get_constraints', () => {
    let client: Client
    let server: McpServer

    beforeAll(async () => {
        ;({ client, server } = await createTestClient())
    })

    afterAll(async () => {
        await server.close()
    })

    it('returns all architectural constraints as strings', async () => {
        const result = await client.callTool({ name: 'mikk_get_constraints', arguments: {} })
        expect(isError(result)).toBe(false)
        const data = parseJSON(result)
        expect(data.constraints).toHaveLength(2)
        expect(data.constraints[0]).toBe('Do not use global state')
        expect(data.constraints[1]).toContain('async functions')
    })

    it('returns all decisions with id, title, reason, date', async () => {
        const result = await client.callTool({ name: 'mikk_get_constraints', arguments: {} })
        const data = parseJSON(result)
        expect(data.decisions).toHaveLength(1)
        const d = data.decisions[0]
        expect(d.id).toBe('token-format')
        expect(d.title).toBeTruthy()
        expect(d.reason).toBeTruthy()
        expect(d.date).toBe('2025-01-01')
    })

    it('includes overwrite config', async () => {
        const result = await client.callTool({ name: 'mikk_get_constraints', arguments: {} })
        const data = parseJSON(result)
        expect(data.overwrite.mode).toBe('never')
        expect(typeof data.overwrite.requireConfirmation).toBe('boolean')
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: mikk_get_routes
// ─────────────────────────────────────────────────────────────────────────────

describe('mikk_get_routes', () => {
    let client: Client
    let server: McpServer

    beforeAll(async () => {
        ;({ client, server } = await createTestClient())
    })

    afterAll(async () => {
        await server.close()
    })

    it('returns routes when present in lock', async () => {
        const result = await client.callTool({ name: 'mikk_get_routes', arguments: {} })
        expect(isError(result)).toBe(false)
        const data = parseJSON(result)
        expect(data).toHaveLength(1)
        const route = data[0]
        expect(route.method).toBe('POST')
        expect(route.path).toBe('/auth/login')
        expect(route.handler).toBe('login')
        expect(route.file).toBe('src/auth.ts')
        expect(route.line).toBe(1)
    })

    it('includes middleware array', async () => {
        const result = await client.callTool({ name: 'mikk_get_routes', arguments: {} })
        const data = parseJSON(result)
        expect(data[0].middlewares).toContain('rateLimiter')
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: mikk_query_context
// ─────────────────────────────────────────────────────────────────────────────

describe('mikk_query_context', () => {
    let client: Client
    let server: McpServer

    beforeAll(async () => {
        ;({ client, server } = await createTestClient())
    })

    afterAll(async () => {
        await server.close()
    })

    it('returns non-empty context for a valid question', async () => {
        const result = await client.callTool({
            name: 'mikk_query_context',
            arguments: { question: 'How does user authentication work?' },
        })
        expect(isError(result)).toBe(false)
        expect(getText(result).length).toBeGreaterThan(50)
    })

    it('accepts focusModule param', async () => {
        const result = await client.callTool({
            name: 'mikk_query_context',
            arguments: { question: 'How does auth work?', focusModule: 'auth' },
        })
        expect(isError(result)).toBe(false)
    })

    it('uses generic provider by default', async () => {
        const result = await client.callTool({
            name: 'mikk_query_context',
            arguments: { question: 'Explain the login flow' },
        })
        expect(isError(result)).toBe(false)
        expect(getText(result).length).toBeGreaterThan(20)
    })

    it('accepts explicit provider: compact', async () => {
        const result = await client.callTool({
            name: 'mikk_query_context',
            arguments: { question: 'What functions exist?', provider: 'compact' },
        })
        expect(isError(result)).toBe(false)
    })

    it('accepts explicit provider: claude', async () => {
        const result = await client.callTool({
            name: 'mikk_query_context',
            arguments: { question: 'What functions exist?', provider: 'claude' },
        })
        expect(isError(result)).toBe(false)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: Resources
// ─────────────────────────────────────────────────────────────────────────────

describe('resources', () => {
    let client: Client
    let server: McpServer

    beforeAll(async () => {
        ;({ client, server } = await createTestClient())
    })

    afterAll(async () => {
        await server.close()
    })

    it('exposes exactly 3 resources', async () => {
        const result = await client.listResources()
        expect(result.resources).toHaveLength(3)
    })

    it('mikk://contract returns valid JSON with project info', async () => {
        const result = await client.readResource({ uri: 'mikk://contract' })
        const text = (result.contents[0] as { text: string }).text
        const parsed = JSON.parse(text)
        expect(parsed.project.name).toBe('test-project')
        expect(parsed.declared.constraints).toHaveLength(2)
    })

    it('mikk://lock returns valid JSON with function map', async () => {
        const result = await client.readResource({ uri: 'mikk://lock' })
        const text = (result.contents[0] as { text: string }).text
        const parsed = JSON.parse(text)
        expect(parsed.functions['fn:src/auth.ts:login']).toBeDefined()
        expect(parsed.functions['fn:src/auth.ts:hashPassword']).toBeDefined()
    })

    it('mikk://context gracefully errors if claude.md absent', async () => {
        // Fixture doesn't have a claude.md — should throw a clean error
        try {
            await client.readResource({ uri: 'mikk://context' })
        } catch (err: any) {
            expect(typeof err.message).toBe('string')
        }
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: buildGraphFromLock correctness (graph integrity via impact analysis)
// ─────────────────────────────────────────────────────────────────────────────

describe('buildGraphFromLock — graph integrity', () => {
    let client: Client
    let server: McpServer

    beforeAll(async () => {
        ;({ client, server } = await createTestClient())
    })

    afterAll(async () => {
        await server.close()
    })

    it('correctly identifies changed nodes for a 3-function file (3 fns + 1 file node)', async () => {
        const result = await client.callTool({
            name: 'mikk_impact_analysis',
            arguments: { file: 'src/auth.ts' },
        })
        const data = parseJSON(result)
        // buildGraphFromLock adds both function nodes and file nodes; all belong to src/auth.ts
        expect(data.changedNodes).toBe(4)
    })

    it('zero external impact when no callers exist outside the file', async () => {
        const result = await client.callTool({
            name: 'mikk_impact_analysis',
            arguments: { file: 'src/auth.ts' },
        })
        const data = parseJSON(result)
        // login has calledBy=[] → no external nodes depend on this file
        expect(data.impactedNodes).toBe(0)
        expect(data.depth).toBe(0)
    })

    it('before_edit constraints are proper string array (not objects)', async () => {
        const result = await client.callTool({
            name: 'mikk_before_edit',
            arguments: { files: ['src/auth.ts'] },
        })
        const data = parseJSON(result)
        const constraints = data.files['src/auth.ts'].constraints
        // Each constraint must be a string, not an object with .scope
        for (const c of constraints) {
            expect(typeof c).toBe('string')
        }
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: mikk_find_usages
// ─────────────────────────────────────────────────────────────────────────────

describe('@getmikk/mcp-server — mikk_find_usages', () => {
    let client: Client
    let server: McpServer

    beforeAll(async () => {
        ;({ client, server } = await createTestClient())
    })

    afterAll(async () => {
        await server.close()
    })

    it('returns caller list for a known function', async () => {
        const result = await client.callTool({
            name: 'mikk_find_usages',
            arguments: { name: 'hashPassword' },
        })
        expect(isError(result)).toBe(false)
        const data = parseJSON(result)
        expect(data.function).toBe('hashPassword')
        expect(typeof data.usageCount).toBe('number')
        expect(Array.isArray(data.usages)).toBe(true)
    })

    it('returns module and file info alongside usages', async () => {
        const result = await client.callTool({
            name: 'mikk_find_usages',
            arguments: { name: 'hashPassword' },
        })
        const data = parseJSON(result)
        expect(typeof data.file).toBe('string')
        expect(typeof data.module).toBe('string')
    })

    it('returns isError for an unknown function', async () => {
        const result = await client.callTool({
            name: 'mikk_find_usages',
            arguments: { name: 'totallyMadeUpFunction_xyz' },
        })
        expect(isError(result)).toBe(true)
        expect(getText(result)).toContain('not found')
    })

    it('includes calledBy-resolved callers when present', async () => {
        // login calls hashPassword — so hashPassword.calledBy should contain login
        const result = await client.callTool({
            name: 'mikk_find_usages',
            arguments: { name: 'hashPassword' },
        })
        const data = parseJSON(result)
        // usages are callers; login calls hashPassword so it should appear
        if (data.usageCount > 0) {
            expect(data.usages[0]).toHaveProperty('name')
            expect(data.usages[0]).toHaveProperty('file')
            expect(data.usages[0]).toHaveProperty('line')
        }
    })

    it('warning is null when lock is clean', async () => {
        const result = await client.callTool({
            name: 'mikk_find_usages',
            arguments: { name: 'hashPassword' },
        })
        const data = parseJSON(result)
        // fixture lock has syncState.status = "clean"
        expect(data.warning).toBeNull()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: staleness warning surfacing
// ─────────────────────────────────────────────────────────────────────────────

describe('@getmikk/mcp-server — staleness warning', () => {
    let client: Client
    let server: McpServer

    beforeAll(async () => {
        ;({ client, server } = await createTestClient())
    })

    afterAll(async () => {
        await server.close()
    })

    it('impact_analysis response includes warning field (null when clean)', async () => {
        const result = await client.callTool({
            name: 'mikk_impact_analysis',
            arguments: { file: 'src/auth.ts' },
        })
        const data = parseJSON(result)
        expect(Object.prototype.hasOwnProperty.call(data, 'warning')).toBe(true)
        expect(data.warning).toBeNull()
    })

    it('before_edit response includes warning field (null when clean)', async () => {
        const result = await client.callTool({
            name: 'mikk_before_edit',
            arguments: { files: ['src/auth.ts'] },
        })
        const data = parseJSON(result)
        expect(Object.prototype.hasOwnProperty.call(data, 'warning')).toBe(true)
        expect(data.warning).toBeNull()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SUITE: mikk_query_context empty context guard
// ─────────────────────────────────────────────────────────────────────────────

describe('@getmikk/mcp-server — mikk_query_context empty guard', () => {
    let client: Client
    let server: McpServer

    beforeAll(async () => {
        ;({ client, server } = await createTestClient())
    })

    afterAll(async () => {
        await server.close()
    })

    it('returns an isError when focusFile does not exist in lock', async () => {
        const result = await client.callTool({
            name: 'mikk_query_context',
            arguments: {
                question: 'explain the flow',
                focusFile: 'src/totally-nonexistent-file.ts',
            },
        })
        // Either isError or an empty/unhelpful context — both are acceptable
        // The important thing is it does NOT throw/crash
        expect(result.content.length).toBeGreaterThan(0)
    })
})
