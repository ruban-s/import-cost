import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { calcSize } from './bundler';
import { DebounceError, debouncePromise } from './debounce-promise';
import type { ImportCostConfig, PackageInfo, SizeResult } from './types';

const { version: icVersion } = require('../package.json');

const MAX_CACHE_ENTRIES = 5000;

interface CacheEntry extends SizeResult {
  lastUsed: number;
}

let sizeCache: Record<string, CacheEntry | Promise<SizeResult>> = {};
let activeCacheDir: string | null = null;

function getCacheFilePath(config?: ImportCostConfig): string {
  const dir = config?.cacheDir || activeCacheDir || os.tmpdir();
  return path.join(dir, `ic-cache-${icVersion}`);
}

export const cacheFileName = path.join(os.tmpdir(), `ic-cache-${icVersion}`);

export function setCacheDir(dir: string): void {
  activeCacheDir = dir;
}

export async function getSize(
  pkg: PackageInfo,
  config: ImportCostConfig,
): Promise<PackageInfo> {
  const key = `${pkg.string}#${pkg.version}`;
  await readSizeCache(config);
  if (sizeCache[key] === undefined || sizeCache[key] instanceof Promise) {
    try {
      sizeCache[key] = sizeCache[key] || calcPackageSize(pkg, config);
      const result = await (sizeCache[key] as Promise<SizeResult>);
      sizeCache[key] = { ...result, lastUsed: Date.now() };
      await saveSizeCache(config);
    } catch (e) {
      delete sizeCache[key];
      if (e === DebounceError) throw e;
      return { ...pkg, size: 0, gzip: 0, brotli: 0, error: e as Error };
    }
  } else {
    (sizeCache[key] as CacheEntry).lastUsed = Date.now();
  }
  const entry = sizeCache[key] as CacheEntry;
  return {
    ...pkg,
    size: entry.size,
    gzip: entry.gzip,
    brotli: entry.brotli,
    estimated: entry.estimated,
  };
}

function calcPackageSize(
  packageInfo: PackageInfo,
  config: ImportCostConfig,
): Promise<SizeResult> {
  const delay = config.debounceDelay ?? 500;
  if (delay === 0) {
    return new Promise<SizeResult>((resolve, reject) => {
      calcSize(packageInfo, config, (e, result) =>
        e ? reject(e) : resolve(result!),
      );
    });
  }
  const key = `${packageInfo.fileName}#${packageInfo.line}`;
  return debouncePromise<SizeResult>(
    key,
    (resolve, reject) => {
      calcSize(packageInfo, config, (e, result) =>
        e ? reject(e) : resolve(result!),
      );
    },
    delay,
  );
}

export async function clearSizeCache(): Promise<void> {
  try {
    sizeCache = {};
    await fs.unlink(getCacheFilePath());
  } catch {
    // silent error
  }
}

async function readSizeCache(config?: ImportCostConfig): Promise<void> {
  try {
    if (Object.keys(sizeCache).length === 0) {
      const raw = JSON.parse(
        await fs.readFile(getCacheFilePath(config), 'utf-8'),
      );
      for (const [key, value] of Object.entries(raw)) {
        const entry = value as any;
        sizeCache[key] = {
          size: entry.size,
          gzip: entry.gzip,
          brotli: entry.brotli,
          estimated: entry.estimated,
          lastUsed: entry.lastUsed || Date.now(),
        };
      }
    }
  } catch {
    // silent error
  }
}

function evictIfNeeded(): void {
  const keys = Object.keys(sizeCache).filter(
    k => !(sizeCache[k] instanceof Promise),
  );
  if (keys.length <= MAX_CACHE_ENTRIES) return;

  const entries = keys.map(k => ({
    key: k,
    lastUsed: (sizeCache[k] as CacheEntry).lastUsed || 0,
  }));
  entries.sort((a, b) => a.lastUsed - b.lastUsed);

  const toRemove = entries.slice(0, keys.length - MAX_CACHE_ENTRIES);
  for (const { key } of toRemove) {
    delete sizeCache[key];
  }
}

async function saveSizeCache(config?: ImportCostConfig): Promise<void> {
  try {
    evictIfNeeded();
    const keys = Object.keys(sizeCache).filter(key => {
      const entry = sizeCache[key];
      const size =
        entry && !(entry instanceof Promise) ? entry.size : undefined;
      return typeof size === 'number' && size > 0;
    });
    const cache: Record<string, CacheEntry> = {};
    for (const key of keys) {
      cache[key] = sizeCache[key] as CacheEntry;
    }
    if (Object.keys(cache).length > 0) {
      const filePath = getCacheFilePath(config);
      const tmpPath = `${filePath}.tmp.${process.pid}`;
      await fs.writeFile(tmpPath, JSON.stringify(cache, null, 2), 'utf-8');
      await fs.rename(tmpPath, filePath);
    }
  } catch {
    // silent error
  }
}

export function cleanup(): void {
  // no-op: esbuild runs in-process, no workers to clean up
}
