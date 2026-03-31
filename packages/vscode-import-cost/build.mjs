import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Bundle the extension, externalizing native modules
await esbuild.build({
  entryPoints: ['src/extension.js'],
  bundle: true,
  outfile: 'dist/extension.electron.js',
  platform: 'node',
  target: 'node16',
  format: 'cjs',
  minifySyntax: true,
  minifyWhitespace: true,
  keepNames: true,
  sourcemap: true,
  external: [
    'vscode',
    'esbuild',
    '@swc/core',
    '@swc/wasm',
  ],
  loader: { '.node': 'empty' },
  plugins: [
    {
      name: 'stub-unused-deps',
      setup(build) {
        // These are transitive deps in node_modules that get pulled in
        // but are never actually called at runtime
        const stubs = [
          'worker-farm',
          'webpack',
          'terser-webpack-plugin',
          'jest-worker',
          'uglify-js',
        ];
        const filter = new RegExp(`^(${stubs.join('|')})$`);
        build.onResolve({ filter }, () => ({
          path: 'stub',
          namespace: 'stub-ns',
        }));
        build.onLoad({ filter: /.*/, namespace: 'stub-ns' }, () => ({
          contents: 'module.exports = {};',
          loader: 'js',
        }));
      },
    },
  ],
});

// Copy native dependencies into dist/node_modules so they ship with the VSIX
const distModules = 'dist/node_modules';

function copyModule(name) {
  const modPath = dirname(require.resolve(`${name}/package.json`));
  const dest = join(distModules, name);
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }
  cpSync(modPath, dest, { recursive: true });
}

// esbuild needs its platform-specific binary
copyModule('esbuild');
// Also copy the platform-specific esbuild binary package
const esbuildPkg = JSON.parse(
  (await import('fs')).readFileSync(
    require.resolve('esbuild/package.json'),
    'utf8',
  ),
);
if (esbuildPkg.optionalDependencies) {
  for (const dep of Object.keys(esbuildPkg.optionalDependencies)) {
    try {
      copyModule(dep);
    } catch {
      // Skip platform-specific packages not installed on this OS
    }
  }
}

// @swc/core and its platform-specific binary
copyModule('@swc/core');
const swcPkg = JSON.parse(
  (await import('fs')).readFileSync(
    require.resolve('@swc/core/package.json'),
    'utf8',
  ),
);
if (swcPkg.optionalDependencies) {
  for (const dep of Object.keys(swcPkg.optionalDependencies)) {
    try {
      copyModule(dep);
    } catch {
      // Skip platform-specific packages not installed on this OS
    }
  }
}
