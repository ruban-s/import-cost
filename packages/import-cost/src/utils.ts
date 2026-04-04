import * as fs from 'fs/promises';
import * as path from 'path';
import type { PackageInfo } from './types';

export async function pkgDir(directory: string): Promise<string | undefined> {
  const { root } = path.parse(directory);
  while (directory !== root) {
    try {
      await fs.stat(path.resolve(directory, 'package.json'));
      return directory;
    } catch {
      directory = path.resolve(directory, '..');
    }
  }
}

async function parseJson(dir: string): Promise<Record<string, unknown>> {
  const pkg = path.join(dir, 'package.json');
  return JSON.parse(await fs.readFile(pkg, 'utf-8'));
}

function getPackageName(pkg: PackageInfo): string {
  const pkgParts = pkg.name.split('/');
  let pkgName = pkgParts.shift()!;
  if (pkgName.startsWith('@')) {
    pkgName = path.join(pkgName, pkgParts.shift()!);
  }
  return pkgName;
}

export async function getPackageModuleContainer(
  pkg: PackageInfo,
): Promise<string> {
  let currentDir = path.dirname(pkg.fileName);
  let foundDir = '';
  const pkgName = getPackageName(pkg);

  while (!foundDir) {
    const projectDir = await pkgDir(currentDir);
    if (!projectDir) {
      throw new Error(`Package directory not found [${pkg.name}]`);
    }
    const modulesDirectory = path.join(projectDir, 'node_modules');
    try {
      await fs.stat(path.resolve(modulesDirectory, pkgName));
      foundDir = modulesDirectory;
    } catch {
      currentDir = path.resolve(projectDir, '..');
    }
  }
  return foundDir;
}

export async function findMonorepoRoot(
  startDir: string,
): Promise<string | null> {
  let dir = startDir;
  const { root } = path.parse(dir);
  while (dir !== root) {
    try {
      const pkgJsonPath = path.resolve(dir, 'package.json');
      const content = await fs.readFile(pkgJsonPath, 'utf-8');
      const pkgJson = JSON.parse(content);
      if (pkgJson.workspaces) {
        return dir;
      }
      try {
        await fs.stat(path.resolve(dir, 'pnpm-workspace.yaml'));
        return dir;
      } catch {
        // not a pnpm workspace root
      }
    } catch {
      // no package.json at this level
    }
    dir = path.resolve(dir, '..');
  }
  return null;
}

export async function getAllNodeModulePaths(
  fileName: string,
): Promise<string[]> {
  const fileDir = path.dirname(fileName);
  const paths: string[] = [];
  const seen = new Set<string>();

  const projectDir = await pkgDir(fileDir);
  if (projectDir) {
    const localNm = path.join(projectDir, 'node_modules');
    paths.push(localNm);
    seen.add(localNm);
  }

  const monoRoot = await findMonorepoRoot(fileDir);
  if (monoRoot) {
    const rootNm = path.join(monoRoot, 'node_modules');
    if (!seen.has(rootNm)) {
      paths.push(rootNm);
      seen.add(rootNm);
    }
  }

  return paths;
}

async function getPackageDirectory(pkg: PackageInfo): Promise<string> {
  const pkgName = getPackageName(pkg);
  const tmp = await getPackageModuleContainer(pkg);
  return path.resolve(tmp, pkgName);
}

export async function getPackageVersion(
  pkg: PackageInfo,
): Promise<string | null> {
  try {
    return `${getPackageName(pkg)}@${(await getPackageJson(pkg)).version}`;
  } catch {
    return null;
  }
}

export async function getPackageJson(
  pkg: PackageInfo,
): Promise<Record<string, any>> {
  return await parseJson(await getPackageDirectory(pkg));
}
