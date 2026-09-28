import * as esbuild from 'esbuild';
import * as fs from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';
import { brotliCompress, constants, gzip } from 'zlib';
import type { ImportCostConfig, PackageInfo, SizeResult } from './types';
import { getPackageJson, packageName, pkgDir } from './utils';

const gzipAsync = promisify(gzip);
const brotliAsync = promisify(brotliCompress);
const nodeBuiltins = new Set(require('module').builtinModules);

const MAX_CONCURRENT_BUILDS = 4;
const IDLE_STOP_MS = 30_000;

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Bundling timed out after ${ms} ms`);
    this.name = 'TimeoutError';
  }
}

const projectDirCache = new Map<string, Promise<string | undefined>>();

function getProjectDir(fileName: string): Promise<string | undefined> {
  const dir = path.dirname(fileName);
  let projectDir = projectDirCache.get(dir);
  if (!projectDir) {
    projectDir = pkgDir(dir);
    projectDirCache.set(dir, projectDir);
  }
  return projectDir;
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

let runningBuilds = 0;
const waitingBuilds: (() => void)[] = [];
let idleTimer: ReturnType<typeof setTimeout> | undefined;

async function withBuildSlot<T>(fn: () => Promise<T>): Promise<T> {
  clearTimeout(idleTimer);
  if (runningBuilds >= MAX_CONCURRENT_BUILDS) {
    await new Promise<void>(resolve => waitingBuilds.push(resolve));
  }
  runningBuilds++;
  try {
    return await fn();
  } finally {
    runningBuilds--;
    const next = waitingBuilds.shift();
    if (next) next();
    else if (runningBuilds === 0) {
      // the esbuild service keeps its peak heap resident until stopped
      idleTimer = setTimeout(() => void esbuild.stop(), IDLE_STOP_MS);
      idleTimer.unref();
    }
  }
}

export async function cleanup(): Promise<void> {
  clearTimeout(idleTimer);
  await esbuild.stop();
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  if (!ms || ms === Infinity) return promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function bundle(
  packageInfo: PackageInfo,
  config: ImportCostConfig,
): Promise<Uint8Array> {
  const pkg = packageName(packageInfo.name);
  let peers: string[] = [];
  try {
    peers = Object.keys(
      (await getPackageJson(packageInfo)).peerDependencies ?? {},
    );
  } catch {
    // unreadable package.json: measure without its peers
  }
  const build = esbuild.build({
    stdin: {
      contents: packageInfo.string,
      resolveDir: await getProjectDir(packageInfo.fileName),
      loader: 'js',
    },
    bundle: true,
    minify: true,
    write: false,
    platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
    external: [...peers, 'react', 'react-dom'].filter(p => p !== pkg),
    mainFields: ['browser', 'module', 'main'],
    loader: loaders,
    logLevel: 'silent',
    plugins: [ignoreUnresolvedPlugin],
  });
  const result = await withTimeout(build, config.maxCallTime);
  const output = result.outputFiles?.[0];
  if (!output) throw new Error('esbuild produced no output');
  return output.contents;
}

async function measure(output: Uint8Array): Promise<SizeResult> {
  const [gzipped, brotli] = await Promise.all([
    gzipAsync(output),
    brotliAsync(output, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } }),
  ]);
  return { size: output.length, gzip: gzipped.length, brotli: brotli.length };
}

async function estimatePackageSize(
  packageInfo: PackageInfo,
): Promise<SizeResult | null> {
  const paths = [path.dirname(packageInfo.fileName)];
  for (const request of [packageInfo.name, packageName(packageInfo.name)]) {
    try {
      return await measure(
        await fs.readFile(require.resolve(request, { paths })),
      );
    } catch {
      // try the package root next
    }
  }
  return null;
}

export async function calcSize(
  packageInfo: PackageInfo,
  config: ImportCostConfig,
): Promise<SizeResult> {
  let output: Uint8Array;
  try {
    output = await withBuildSlot(() => bundle(packageInfo, config));
  } catch (e) {
    if (e instanceof TimeoutError) throw e;
    const estimate = await estimatePackageSize(packageInfo);
    if (!estimate) throw e;
    return { ...estimate, estimated: true };
  }
  return measure(output);
}
