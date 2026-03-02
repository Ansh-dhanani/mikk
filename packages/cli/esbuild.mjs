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
  define: {
    '__MIKK_VERSION__': JSON.stringify(version)
  }
})

console.log('Built @getmikk/cli v' + version)
