import { execFileSync } from 'child_process';
import * as esbuild from 'esbuild';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'fs';
import { createRequire } from 'module';
import { tmpdir } from 'os';
import { dirname, extname, join } from 'path';

const require = createRequire(import.meta.url);

const PLATFORM_MAP: Record<string, string> = {
  'darwin-arm64': '@esbuild/darwin-arm64',
  'darwin-x64': '@esbuild/darwin-x64',
  'linux-x64': '@esbuild/linux-x64',
  'linux-arm64': '@esbuild/linux-arm64',
  'win32-x64': '@esbuild/win32-x64',
  'win32-arm64': '@esbuild/win32-arm64',
};

const targetArg = process.argv.find(a => a.startsWith('--target='));
const target = targetArg
  ? targetArg.split('=')[1]
  : `${process.platform}-${process.arch}`;
if (!PLATFORM_MAP[target]) {
  throw new Error(
    `Unsupported target: ${target} (expected one of ${Object.keys(PLATFORM_MAP).join(', ')})`,
  );
}

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
      setup(build: esbuild.PluginBuild) {
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

function copyModuleEssentials(name: string, { skipBin = false } = {}): void {
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

  function copyDir(src: string, dst: string): void {
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

function findInstalledPackage(name: string): string | null {
  try {
    return dirname(require.resolve(`${name}/package.json`));
  } catch {
    return null;
  }
}

function fetchPackage(name: string, version: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'esbuild-binary-'));
  execFileSync(
    'npm',
    ['pack', `${name}@${version}`, '--pack-destination', dir, '--silent'],
    {
      stdio: ['ignore', 'ignore', 'inherit'],
      shell: process.platform === 'win32',
    },
  );
  const tarball = readdirSync(dir).find(f => f.endsWith('.tgz'));
  if (!tarball) throw new Error(`npm pack produced no tarball for ${name}`);
  execFileSync('tar', ['-xzf', join(dir, tarball), '-C', dir]);
  return join(dir, 'package');
}

function copyNativeBinaryOnly(name: string, version: string): void {
  let modPath = findInstalledPackage(name);
  if (
    !modPath ||
    JSON.parse(readFileSync(join(modPath, 'package.json'), 'utf8')).version !==
      version
  ) {
    modPath = fetchPackage(name, version);
  }
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

const { version: esbuildVersion } = JSON.parse(
  readFileSync(require.resolve('esbuild/package.json'), 'utf8'),
);
copyNativeBinaryOnly(PLATFORM_MAP[target], esbuildVersion);

const binary = join(
  distModules,
  PLATFORM_MAP[target],
  target.startsWith('win32') ? 'esbuild.exe' : 'bin/esbuild',
);
if (!existsSync(binary)) {
  throw new Error(`esbuild binary missing for ${target}: ${binary}`);
}

console.log(`Build complete for ${target}. Native modules in ${distModules}/`);
