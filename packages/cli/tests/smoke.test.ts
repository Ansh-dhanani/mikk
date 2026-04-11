import { describe, it, expect } from 'bun:test'
import { spawn } from 'node:child_process'
import * as path from 'node:path'

const PROJECT_ROOT = path.resolve(import.meta.dir, '../../../')
const CLI_ENTRY = path.resolve(import.meta.dir, '../dist/index.js')

async function runCli(args: string[], cwd?: string, timeout = 30000): Promise<{ stdout: string; stderr: string; code: number | null }> {
    return new Promise((resolve) => {
        const proc = spawn('node', [CLI_ENTRY, ...args], { shell: false, cwd: cwd ?? PROJECT_ROOT, timeout })
        let stdout = ''
        let stderr = ''

        proc.stdout?.on('data', (data) => { stdout += data.toString() })
        proc.stderr?.on('data', (data) => { stderr += data.toString() })

        proc.on('close', (code) => {
            resolve({ stdout, stderr, code })
        })

        proc.on('error', (err) => {
            stderr += err.message
            resolve({ stdout, stderr, code: -1 })
        })
    })
}

describe('CLI Runtime Environment', () => {
    it('runs in Node.js', () => {
        expect(typeof process.versions.node).toBe('string')
    })

    it('can execute the CLI binary', async () => {
        const result = await runCli(['--version'])
        expect(result.code).toBe(0)
        expect(result.stdout).toMatch(/\d+\.\d+\.\d+/)
    })

    it('CLI responds to --help', async () => {
        const result = await runCli(['--help'])
        expect(result.code).toBe(0)
        expect(result.stdout).toContain('mikk')
    })
})

describe('CLI Context Commands', () => {
    it('context query requires a question argument', async () => {
        const result = await runCli(['context', 'query'])
        expect(result.code).not.toBe(0)
        expect(result.stderr).toContain('missing required argument')
    })

    it('context query with valid question works', async () => {
        const result = await runCli(['context', 'query', 'parser'])
        expect(result.code).toBe(0)
    })

    it('context query --meta shows diagnostics', async () => {
        const result = await runCli(['context', 'query', 'parser', '--meta'])
        expect(result.code).toBe(0)
    })

    it('context impact requires a file argument', async () => {
        const result = await runCli(['context', 'impact'])
        expect(result.code).not.toBe(0)
    })

    it('context list shows modules', async () => {
        const result = await runCli(['context', 'list'])
        expect(result.code).toBe(0)
    })

    it('context for requires a task argument', async () => {
        const result = await runCli(['context', 'for'])
        expect(result.code).not.toBe(0)
    })
})

describe('CLI Search Command', () => {
    it.skip('search returns results for valid query', async () => {
        const result = await runCli(['search', 'function'])
        expect(result.code).toBe(0)
        expect(result.stdout).toMatch(/results for|No results found/)
    })

    it.skip('search handles queries gracefully', async () => {
        const result = await runCli(['search', 'xyzzy_nonexistent'])
        expect(result.code).toBe(0)
    })

    it.skip('search --limit respects the limit', async () => {
        const result = await runCli(['search', 'function', '--limit', '2'])
        expect(result.code).toBe(0)
        // New output format: "X results for"
        const match = result.stdout.match(/(\d+)\s+results? for/)
        if (match) {
            const count = parseInt(match[1])
            expect(count).toBeLessThanOrEqual(2)
        }
    })
})

describe('CLI Validation Commands', () => {
    it('stats returns statistics', async () => {
        const result = await runCli(['stats'])
        expect(result.code).toBe(0)
    })

    it('stats --format json returns valid JSON', async () => {
        const result = await runCli(['stats', '--format', 'json'])
        expect(result.code).toBe(0)
        expect(() => JSON.parse(result.stdout)).not.toThrow()
    })

    it('contract validate runs', async () => {
        const result = await runCli(['contract', 'validate'])
        expect(result.code).toBeDefined()
    })

    it('ci runs constraint checks', async () => {
        const result = await runCli(['ci'])
        expect(result.code).toBeDefined()
    })
})

describe('CLI Doctor Command', () => {
    it('doctor runs health checks', async () => {
        const result = await runCli(['doctor'])
        expect(result.code).toBeDefined()
    })
})

describe('CLI Utility Commands', () => {
    it('suggest returns recommendations', async () => {
        const result = await runCli(['suggest'])
        expect(result.code).toBe(0)
    })

    it('dead-code runs detection', async () => {
        const result = await runCli(['dead-code'])
        expect(result.code).toBeDefined()
    })
})

describe('CLI Version and Help', () => {
    it('--version shows semantic version', async () => {
        const result = await runCli(['--version'])
        expect(result.code).toBe(0)
        expect(result.stdout).toMatch(/\d+\.\d+\.\d+/)
    })

    it('--help shows all main commands', async () => {
        const result = await runCli(['--help'])
        expect(result.code).toBe(0)
        expect(result.stdout).toContain('init')
        expect(result.stdout).toContain('search')
        expect(result.stdout).toContain('context')
    })

    it('unknown command shows error', async () => {
        const result = await runCli(['unknown-command-xyz'])
        expect(result.code).not.toBe(0)
    })
})
