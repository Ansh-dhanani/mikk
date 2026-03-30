
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { OxcResolver } from '../src/parser/oxc-resolver'

describe('OxcResolver - ESM and CJS Resolution', () => {
    const FIXTURE_DIR = path.join(process.cwd(), '.test-fixture-esm')

    beforeAll(async () => {
        await fs.mkdir(FIXTURE_DIR, { recursive: true })
        
        // 1. Create a "dependency" package with 'exports'
        const depDir = path.join(FIXTURE_DIR, 'node_modules', 'some-pkg')
        await fs.mkdir(depDir, { recursive: true })
        
        await fs.writeFile(
            path.join(depDir, 'package.json'),
            JSON.stringify({
                name: 'some-pkg',
                type: 'module',
                exports: {
                    '.': {
                        import: './dist/esm/index.js',
                        require: './dist/cjs/index.cjs',
                        types: './dist/index.d.ts'
                    },
                    './subpath': './dist/sub.js'
                }
            })
        )
        
        await fs.mkdir(path.join(depDir, 'dist', 'esm'), { recursive: true })
        await fs.mkdir(path.join(depDir, 'dist', 'cjs'), { recursive: true })
        await fs.writeFile(path.join(depDir, 'dist', 'esm', 'index.js'), 'export const a = 1')
        await fs.writeFile(path.join(depDir, 'dist', 'cjs', 'index.cjs'), 'exports.a = 1')
        await fs.writeFile(path.join(depDir, 'dist', 'sub.js'), 'export const sub = 1')

        // 2. Create a main package.json
        await fs.writeFile(
            path.join(FIXTURE_DIR, 'package.json'),
            JSON.stringify({
                name: 'main-pkg',
                type: 'module'
            })
        )
    })

    afterAll(async () => {
        await fs.rm(FIXTURE_DIR, { recursive: true, force: true })
    })

    it('resolves ESM exports correctly', async () => {
        const resolver = new OxcResolver(FIXTURE_DIR)
        
        // Resolve 'some-pkg' (should hit exports['.'].import)
        const res = await resolver.resolve('some-pkg', path.join(FIXTURE_DIR, 'index.ts'))
        expect(res).toContain('node_modules/some-pkg/dist/esm/index.js')
    })

    it('resolves subpath exports correctly', async () => {
        const resolver = new OxcResolver(FIXTURE_DIR)
        
        // Resolve 'some-pkg/subpath'
        const res = await resolver.resolve('some-pkg/subpath', path.join(FIXTURE_DIR, 'index.ts'))
        expect(res).toContain('node_modules/some-pkg/dist/sub.js')
    })

    it('resolves relative imports with extension probing', async () => {
        const resolver = new OxcResolver(FIXTURE_DIR)
        await fs.writeFile(path.join(FIXTURE_DIR, 'local.ts'), 'export const x = 1')
        
        const res = await resolver.resolve('./local', path.join(FIXTURE_DIR, 'index.ts'))
        expect(res).toContain('.test-fixture-esm/local.ts')
    })
})
