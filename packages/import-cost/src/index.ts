import { EventEmitter } from 'events';
import { cleanup, clearSizeCache, getSize } from './package-info';
import { getPackages } from './parser';
import type { ImportCostConfig, Lang, PackageInfo } from './types';
import { getPackageVersion, getSideEffects } from './utils';

export { DebounceError } from './debounce-promise';
export { cacheFileName, cleanup, clearSizeCache } from './package-info';
export type { ImportCostConfig, PackageInfo, SizeResult } from './types';
export { Lang } from './types';
export { getSideEffects } from './utils';

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
      await Promise.allSettled(
        imports.map(async pkg => {
          pkg.version = await getPackageVersion(pkg);
          pkg.sideEffects = await getSideEffects(pkg);
        }),
      );
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
