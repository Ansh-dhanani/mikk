/**
 * Mikk Accuracy Testing
 * Tests actual accuracy of Mikk commands and MCP tools
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { spawn } from 'node:child_process'

const PROJECT_ROOT = process.cwd()
const MIKK_CLI = path.join(PROJECT_ROOT, 'packages/cli/dist/index.js')
const FIXTURE = path.join(PROJECT_ROOT, 'benchmarks/fixtures/ts-express-api')

async function runCommand(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve) => {
        const proc = spawn('node', [MIKK_CLI, ...args], {
            cwd: FIXTURE,
            encoding: 'utf8',
        })
        let stdout = ''
        let stderr = ''
        proc.stdout?.on('data', (d) => { stdout += d })
        proc.stderr?.on('data', (d) => { stderr += d })
        proc.on('close', (code) => resolve({ stdout, stderr, code: code || 0 }))
        proc.on('error', (e) => resolve({ stdout, stderr: String(e), code: 1 }))
    })
}

class McpClient {
    private proc: any = null
    private buffer = ''
    private requestId = 0
    private pending = new Map()
    private initialized = false

    async start() {
        return new Promise((resolve, reject) => {
            this.proc = spawn('node', [MIKK_CLI, 'mcp', 'start', '--project', FIXTURE], {
                cwd: PROJECT_ROOT,
                stdio: ['pipe', 'pipe', 'pipe'],
            })

            this.proc.stdout?.on('data', (data: Buffer) => {
                this.buffer += data.toString()
                const lines = this.buffer.split('\n')
                this.buffer = lines.pop() || ''

                for (const line of lines) {
                    if (!line.trim()) continue
                    let msg: any
                    try { msg = JSON.parse(line) } catch { continue }

                    if (!this.initialized && msg.result) {
                        this.initialized = true
                        this.proc.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`)
                        resolve()
                    }

                    if (typeof msg.id === 'number' && this.pending.has(msg.id)) {
                        this.pending.get(msg.id)(msg)
                        this.pending.delete(msg.id)
                    }
                }
            })

            this.proc.stderr?.on('data', () => {})
            this.proc.on('error', reject)
            setTimeout(() => reject(new Error('Timeout')), 30000)
        })
    }

    async callTool(name: string, args: Record<string, any> = {}) {
        const id = ++this.requestId
        return new Promise((resolve) => {
            this.proc.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } })}\n`)
            this.pending.set(id, resolve)
            setTimeout(() => {
                this.pending.delete(id)
                resolve({ error: 'Timeout' })
            }, 30000)
        })
    }

    close() { this.proc?.kill() }
}

async function testCommands() {
    console.log('='.repeat(60))
    console.log('MIKK ACCURACY TESTING')
    console.log('='.repeat(60))
    console.log('\nProject: ts-express-api\n')

    // Test 1: Count actual functions in source
    console.log('--- TEST 1: Function Count Accuracy ---')
    const srcFiles = await fs.readdir(path.join(FIXTURE, 'src'), { recursive: true })
    const tsFiles = srcFiles.filter((f: string) => f.endsWith('.ts'))
    console.log(`Actual .ts files: ${tsFiles.length}`)

    const srcContent = await Promise.all(
        tsFiles.map((f: string) => fs.readFile(path.join(FIXTURE, 'src', f), 'utf8'))
    )
    const allContent = srcContent.join('\n')
    
    // Count actual function declarations
    const functionMatches = allContent.match(/export\s+function\s+\w+|export\s+const\s+\w+\s*=/g) || []
    const actualFunctions = functionMatches.length
    console.log(`Actual exported functions in source: ${actualFunctions}`)

    // Run mikk stats
    const stats = await runCommand(['stats'])
    const statsMatch = stats.stdout.match(/(\d+)\s+functions/)
    const mikkFunctions = statsMatch ? parseInt(statsMatch[1]) : 0
    console.log(`Mikk reports functions: ${mikkFunctions}`)
    console.log(`Accuracy: ${mikkFunctions === actualFunctions ? '100%' : Math.round((Math.min(mikkFunctions, actualFunctions) / Math.max(mikkFunctions, actualFunctions)) * 100)}%`)

    // Test 2: Route Detection
    console.log('\n--- TEST 2: Route Detection Accuracy ---')
    const authRoutes = (allContent.match(/authRouter\.(get|post|put|patch|delete)\s*\(\s*['"][^'"]+['"]/g) || []).length
    const userRoutes = (allContent.match(/usersRouter\.(get|post|put|patch|delete)\s*\(\s*['"][^'"]+['"]/g) || []).length
    const paymentRoutes = (allContent.match(/paymentsRouter\.(get|post|put|patch|delete)\s*\(\s*['"][^'"]+['"]/g) || []).length
    const actualRoutes = authRoutes + userRoutes + paymentRoutes
    console.log(`Actual routes in source: ${actualRoutes}`)
    
    const routesMatch = stats.stdout.match(/(\d+)\s+routes/)
    const mikkRoutes = routesMatch ? parseInt(routesMatch[1]) : 0
    console.log(`Mikk reports routes: ${mikkRoutes}`)
    console.log(`Accuracy: ${mikkRoutes === actualRoutes ? '100%' : Math.round((Math.min(mikkRoutes, actualRoutes) / Math.max(mikkRoutes, actualRoutes)) * 100)}%`)

    // Test 3: Specific Function Detection
    console.log('\n--- TEST 3: Specific Function Detection ---')
    const verifyTokenExists = allContent.includes('function verifyToken') || allContent.includes('verifyToken')
    const signTokenExists = allContent.includes('function signToken') || allContent.includes('signToken')
    console.log(`verifyToken in source: ${verifyTokenExists}`)
    console.log(`signToken in source: ${signTokenExists}`)

    // Test 4: Module Detection
    console.log('\n--- TEST 4: Module Detection ---')
    const modules = ['auth', 'users', 'payments', 'utils', 'middleware', 'cache', 'db']
    const actualModules = modules.filter(m => 
        fs.access(path.join(FIXTURE, 'src', m)).then(() => true).catch(() => false)
    )
    console.log(`Actual modules: ${(await Promise.all(modules.map(async m => {
        try { await fs.access(path.join(FIXTURE, 'src', m)); return m } catch { return null }
    }))).filter(Boolean).length}`)

    // Test 5: MCP Tools
    console.log('\n--- TEST 5: MCP Tool Accuracy ---')
    const mcp = new McpClient()
    try {
        await mcp.start()
        console.log('MCP server connected\n')

        // Test search
        const searchResult: any = await mcp.callTool('mikk_search_functions', { query: 'verify', limit: 5 })
        const searchText = searchResult?.result?.content?.[0]?.text || ''
        const verifyFound = searchText.toLowerCase().includes('verifytoken')
        console.log(`Search 'verify' finds verifyToken: ${verifyFound ? 'YES ✓' : 'NO ✗'}`)
        
        // Test project overview
        const overviewResult: any = await mcp.callTool('mikk_get_project_overview', {})
        const overviewText = overviewResult?.result?.content?.[0]?.text || ''
        const hasProjectName = overviewText.includes('ts-express-api')
        const hasFunctions = /\d+\s+functions/.test(overviewText)
        console.log(`Overview has project name: ${hasProjectName ? 'YES ✓' : 'NO ✗'}`)
        console.log(`Overview has function count: ${hasFunctions ? 'YES ✓' : 'NO ✗'}`)

        // Test list modules
        const modulesResult: any = await mcp.callTool('mikk_list_modules', {})
        const modulesText = modulesResult?.result?.content?.[0]?.text || ''
        const authModule = modulesText.includes('auth')
        console.log(`List modules includes 'auth': ${authModule ? 'YES ✓' : 'NO ✗'}`)

        // Test routes
        const routesResult: any = await mcp.callTool('mikk_get_routes', {})
        const routesText = routesResult?.result?.content?.[0]?.text || ''
        const loginRoute = routesText.toLowerCase().includes('login')
        console.log(`Get routes includes 'login': ${loginRoute ? 'YES ✓' : 'NO ✗'}`)

        // Test constraints
        const constraintsResult: any = await mcp.callTool('mikk_get_constraints', {})
        const constraintsText = constraintsResult?.result?.content?.[0]?.text || ''
        console.log(`Get constraints returns data: ${constraintsText.length > 10 ? 'YES ✓' : 'NO ✗'}`)

        mcp.close()
    } catch (e) {
        console.log(`MCP Error: ${e}`)
    }

    // Test 6: Dead Code Detection
    console.log('\n--- TEST 6: Dead Code Detection ---')
    const deadCode = await runCommand(['dead-code'])
    const hasDeadCode = deadCode.stdout.includes('dead') || deadCode.stdout.includes('0%')
    console.log(`Dead code report generated: ${hasDeadCode ? 'YES ✓' : 'NO ✗'}`)

    // Test 7: Impact Analysis
    console.log('\n--- TEST 7: Impact Analysis ---')
    const impactResult: any = await mcp?.callTool('mikk_impact_analysis', { file: 'src/auth/jwt.ts' })
    const impactText = impactResult?.result?.content?.[0]?.text || ''
    const hasImpact = impactText.includes('impacted') || impactText.includes('nodes')
    console.log(`Impact analysis returns data: ${hasImpact ? 'YES ✓' : 'NO ✗'}`)

    console.log('\n' + '='.repeat(60))
    console.log('ACCURACY TEST COMPLETE')
    console.log('='.repeat(60))
}

testCommands().catch(console.error)
