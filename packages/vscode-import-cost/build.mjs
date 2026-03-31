import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/extension.js'],
  bundle: true,
  outfile: 'dist/extension.electron.js',
  platform: 'node',
  target: 'node16',
  format: 'cjs',
  minify: true,
  sourcemap: true,
  external: ['vscode', 'esbuild', '@swc/core', '@swc/wasm'],
  loader: { '.node': 'empty' },
});
