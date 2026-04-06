import * as esbuild from 'esbuild';
import * as path from 'path';
import { brotliCompressSync, constants, gzipSync } from 'zlib';
import type { ImportCostConfig, PackageInfo, SizeResult } from './types';
import { getAllNodeModulePaths, getPackageJson, pkgDir } from './utils';

const nodeBuiltins = new Set(require('module').builtinModules);

export async function calcSize(
  packageInfo: PackageInfo,
  config: ImportCostConfig,
  callback: (error: Error | null, result?: SizeResult) => void,
): Promise<void> {
  try {
    const projectDir = await pkgDir(path.dirname(packageInfo.fileName));
    const allNodePaths = await getAllNodeModulePaths(packageInfo.fileName);

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
      loader: {
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
      },
      logLevel: 'silent',
      plugins: [
        {
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
        },
      ],
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
    callback(e as Error);
  }
}
