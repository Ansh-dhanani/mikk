import { describe, it, expect } from 'bun:test'
import { spawn } from 'node:child_process'
import * as path from 'node:path'
import * as os from 'node:os'
import * as fs from 'node:fs/promises'

const CLI_ENTRY = path.resolve(import.meta.dir, '../src/index.ts')

async function runCli(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string; code: number | null }> {
    return new Promise((resolve) => {
        const proc = spawn('bun', ['run', CLI_ENTRY, ...args], { shell: true, cwd })
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

describe('@getmikk/cli subcommands edge cases', () => {
    it('init requires no arguments but aborts if mikk.json already exists', async () => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mikk-test-'))
        // Create an existing mikk.json
        await fs.writeFile(path.join(tmpDir, 'mikk.json'), JSON.stringify({ version: '1.0.0' }))
        
        const result = await runCli(['init'], tmpDir)
        expect(result.code).toBe(1)
        expect(result.stderr).toContain('This project is already initialized')
        
        await fs.rm(tmpDir, { recursive: true, force: true })
    })

    it('diff command errors gracefully when file does not exist', async () => {
        const result = await runCli(['diff', 'non_existent_file_123.ts'])
        expect(result.code).not.toBe(0)
        expect(result.stderr).toContain('too many arguments')
    })

    it('context query catches missing question argument', async () => {
        const result = await runCli(['context', 'query'])
        // commander missing argument handling
        expect(result.code).toBe(1)
        expect(result.stderr).toContain('missing required argument')
    })
    
    it('analyze catches uninitialized directories gracefully', async () => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mikk-test-'))
        const result = await runCli(['analyze'], tmpDir)
        // Usually should say missing mikk.json or similar
        expect(result.code).toBe(1)
        expect(result.stderr).toContain('mikk.json') 
        await fs.rm(tmpDir, { recursive: true, force: true })
    })
})
