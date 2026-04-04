import { getPackages as getPackagesFromJS } from './swc-parser';
import type { PackageInfo } from './types';
import { Lang } from './types';

function extractScriptFromHtml(html: string): string {
  try {
    const match = html.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    return match ? match[1] : '';
  } catch (e) {
    console.error(`ERR`, e);
    return '';
  }
}

function getScriptTagLineNumber(html: string): number {
  const splitted = html.split('\n');
  for (let i = 0; i < splitted.length; i++) {
    if (/<script/.test(splitted[i])) {
      return i;
    }
  }
  return 0;
}

export function getPackages(
  fileName: string,
  source: string,
  language: Lang,
): PackageInfo[] {
  if ([Lang.SVELTE, Lang.VUE].some(l => l === language)) {
    const scriptSource = extractScriptFromHtml(source);
    const scriptLine = getScriptTagLineNumber(source);
    return getPackagesFromJS(
      fileName,
      scriptSource,
      Lang.TYPESCRIPT,
      scriptLine,
    );
  } else if ([Lang.TYPESCRIPT, Lang.JAVASCRIPT].some(l => l === language)) {
    return getPackagesFromJS(fileName, source, language);
  } else {
    return [];
  }
}
