import esbuild from 'esbuild';

const isDev = process.argv.includes('dev');

const config = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: ['obsidian'],
  format: 'cjs',
  target: 'node18',
  outdir: '.',
  sourcemap: true,
  minify: false,
};

if (isDev) {
  esbuild.context(config).then(ctx => ctx.watch());
} else {
  esbuild.build(config).then(() => console.log('Built successfully'));
}