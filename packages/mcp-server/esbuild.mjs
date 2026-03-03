import * as esbuild from 'esbuild'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

await esbuild.build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    outfile: 'dist/index.cjs',
    sourcemap: true,
    external: ['better-sqlite3'],
    define: {
        __MCP_VERSION__: JSON.stringify(pkg.version),
    },
    banner: {
        js: '"use strict";',
    },
})

console.log('Built dist/index.cjs')
