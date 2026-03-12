import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { TypeScriptParser } from '../src/parser/typescript/ts-parser'
import { getParser } from '../src/parser/index'

describe('ts-parser config "extends" resolution', () => {
    const FIXTURE_DIR = path.join(process.cwd(), '.test-fixture-tsconfig')

    beforeAll(async () => {
        // Create a temporary directory structure to test tsconfig extends
        await fs.mkdir(FIXTURE_DIR, { recursive: true })
        await fs.mkdir(path.join(FIXTURE_DIR, 'node_modules', '@tsconfig', 'node20'), { recursive: true })

        // 1. node_modules package tsconfig
        await fs.writeFile(
            path.join(FIXTURE_DIR, 'node_modules', '@tsconfig', 'node20', 'tsconfig.json'),
            JSON.stringify({
                compilerOptions: {
                    target: 'es2022',
                    module: 'commonjs',
                    paths: { '@base/*': ['src/base/*'] }
                }
            })
        )

        // 2. Local tsconfig.base.json extending the node_modules one
        await fs.writeFile(
            path.join(FIXTURE_DIR, 'tsconfig.base.json'),
            JSON.stringify({
                extends: '@tsconfig/node20/tsconfig.json',
                compilerOptions: {
                    baseUrl: '.',
                    paths: {
                        '@lib/*': ['src/lib/*']
                    }
                }
            })
        )

        // 3. Project tsconfig.json extending local base
        await fs.writeFile(
            path.join(FIXTURE_DIR, 'tsconfig.json'),
            `{
                "extends": "./tsconfig.base.json",
                // Comments should be ignored!
                /* Block comments too */
                "compilerOptions": {
                    "paths": {
                        "@app/*": ["src/app/*"]
                    }
                }
            }`
        )
    })

    afterAll(async () => {
        await fs.rm(FIXTURE_DIR, { recursive: true, force: true })
    })

    it('recursively merges compiler paths from extended configs', async () => {
        // We'll test this indirectly by creating a dummy file and parsing it
        // and letting ts-parser resolve its imports based on the merged tsconfig
        const parser = new TypeScriptParser()
        
        // Write a test source file
        const srcDir = path.join(FIXTURE_DIR, 'src', 'app')
        await fs.mkdir(srcDir, { recursive: true })
        const filePath = path.join(srcDir, 'index.ts')
        await fs.writeFile(filePath, `
            import { a } from '@app/local'
            import { b } from '@lib/shared'
            import { c } from '@base/core'
        `)

        // Parse and resolve imports
        const parsed = parser.parse(filePath, await fs.readFile(filePath, 'utf-8'))
        const resolved = parser.resolveImports([parsed], FIXTURE_DIR)[0]

        // Check if the aliases mapped correctly using all 3 layers of paths
        // Base config mapping: @base/* -> src/base/*
        const impBase = resolved.imports.find(i => i.source === '@base/core')
        expect(impBase?.resolvedPath).toBe('src/base/core.ts')

        // Mid config mapping: @lib/* -> src/lib/*
        const impLib = resolved.imports.find(i => i.source === '@lib/shared')
        expect(impLib?.resolvedPath).toBe('src/lib/shared.ts')

        // Top config mapping: @app/* -> src/app/*
        const impApp = resolved.imports.find(i => i.source === '@app/local')
        expect(impApp?.resolvedPath).toBe('src/app/local.ts')
    })
})
