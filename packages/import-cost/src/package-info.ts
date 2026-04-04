import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { calcSize } from './bundler';
import { DebounceError, debouncePromise } from './debounce-promise';
import type { ImportCostConfig, PackageInfo, SizeResult } from './types';

const { version: icVersion } = require('../package.json');

let sizeCache: Record<string, SizeResult | Promise<SizeResult>> = {};
const failedSize: SizeResult = { size: 0, gzip: 0 };
export const cacheFileName = path.join(os.tmpdir(), `ic-cache-${icVersion}`);

export async function getSize(
  pkg: PackageInfo,
  config: ImportCostConfig,
): Promise<PackageInfo> {
  const key = `${pkg.string}#${pkg.version}`;
  await readSizeCache();
  if (sizeCache[key] === undefined || sizeCache[key] instanceof Promise) {
    try {
      sizeCache[key] = sizeCache[key] || calcPackageSize(pkg, config);
      sizeCache[key] = await sizeCache[key];
      await saveSizeCache();
    } catch (e) {
      if (e === DebounceError) {
        delete sizeCache[key];
        throw e;
      } else {
        sizeCache[key] = failedSize;
        return { ...pkg, ...sizeCache[key], error: e as Error };
      }
    }
  }
  return { ...pkg, ...(sizeCache[key] as SizeResult) };
}

function calcPackageSize(
  packageInfo: PackageInfo,
  config: ImportCostConfig,
): Promise<SizeResult> {
  const key = `${packageInfo.fileName}#${packageInfo.line}`;
  return debouncePromise<SizeResult>(key, (resolve, reject) => {
    calcSize(packageInfo, config, (e, result) =>
      e ? reject(e) : resolve(result!),
    );
  });
}

export async function clearSizeCache(): Promise<void> {
  try {
    sizeCache = {};
    await fs.unlink(cacheFileName);
  } catch {
    // silent error
  }
}

async function readSizeCache(): Promise<void> {
  try {
    if (Object.keys(sizeCache).length === 0) {
      sizeCache = JSON.parse(await fs.readFile(cacheFileName, 'utf-8'));
    }
  } catch {
    // silent error
  }
}

async function saveSizeCache(): Promise<void> {
  try {
    const keys = Object.keys(sizeCache).filter(key => {
      const entry = sizeCache[key];
      const size =
        entry && !(entry instanceof Promise) ? entry.size : undefined;
      return typeof size === 'number' && size > 0;
    });
    const cache: Record<string, SizeResult> = {};
    for (const key of keys) {
      cache[key] = sizeCache[key] as SizeResult;
    }
    if (Object.keys(cache).length > 0) {
      await fs.writeFile(
        cacheFileName,
        JSON.stringify(cache, null, 2),
        'utf-8',
      );
    }
  } catch {
    // silent error
  }
}

export function cleanup(): void {
  // no-op: esbuild runs in-process, no workers to clean up
}
