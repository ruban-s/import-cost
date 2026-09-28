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
let loading: Promise<void> | null = null;
let saving: Promise<void> | null = null;
let dirty = false;

function getCacheFilePath(config?: ImportCostConfig): string {
  const dir = config?.cacheDir || activeCacheDir || os.tmpdir();
  return path.join(dir, `ic-cache-${icVersion}`);
}

export const cacheFileName = path.join(os.tmpdir(), `ic-cache-${icVersion}`);

export function setCacheDir(dir: string): void {
  activeCacheDir = dir;
  loading = null;
}

export async function getSize(
  pkg: PackageInfo,
  config: ImportCostConfig,
): Promise<PackageInfo> {
  const cacheable = !pkg.local;
  const key = `${pkg.string}#${pkg.version}`;
  if (cacheable) await readSizeCache(config);
  let entry = cacheable ? sizeCache[key] : undefined;
  if (entry === undefined || entry instanceof Promise) {
    const pending = entry ?? calcPackageSize(pkg, config);
    if (cacheable) sizeCache[key] = pending;
    try {
      const result = await pending;
      entry = { ...result, lastUsed: Date.now() };
      if (cacheable) {
        sizeCache[key] = entry;
        if (!result.estimated) await saveSizeCache(config);
      }
    } catch (e) {
      if (sizeCache[key] === pending) delete sizeCache[key];
      if (e === DebounceError) throw e;
      return { ...pkg, size: 0, gzip: 0, brotli: 0, error: e as Error };
    }
  } else {
    entry.lastUsed = Date.now();
  }
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
  const delay = config.debounceDelay ?? 0;
  if (delay === 0) return calcSize(packageInfo, config);
  return debouncePromise(
    `${packageInfo.fileName}#${packageInfo.line}`,
    () => calcSize(packageInfo, config),
    delay,
  );
}

export async function clearSizeCache(): Promise<void> {
  sizeCache = {};
  loading = null;
  try {
    await fs.unlink(getCacheFilePath());
  } catch {
    // no cache file yet
  }
}

function readSizeCache(config?: ImportCostConfig): Promise<void> {
  loading ??= (async () => {
    try {
      const raw: Record<string, Partial<CacheEntry>> = JSON.parse(
        await fs.readFile(getCacheFilePath(config), 'utf-8'),
      );
      for (const [key, value] of Object.entries(raw)) {
        if (sizeCache[key] || typeof value.size !== 'number') continue;
        if (value.estimated) continue;
        sizeCache[key] = {
          size: value.size,
          gzip: value.gzip ?? 0,
          brotli: value.brotli ?? 0,
          lastUsed: value.lastUsed ?? Date.now(),
        };
      }
    } catch {
      // missing or unreadable cache file: start empty
    }
  })();
  return loading;
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

function saveSizeCache(config?: ImportCostConfig): Promise<void> {
  dirty = true;
  saving ??= (async () => {
    while (dirty) {
      dirty = false;
      await writeSizeCache(config);
    }
    saving = null;
  })();
  return saving;
}

async function writeSizeCache(config?: ImportCostConfig): Promise<void> {
  evictIfNeeded();
  const cache: Record<string, CacheEntry> = {};
  for (const [key, entry] of Object.entries(sizeCache)) {
    if (entry instanceof Promise || entry.estimated || !(entry.size > 0)) {
      continue;
    }
    cache[key] = entry;
  }
  if (Object.keys(cache).length === 0) return;
  const filePath = getCacheFilePath(config);
  const tmpPath = `${filePath}.tmp.${process.pid}`;
  try {
    await fs.writeFile(tmpPath, JSON.stringify(cache), 'utf-8');
    await fs.rename(tmpPath, filePath);
  } catch {
    // best-effort persistence: a failed write only costs a recompute later
  }
}
