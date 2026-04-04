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
import { basename, dirname, extname, join } from 'path';

const require = createRequire(import.meta.url);

const PLATFORM_MAP = {
  'darwin-arm64': {
    esbuild: '@esbuild/darwin-arm64',
    swc: '@swc/core-darwin-arm64',
  },
  'darwin-x64': {
    esbuild: '@esbuild/darwin-x64',
    swc: '@swc/core-darwin-x64',
  },
  'linux-x64': {
    esbuild: '@esbuild/linux-x64',
    swc: '@swc/core-linux-x64-gnu',
  },
  'linux-arm64': {
    esbuild: '@esbuild/linux-arm64',
    swc: '@swc/core-linux-arm64-gnu',
  },
  'win32-x64': {
    esbuild: '@esbuild/win32-x64',
    swc: '@swc/core-win32-x64-msvc',
  },
  'win32-arm64': {
    esbuild: '@esbuild/win32-arm64',
    swc: '@swc/core-win32-arm64-msvc',
  },
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
  external: ['vscode', 'esbuild', '@swc/core', '@swc/wasm'],
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

  // Copy only native binary files (.node, .exe, and platform binaries)
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
    // Some packages store binaries in a bin/ directory
    if (entry === 'bin' && statSync(full).isDirectory()) {
      cpSync(full, join(dest, 'bin'), { recursive: true });
    }
  }
}

if (target && PLATFORM_MAP[target]) {
  const { esbuild: esbuildPlatformPkg, swc: swcPlatformPkg } =
    PLATFORM_MAP[target];

  // Copy esbuild core (JS wrapper, skip bin/ — platform pkg provides binary)
  copyModuleEssentials('esbuild', { skipBin: true });
  // Copy only the target platform binary
  try {
    copyNativeBinaryOnly(esbuildPlatformPkg);
  } catch {
    console.warn(`Warning: ${esbuildPlatformPkg} not installed, skipping`);
  }

  // Copy @swc/core (JS wrapper + bindings)
  copyModuleEssentials('@swc/core');
  // Copy only the target platform binary
  try {
    copyNativeBinaryOnly(swcPlatformPkg);
  } catch {
    console.warn(`Warning: ${swcPlatformPkg} not installed, skipping`);
  }
} else {
  // No target specified: copy current platform's binaries (dev/local builds)
  copyModuleEssentials('esbuild', { skipBin: true });
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

  copyModuleEssentials('@swc/core');
  const swcPkg = JSON.parse(
    readFileSync(require.resolve('@swc/core/package.json'), 'utf8'),
  );
  if (swcPkg.optionalDependencies) {
    for (const dep of Object.keys(swcPkg.optionalDependencies)) {
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
