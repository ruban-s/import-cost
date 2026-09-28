import * as fs from 'fs/promises';
import * as path from 'path';
import type { PackageInfo } from './types';

export function packageName(importPath: string): string {
  const [first, second] = importPath.split('/');
  return first.startsWith('@') && second ? `${first}/${second}` : first;
}

export async function pkgDir(directory: string): Promise<string | undefined> {
  for (let dir = path.resolve(directory); ; dir = path.dirname(dir)) {
    try {
      await fs.stat(path.join(dir, 'package.json'));
      return dir;
    } catch {
      if (dir === path.dirname(dir)) return undefined;
    }
  }
}

async function resolvePackageJson(pkg: PackageInfo): Promise<string> {
  const name = packageName(pkg.name);
  try {
    return require.resolve(`${name}/package.json`, {
      paths: [path.dirname(pkg.fileName)],
    });
  } catch {
    // exports maps can hide package.json; fall back to walking node_modules
  }
  let dir = path.dirname(pkg.fileName);
  for (let project = await pkgDir(dir); project; project = await pkgDir(dir)) {
    const candidate = path.join(project, 'node_modules', name, 'package.json');
    try {
      await fs.stat(candidate);
      return candidate;
    } catch {
      const parent = path.dirname(project);
      if (parent === project) break;
      dir = parent;
    }
  }
  throw new Error(`Package directory not found [${pkg.name}]`);
}

export async function readPackageJson(
  pkg: PackageInfo,
): Promise<{ json: Record<string, any>; local: boolean }> {
  const file = await fs.realpath(await resolvePackageJson(pkg));
  return {
    json: JSON.parse(await fs.readFile(file, 'utf-8')),
    local: !file.split(path.sep).includes('node_modules'),
  };
}

export async function getPackageJson(
  pkg: PackageInfo,
): Promise<Record<string, any>> {
  return (await readPackageJson(pkg)).json;
}

export async function getPackageVersion(
  pkg: PackageInfo,
): Promise<string | null> {
  try {
    return `${packageName(pkg.name)}@${(await getPackageJson(pkg)).version}`;
  } catch {
    return null;
  }
}

export async function getSideEffects(
  pkg: PackageInfo,
): Promise<boolean | string[] | undefined> {
  try {
    return (await getPackageJson(pkg)).sideEffects;
  } catch {
    return undefined;
  }
}
