import { getPackages as getPackagesFromJS } from './js-parser';
import type { PackageInfo } from './types';
import { Lang } from './types';

function getPackagesFromScripts(
  fileName: string,
  source: string,
): PackageInfo[] {
  const packages: PackageInfo[] = [];
  for (const match of source.matchAll(
    /(<script[^>]*>)([\s\S]*?)<\/script>/gi,
  )) {
    const contentStart = (match.index ?? 0) + match[1].length;
    const lineOffset = source.slice(0, contentStart).split('\n').length - 1;
    packages.push(
      ...getPackagesFromJS(fileName, match[2], Lang.TYPESCRIPT, lineOffset),
    );
  }
  return packages;
}

export function getPackages(
  fileName: string,
  source: string,
  language: Lang,
): PackageInfo[] {
  if (language === Lang.SVELTE || language === Lang.VUE) {
    return getPackagesFromScripts(fileName, source);
  }
  if (language === Lang.TYPESCRIPT || language === Lang.JAVASCRIPT) {
    return getPackagesFromJS(fileName, source, language);
  }
  return [];
}
