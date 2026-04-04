import { describe, it, expect } from 'bun:test'
import { spawn } from 'node:child_process'
import * as path from 'node:path'
import * as fs from 'node:fs'

const CLI_ENTRY = path.resolve(import.meta.dir, '../src/index.ts')
const bunCommand = resolveBunCommand()

async function runCli(args: string[]): Promise<{ stdout: string; stderr: string; code: number | null }> {
    return new Promise((resolve) => {
        const proc = spawn(bunCommand, ['run', CLI_ENTRY, ...args], { shell: false })
        let stdout = ''
        let stderr = ''

        proc.stdout.on('data', (data) => {
            stdout += data.toString()
        })

        proc.stderr.on('data', (data) => {
            stderr += data.toString()
        })

        proc.on('close', (code) => {
            resolve({ stdout, stderr, code })
        })
    })
}

function resolveBunCommand(): string {
    const override = process.env.MIKK_BUN_CLI ?? process.env.BUN_CLI_PATH ?? process.env.BUN_BINARY
    if (override) return override
    if (process.platform === 'win32') {
        const appData = process.env.APPDATA ?? ''
        const candidates = [
            path.join(appData, 'npm', 'bun.exe'),
            path.join(appData, 'npm', 'node_modules', 'bun', 'bin', 'bun.exe'),
        ]
        for (const candidate of candidates) {
            if (candidate && fs.existsSync(candidate)) return candidate
        }
        return 'bun.exe'
    }
    return 'bun'
}

describe('@getmikk/cli integration', () => {
    it('shows banner and command list when no arguments provided', async () => {
        const result = await runCli([])
        // mikk with no args shows the retro banner and exits 0
        expect(result.code).toBe(0)
        // Banner goes to stdout; check for the command list
        const output = result.stdout + result.stderr
        expect(output).toContain('mikk')
    })

    it('returns version correctly', async () => {
        const result = await runCli(['--version'])
        expect(result.code).toBe(0)
        expect(result.stdout).toMatch(/\d+\.\d+\.\d+/)
    })

    it('returns error on unknown command', async () => {
        const result = await runCli(['thisCommandDoesNotExist123'])
        expect(result.code).toBe(1)
        expect(result.stderr).toContain('error:')
        expect(result.stderr).toContain('unknown command')
    })
    
    it('returns help when context command is missing subcommands', async () => {
        const result = await runCli(['context'])
        // context without subcommands prints help, so we look for usage text
        expect(result.stdout || result.stderr).toContain('Usage: mikk context')
    })

    it('init help exposes strict parsing and force flags', async () => {
        const result = await runCli(['init', '--help'])
        const output = result.stdout + result.stderr
        expect(output).toContain('--force')
        expect(output).toContain('--strict-parsing')
    })

    it('analyze help exposes strict parsing flag', async () => {
        const result = await runCli(['analyze', '--help'])
        const output = result.stdout + result.stderr
        expect(output).toContain('--strict-parsing')
    })

    it('context query help exposes strict and fallback controls', async () => {
        const result = await runCli(['context', 'query', '--help'])
        const output = result.stdout + result.stderr
        expect(output).toContain('--strict')
        expect(output).toContain('--must')
        expect(output).toContain('--all-keywords')
        expect(output).toContain('--min-keywords')
        expect(output).toContain('--exact-only')
        expect(output).toContain('--fail-fast')
        expect(output).toContain('--no-auto-fallback')
        expect(output).toContain('--no-callgraph')
    })

    it('context for help exposes file/module anchors', async () => {
        const result = await runCli(['context', 'for', '--help'])
        const output = result.stdout + result.stderr
        expect(output).toContain('--file')
        expect(output).toContain('--module')
        expect(output).toContain('--strict')
        expect(output).toContain('--no-auto-fallback')
    })

    it('ci and contract validate help expose validation flags', async () => {
        const ci = await runCli(['ci', '--help'])
        const ciOutput = ci.stdout + ci.stderr
        expect(ciOutput).toContain('--strict')
        expect(ciOutput).toContain('--dead-code-threshold')
        expect(ciOutput).toContain('--format')

        const contract = await runCli(['contract', 'validate', '--help'])
        const contractOutput = contract.stdout + contract.stderr
        expect(contractOutput).toContain('--boundaries-only')
        expect(contractOutput).toContain('--drift-only')
        expect(contractOutput).toContain('--strict')
    })

    it('mcp, dead-code, stats, and remove help expose their flags', async () => {
        const mcp = await runCli(['mcp', 'install', '--help'])
        const mcpOutput = mcp.stdout + mcp.stderr
        expect(mcpOutput).toContain('--tool')
        expect(mcpOutput).toContain('--dry-run')

        const deadCode = await runCli(['dead-code', '--help'])
        const deadCodeOutput = deadCode.stdout + deadCode.stderr
        expect(deadCodeOutput).toContain('--module')
        expect(deadCodeOutput).toContain('--json')

        const stats = await runCli(['stats', '--help'])
        const statsOutput = stats.stdout + stats.stderr
        expect(statsOutput).toContain('--format')

        const remove = await runCli(['remove', '--help'])
        const removeOutput = remove.stdout + remove.stderr
        expect(removeOutput).toContain('--force')

        const suggest = await runCli(['suggest', '--help'])
        const suggestOutput = suggest.stdout + suggest.stderr
        expect(suggestOutput).toContain('practical')

        const update = await runCli(['update', '--help'])
        const updateOutput = update.stdout + update.stderr
        expect(updateOutput).toContain('--channel')
        expect(updateOutput).toContain('--version')
        expect(updateOutput).toContain('--yes')
    }, 12000)
})
