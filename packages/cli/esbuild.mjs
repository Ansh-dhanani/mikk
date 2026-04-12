import * as esbuild from 'esbuild'
import { readFileSync } from 'fs'

const { version } = JSON.parse(readFileSync('./package.json', 'utf8'))

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/index.js',
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  banner: { js: '#!/usr/bin/env node' },
  external: [
    '@getmikk/core',
    '@getmikk/ai-context',
    '@getmikk/intent-engine',
    '@getmikk/watcher',
    '@xenova/transformers', 
    'oxc-parser', 
    'oxc-resolver', 
    'web-tree-sitter',
    'tree-sitter-wasms',
    'better-sqlite3',
    'chokidar',
    'zod',
    'chalk',
    'commander',
    'ora',
  ],
  define: {
    '__MIKK_VERSION__': JSON.stringify(version)
  },
  logOverride: {
    'empty-import-meta': 'silent'
  }
})

console.log('Built @getmikk/cli v' + version)
