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
  // Do NOT set packages: 'external' — we bundle @getmikk/* packages in
  // so the CLI works as a single self-contained binary after npm install.
  // Only truly native/large/optional deps are kept external.
  external: [
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
