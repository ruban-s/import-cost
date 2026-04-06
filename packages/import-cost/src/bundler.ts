import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import { brotliCompressSync, constants, gzipSync } from 'zlib';
import type { ImportCostConfig, PackageInfo, SizeResult } from './types';
import { getAllNodeModulePaths, getPackageJson, pkgDir } from './utils';

const nodeBuiltins = new Set(require('module').builtinModules);

// Cache resolved project dirs and node paths per file directory
const projectDirCache = new Map<string, string | undefined>();
const nodePathsCache = new Map<string, string[]>();

async function getProjectDir(fileName: string): Promise<string | undefined> {
  const dir = path.dirname(fileName);
  if (!projectDirCache.has(dir)) {
    projectDirCache.set(dir, await pkgDir(dir));
  }
  return projectDirCache.get(dir);
}

async function getNodePaths(fileName: string): Promise<string[]> {
  const dir = path.dirname(fileName);
  if (!nodePathsCache.has(dir)) {
    nodePathsCache.set(dir, await getAllNodeModulePaths(fileName));
  }
  return nodePathsCache.get(dir)!;
}

const loaders: Record<string, esbuild.Loader> = {
  '.css': 'empty',
  '.scss': 'empty',
  '.png': 'empty',
  '.jpg': 'empty',
  '.jpeg': 'empty',
  '.gif': 'empty',
  '.svg': 'empty',
  '.woff': 'empty',
  '.woff2': 'empty',
  '.ttf': 'empty',
  '.eot': 'empty',
  '.wav': 'empty',
};

const ignoreUnresolvedPlugin: esbuild.Plugin = {
  name: 'ignore-unresolved',
  setup(build) {
    build.onResolve({ filter: /.*/ }, args => {
      const name = args.path.replace(/^node:/, '');
      if (nodeBuiltins.has(name) || name === 'electron') {
        return { path: args.path, namespace: 'empty-module' };
      }
      return null;
    });
    build.onLoad({ filter: /.*/, namespace: 'empty-module' }, () => ({
      contents: 'module.exports = {};',
      loader: 'js' as const,
    }));
  },
};

export async function calcSize(
  packageInfo: PackageInfo,
  config: ImportCostConfig,
  callback: (error: Error | null, result?: SizeResult) => void,
): Promise<void> {
  try {
    const projectDir = await getProjectDir(packageInfo.fileName);
    const allNodePaths = await getNodePaths(packageInfo.fileName);

    let externals = ['react', 'react-dom'];
    try {
      const pkgJson = await getPackageJson(packageInfo);
      externals = Object.keys(pkgJson.peerDependencies || {})
        .concat(externals)
        .filter(p => p !== packageInfo.name);
    } catch {
      // package.json not found — use default externals
    }

    const buildPromise = esbuild.build({
      stdin: {
        contents: packageInfo.string,
        resolveDir: projectDir,
        loader: 'js',
      },
      bundle: true,
      minify: true,
      write: false,
      platform: 'browser',
      define: { 'process.env.NODE_ENV': '"production"' },
      external: externals,
      nodePaths: allNodePaths,
      mainFields: ['browser', 'module', 'main'],
      loader: loaders,
      logLevel: 'silent',
      plugins: [ignoreUnresolvedPlugin],
    });

    let result: esbuild.BuildResult;
    if (config.maxCallTime && config.maxCallTime !== Infinity) {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TimeoutError')), config.maxCallTime),
      );
      result = await Promise.race([buildPromise, timeout]);
    } else {
      result = await buildPromise;
    }

    const output = Buffer.concat(
      result.outputFiles!.map(f => Buffer.from(f.contents)),
    );
    const size = output.length;
    const gzip = gzipSync(output).length;
    const brotli = brotliCompressSync(output, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 4 },
    }).length;
    callback(null, { size, gzip, brotli });
  } catch (e) {
    try {
      const fallback = estimatePackageSize(packageInfo);
      if (fallback) {
        callback(null, fallback);
        return;
      }
    } catch {
      // ignore fallback errors
    }
    callback(e as Error);
  }
}

function estimatePackageSize(packageInfo: PackageInfo): SizeResult | null {
  const pkgName = packageInfo.name
    .split('/')
    .slice(0, packageInfo.name.startsWith('@') ? 2 : 1)
    .join('/');
  try {
    const resolved = require.resolve(pkgName, {
      paths: [path.dirname(packageInfo.fileName)],
    });
    const content = fs.readFileSync(resolved);
    const size = content.length;
    const gzip = gzipSync(content).length;
    const brotli = brotliCompressSync(content, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 4 },
    }).length;
    return { size, gzip, brotli };
  } catch {
    return null;
  }
}
