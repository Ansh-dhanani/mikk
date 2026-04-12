import * as esbuild from 'esbuild'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

esbuild.buildSync({
    entryPoints: ['src/index.ts'],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    outfile: 'dist/index.cjs',
    sourcemap: true,
    external: [
    '@getmikk/core',
    '@getmikk/ai-context',
    '@getmikk/intent-engine',
    'better-sqlite3', 
    '@xenova/transformers', 
    'web-tree-sitter', 
    'oxc-resolver', 
    'oxc-parser',
],
    packages: 'external',
    define: {
        __MCP_VERSION__: JSON.stringify(pkg.version),
    },
    logOverride: { 'empty-import-meta': 'silent' },
    banner: {
        js: '"use strict";',
    },
})

console.log('Built dist/index.cjs')
