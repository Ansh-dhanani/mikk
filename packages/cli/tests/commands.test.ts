import { describe, it, expect } from 'bun:test'
import { spawn } from 'node:child_process'
import * as path from 'node:path'
import * as os from 'node:os'
import * as fsPromises from 'node:fs/promises'
import { existsSync } from 'node:fs'

const CLI_ENTRY = path.resolve(import.meta.dir, '../src/index.ts')
const bunCommand = resolveBunCommand()

async function runCli(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string; code: number | null }> {
    return new Promise((resolve) => {
        const proc = spawn(bunCommand, ['run', CLI_ENTRY, ...args], { shell: false, cwd })
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
            if (candidate && existsSync(candidate)) return candidate
        }
        return 'bun.exe'
    }
    return 'bun'
}

describe('@getmikk/cli subcommands edge cases', () => {
    it('init requires no arguments but aborts if mikk.json already exists', async () => {
        const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'mikk-test-'))
        // Create an existing mikk.json
        await fsPromises.writeFile(path.join(tmpDir, 'mikk.json'), JSON.stringify({ version: '1.0.0' }))
        
        const result = await runCli(['init'], tmpDir)
        expect(result.code).toBe(1)
        expect(result.stderr).toContain('This project is already initialized')
        
        await fsPromises.rm(tmpDir, { recursive: true, force: true })
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
        const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'mikk-test-'))
        const result = await runCli(['analyze'], tmpDir)
        // Usually should say missing mikk.json or similar
        expect(result.code).toBe(1)
        expect(result.stderr).toContain('mikk.json') 
        await fsPromises.rm(tmpDir, { recursive: true, force: true })
    })

    it('doctor reports missing baseline project artifacts in empty directory', async () => {
        const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'mikk-test-'))
        const result = await runCli(['doctor'], tmpDir)

        expect(result.code).toBe(1)
        const output = result.stdout + result.stderr
        expect(output).toContain('mikk doctor')
        expect(output).toContain('mikk.json')
        expect(output).toContain('mikk.lock.json')

        await fsPromises.rm(tmpDir, { recursive: true, force: true })
    })

    it('doctor includes parser runtime check for tree-sitter language projects', async () => {
        const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'mikk-test-'))

        // Mark as python project so doctor executes parser-runtime preflight.
        await fsPromises.writeFile(path.join(tmpDir, 'requirements.txt'), 'pytest\n')
        await fsPromises.writeFile(
            path.join(tmpDir, 'mikk.json'),
            JSON.stringify({
                version: '1.0.0',
                project: { name: 'tmp', language: 'python', entryPoints: [] },
                declared: { modules: [], constraints: [], decisions: [] },
                overwrite: { mode: 'never', requireConfirmation: true },
            }),
            'utf-8',
        )
        await fsPromises.writeFile(
            path.join(tmpDir, 'mikk.lock.json'),
            JSON.stringify({
                version: '1.0.0',
                syncState: { status: 'clean' },
                functions: {},
                files: {},
            }),
            'utf-8',
        )
        await fsPromises.mkdir(path.join(tmpDir, '.mikk'), { recursive: true })
        await fsPromises.mkdir(path.join(tmpDir, 'node_modules'), { recursive: true })
        await fsPromises.writeFile(path.join(tmpDir, '.mikkignore'), '# test\n', 'utf-8')

        const result = await runCli(['doctor'], tmpDir)
        const output = result.stdout + result.stderr
        expect(output).toContain('Parser runtime')

        await fsPromises.rm(tmpDir, { recursive: true, force: true })
    })

    it('suggest recommends init in uninitialized directories', async () => {
        const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'mikk-test-'))
        const result = await runCli(['suggest'], tmpDir)

        expect(result.code).toBe(0)
        const output = result.stdout + result.stderr
        expect(output).toContain('mikk suggest')
        expect(output).toContain('mikk init')

        await fsPromises.rm(tmpDir, { recursive: true, force: true })
    })
})
