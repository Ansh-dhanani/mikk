import { describe, it, expect, beforeAll } from 'bun:test'
import { spawn } from 'node:child_process'
import * as path from 'node:path'
import * as fs from 'node:fs'

const PROJECT_ROOT = path.resolve(import.meta.dir, '../../../')
const CLI_ENTRY = path.resolve(import.meta.dir, '../dist/index.js')

const languageFixtures = [
    { name: 'ts-express-api', lang: 'typescript' },
    { name: 'go-service', lang: 'go' },
    { name: 'java-service', lang: 'java' },
    { name: 'python-service', lang: 'python' },
] as const

async function runCli(args: string[], cwd?: string, timeout = 120000): Promise<{ stdout: string; stderr: string; code: number | null; duration: number }> {
    return new Promise((resolve) => {
        const start = Date.now()
        const proc = spawn('node', [CLI_ENTRY, ...args], { shell: false, cwd: cwd ?? PROJECT_ROOT, timeout })
        let stdout = ''
        let stderr = ''

        proc.stdout?.on('data', (data) => { stdout += data.toString() })
        proc.stderr?.on('data', (data) => { stderr += data.toString() })

        proc.on('close', (code) => {
            resolve({ stdout, stderr, code, duration: Date.now() - start })
        })

        proc.on('error', (err) => {
            stderr += err.message
            resolve({ stdout, stderr, code: -1, duration: Date.now() - start })
        })
    })
}

describe('Individual Language Fixtures', () => {
    for (const fixture of languageFixtures) {
        describe(`${fixture.lang} Fixture (${fixture.name})`, () => {
            const fixturePath = path.resolve(import.meta.dir, `../../../benchmarks/fixtures/${fixture.name}`)

            beforeAll(() => {
                expect(fs.existsSync(fixturePath)).toBe(true)
            })

            it('doctor runs health checks', async () => {
                const result = await runCli(['doctor', fixturePath])
                expect(result.code).toBeGreaterThanOrEqual(0)
            })

            it('stats shows project statistics', async () => {
                const result = await runCli(['stats', fixturePath])
                expect(result.code).toBe(0)
                expect(result.stdout.toLowerCase()).toContain(fixture.lang)
            })

            it('search finds functions', async () => {
                const result = await runCli(['search', 'user', '--limit', '3', fixturePath])
                expect(result.code).toBe(0)
            })

            it('context list shows modules', async () => {
                const result = await runCli(['context', 'list', fixturePath])
                expect(result.code).toBe(0)
            })

            it('context query returns context', async () => {
                const result = await runCli(['context', 'query', 'how does auth work', fixturePath])
                expect(result.code).toBe(0)
            })
        })
    }
})

describe('Error Handling', () => {
    it('handles missing mikk.json gracefully', async () => {
        const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'mikk-test-missing-'))
        try {
            fs.writeFileSync(path.join(tmpDir, 'test.ts'), 'export const x = 1')
            const result = await runCli(['stats', tmpDir])
            expect(result.code).not.toBe(0)
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true })
        }
    })

    it('handles unsupported extensions gracefully', async () => {
        const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'mikk-test-unsupported-'))
        try {
            fs.writeFileSync(path.join(tmpDir, 'data.xml'), '<data>test</data>')
            const result = await runCli(['stats', tmpDir])
            expect(result.code).not.toBe(0)
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true })
        }
    })
})
