import { EventEmitter } from 'events';
import { isIgnored } from './ignore';
import { getSize } from './package-info';
import { getPackages } from './parser';
import type { ImportCostConfig, Lang, PackageInfo } from './types';
import { packageName, readPackageJson } from './utils';

export { ALTERNATIVES } from './alternatives';
export { cleanup } from './bundler';
export { DebounceError } from './debounce-promise';
export { findIgnoreFile, isIgnored, loadIgnoreFile } from './ignore';
export {
  cacheFileName,
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
  packageName,
  pkgDir,
} from './utils';

async function resolveVersionAndSideEffects(pkg: PackageInfo): Promise<void> {
  try {
    const { json, local } = await readPackageJson(pkg);
    pkg.version = `${packageName(pkg.name)}@${json.version}`;
    pkg.sideEffects = json.sideEffects;
    if (local) pkg.local = true;
  } catch {
    pkg.version = null;
  }
}

async function findPackages(
  fileName: string,
  text: string,
  language: Lang,
  config: ImportCostConfig,
): Promise<PackageInfo[]> {
  const ignore = config.ignore ?? [];
  const imports = getPackages(fileName, text, language).filter(
    pkg => !pkg.name.startsWith('.') && !isIgnored(pkg.name, ignore),
  );
  await Promise.all(imports.map(resolveVersionAndSideEffects));
  return imports.filter(pkg => pkg.version);
}

export async function importCostAsync(
  fileName: string,
  text: string,
  language: Lang,
  config: ImportCostConfig = { maxCallTime: Infinity },
): Promise<PackageInfo[]> {
  const imports = await findPackages(fileName, text, language, config);
  return Promise.all(imports.map(pkg => getSize(pkg, config)));
}

export function importCost(
  fileName: string,
  text: string,
  language: Lang,
  config: ImportCostConfig = { maxCallTime: Infinity },
): EventEmitter {
  const emitter = new EventEmitter();
  const log = (s: string) => emitter.emit('log', s);
  setTimeout(async () => {
    try {
      log(`Scanning ${fileName} for packages...`);
      const imports = await findPackages(fileName, text, language, config);
      log(`Found ${imports.length} packages`);
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
