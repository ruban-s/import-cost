import * as esbuild from 'esbuild';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'fs';
import { createRequire } from 'module';
import { dirname, extname, join } from 'path';

const require = createRequire(import.meta.url);

const PLATFORM_MAP = {
  'darwin-arm64': '@esbuild/darwin-arm64',
  'darwin-x64': '@esbuild/darwin-x64',
  'linux-x64': '@esbuild/linux-x64',
  'linux-arm64': '@esbuild/linux-arm64',
  'win32-x64': '@esbuild/win32-x64',
  'win32-arm64': '@esbuild/win32-arm64',
};

const targetArg = process.argv.find(a => a.startsWith('--target='));
const target = targetArg ? targetArg.split('=')[1] : null;

await esbuild.build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.electron.js',
  platform: 'node',
  target: 'node16',
  format: 'cjs',
  minifySyntax: true,
  minifyWhitespace: true,
  keepNames: true,
  sourcemap: true,
  external: ['vscode', 'esbuild'],
  loader: { '.node': 'empty' },
  plugins: [
    {
      name: 'stub-unused-deps',
      setup(build) {
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

const distModules = 'dist/node_modules';

if (existsSync(distModules)) {
  rmSync(distModules, { recursive: true });
}

function copyModuleEssentials(name, { skipBin = false } = {}) {
  const modPath = dirname(require.resolve(`${name}/package.json`));
  const dest = join(distModules, name);
  mkdirSync(dest, { recursive: true });

  cpSync(join(modPath, 'package.json'), join(dest, 'package.json'));

  const skipFiles = new Set([
    'README.md',
    'README',
    'CHANGELOG.md',
    'CHANGELOG',
    'LICENSE',
    'LICENSE.md',
    '.npmignore',
    'tsconfig.json',
    'postinstall.js',
    'install.js',
  ]);
  const skipDirs = new Set([
    'test',
    'tests',
    '__tests__',
    'docs',
    'doc',
    '.github',
    ...(skipBin ? ['bin'] : []),
  ]);

  function copyDir(src, dst) {
    const entries = readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      if (skipFiles.has(entry.name)) continue;
      const srcPath = join(src, entry.name);
      const dstPath = join(dst, entry.name);
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue;
        mkdirSync(dstPath, { recursive: true });
        copyDir(srcPath, dstPath);
      } else {
        cpSync(srcPath, dstPath);
      }
    }
  }

  copyDir(modPath, dest);
}

function copyNativeBinaryOnly(name) {
  const modPath = dirname(require.resolve(`${name}/package.json`));
  const dest = join(distModules, name);
  mkdirSync(dest, { recursive: true });

  cpSync(join(modPath, 'package.json'), join(dest, 'package.json'));

  const entries = readdirSync(modPath);
  for (const entry of entries) {
    const ext = extname(entry);
    const full = join(modPath, entry);
    if (
      statSync(full).isFile() &&
      (ext === '.node' ||
        ext === '.exe' ||
        entry === 'esbuild' ||
        entry === 'esbuild.exe')
    ) {
      cpSync(full, join(dest, entry));
    }
    if (entry === 'bin' && statSync(full).isDirectory()) {
      cpSync(full, join(dest, 'bin'), { recursive: true });
    }
  }
}

// Copy esbuild JS wrapper (skip bin/ — platform pkg provides the binary)
copyModuleEssentials('esbuild', { skipBin: true });

if (target && PLATFORM_MAP[target]) {
  // Copy only the target platform binary
  try {
    copyNativeBinaryOnly(PLATFORM_MAP[target]);
  } catch {
    console.warn(`Warning: ${PLATFORM_MAP[target]} not installed, skipping`);
  }
} else {
  // No target: copy current platform's binaries
  const esbuildPkg = JSON.parse(
    readFileSync(require.resolve('esbuild/package.json'), 'utf8'),
  );
  if (esbuildPkg.optionalDependencies) {
    for (const dep of Object.keys(esbuildPkg.optionalDependencies)) {
      try {
        copyNativeBinaryOnly(dep);
      } catch {
        // Not installed on this platform
      }
    }
  }
}

console.log(`Build complete. Native modules in ${distModules}/`);
if (target) {
  console.log(`Target platform: ${target}`);
}
