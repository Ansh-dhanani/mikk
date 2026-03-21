import { describe, it, expect } from 'bun:test'
import { spawn } from 'node:child_process'
import * as path from 'node:path'

const CLI_ENTRY = path.resolve(import.meta.dir, '../src/index.ts')

async function runCli(args: string[]): Promise<{ stdout: string; stderr: string; code: number | null }> {
    return new Promise((resolve) => {
        const proc = spawn('bun', ['run', CLI_ENTRY, ...args], { shell: true })
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
})
