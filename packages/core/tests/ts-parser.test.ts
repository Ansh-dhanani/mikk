import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { OxcParser } from '../src/parser/oxc-parser'

describe('ts-parser config resolution', () => {
    const FIXTURE_DIR = path.join(process.cwd(), '.test-fixture-tsconfig')

    beforeAll(async () => {
        await fs.mkdir(FIXTURE_DIR, { recursive: true })
        // Use a single tsconfig with all paths to verify OxcResolver's basic path mapping
        await fs.writeFile(
            path.join(FIXTURE_DIR, 'tsconfig.json'),
            JSON.stringify({
                compilerOptions: {
                    baseUrl: '.',
                    paths: {
                        '@base/*': ['src/base/*'],
                        '@lib/*': ['src/lib/*'],
                        '@app/*': ['src/app/*']
                    }
                }
            })
        )

        await fs.writeFile(
            path.join(FIXTURE_DIR, 'package.json'),
            JSON.stringify({
                name: 'test-fixture',
                type: 'module'
            })
        )
    })

    afterAll(async () => {
        await fs.rm(FIXTURE_DIR, { recursive: true, force: true })
    })

    it('resolves compiler paths from tsconfig', async () => {
        const parser = new OxcParser()
        
        const srcDir = path.join(FIXTURE_DIR, 'src', 'app')
        await fs.mkdir(srcDir, { recursive: true })
        await fs.mkdir(path.join(FIXTURE_DIR, 'src', 'base'), { recursive: true })
        await fs.mkdir(path.join(FIXTURE_DIR, 'src', 'lib'), { recursive: true })
        
        await fs.writeFile(path.join(FIXTURE_DIR, 'src', 'base', 'core.ts'), 'export const c = 1')
        await fs.writeFile(path.join(FIXTURE_DIR, 'src', 'lib', 'shared.ts'), 'export const b = 1')
        await fs.writeFile(path.join(FIXTURE_DIR, 'src', 'app', 'local.ts'), 'export const a = 1')

        const filePath = path.join(srcDir, 'index.ts')
        await fs.writeFile(filePath, `
            import { a } from '@app/local'
            import { b } from '@lib/shared'
            import { c } from '@base/core'
        `)

        // Parse and resolve imports
        const parsed = await parser.parse(filePath, await fs.readFile(filePath, 'utf-8'))
        const resolved = (await parser.resolveImports([parsed], FIXTURE_DIR))[0]

        const impApp = resolved.imports.find(i => i.source === '@app/local')
        expect(impApp?.resolvedPath).toBe(path.join(FIXTURE_DIR, 'src/app/local.ts').replace(/\\/g, '/'))

        const impLib = resolved.imports.find(i => i.source === '@lib/shared')
        expect(impLib?.resolvedPath).toBe(path.join(FIXTURE_DIR, 'src/lib/shared.ts').replace(/\\/g, '/'))

        const impBase = resolved.imports.find(i => i.source === '@base/core')
        expect(impBase?.resolvedPath).toBe(path.join(FIXTURE_DIR, 'src/base/core.ts').replace(/\\/g, '/'))
    })
})

describe('TypeScriptParser Edge Cases & Fault Tolerance', () => {
    const parser = new OxcParser()

    it('handles completely empty files', async () => {
        const result = await parser.parse('src/empty.ts', '')
        expect(result.functions).toHaveLength(0)
        expect(result.classes).toHaveLength(0)
        expect(result.language).toBe('typescript')
        expect(result.hash).toBeDefined()
    })

    it('gracefully degrades on severe syntax errors', async () => {
        const malformedCode = `
            export interface Broke {
                val: string
            // missing closing brace
            
            function doThing() {
                const x = 
            }
            
            @Injectable()
            export class HalfClass implements {
        `
        const result = await parser.parse('src/broken.ts', malformedCode)
        expect(result.functions.length).toBeGreaterThanOrEqual(0)
        expect(result.classes.length).toBeGreaterThanOrEqual(0)
        expect(Array.isArray(result.imports)).toBe(true)
        expect(typeof result.hash).toBe('string')
        expect(result.language).toBe('typescript')
    })
    
    it('handles files with only comments', async () => {
        const commentsCode = `
            /**
             * This file is just documentation
             */
            // End of file
        `
        const result = await parser.parse('src/docs.ts', commentsCode)
        expect(result.functions).toHaveLength(0)
        expect(result.hash).toBeDefined()
    })

    it('parses Windows line endings consistently', async () => {
        const winCode = 'export function ping() {\r\n  return 1\r\n}\r\n'
        const result = await parser.parse('src/win.ts', winCode)
        expect(result.functions.some(f => f.name === 'ping')).toBe(true)
    })
})
