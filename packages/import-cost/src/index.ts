import { EventEmitter } from 'events';
import { cleanup, clearSizeCache, getSize } from './package-info';
import { getPackages } from './parser';
import type { ImportCostConfig, Lang, PackageInfo } from './types';
import { getPackageJson } from './utils';

function getPkgName(pkg: PackageInfo): string {
  const parts = pkg.name.split('/');
  let name = parts.shift()!;
  if (name.startsWith('@')) name = `${name}/${parts.shift()}`;
  return name;
}

async function resolveVersionAndSideEffects(pkg: PackageInfo): Promise<void> {
  try {
    const json = await getPackageJson(pkg);
    pkg.version = `${getPkgName(pkg)}@${json.version}`;
    pkg.sideEffects = json.sideEffects;
  } catch {
    pkg.version = null as unknown as string;
  }
}

export { DebounceError } from './debounce-promise';
export { findIgnoreFile, isIgnored, loadIgnoreFile } from './ignore';
export {
  cacheFileName,
  cleanup,
  clearSizeCache,
  getSize,
  setCacheDir,
} from './package-info';
export { getPackages } from './parser';
export type { ImportCostConfig, PackageInfo, SizeResult } from './types';
export { Lang } from './types';
export {
  getPackageVersion,
  getSideEffects,
  getSideEffects as getSideEffectsForPkg,
} from './utils';

export async function importCostAsync(
  fileName: string,
  text: string,
  language: Lang,
  config: ImportCostConfig = {
    maxCallTime: Infinity,
    concurrent: true,
    debounceDelay: 0,
  },
): Promise<PackageInfo[]> {
  let imports = getPackages(fileName, text, language).filter(
    (pkg: PackageInfo) => !pkg.name.startsWith('.'),
  );
  await Promise.allSettled(imports.map(resolveVersionAndSideEffects));
  imports = imports.filter(pkg => !!pkg.version);
  const results = await Promise.all(imports.map(pkg => getSize(pkg, config)));
  return results;
}

export function importCost(
  fileName: string,
  text: string,
  language: Lang,
  config: ImportCostConfig = { maxCallTime: Infinity, concurrent: true },
): EventEmitter {
  if ((process as any).browser) {
    config.concurrent = false;
  }
  const emitter = new EventEmitter();
  const log = (s: string) => emitter.emit('log', s);
  setTimeout(async () => {
    try {
      log(`Scanning ${fileName} for packages...`);
      let imports = getPackages(fileName, text, language).filter(
        (packageInfo: PackageInfo) => !packageInfo.name.startsWith('.'),
      );
      log(`Found ${imports.length} packages`);
      await Promise.allSettled(imports.map(resolveVersionAndSideEffects));
      imports = imports.filter(pkg => {
        log(`${pkg.version ? 'Found' : 'Skip'}: ${JSON.stringify(pkg)}`);
        return !!pkg.version;
      });
      emitter.emit('start', imports);
      const promises = imports.map(packageInfo =>
        getSize(packageInfo, config).then(result => {
          emitter.emit('calculated', result);
          return result;
        }),
      );
      emitter.emit('done', await Promise.all(promises));
    } catch (e) {
      emitter.emit('error', e);
    }
  }, 0);
  return emitter;
}
