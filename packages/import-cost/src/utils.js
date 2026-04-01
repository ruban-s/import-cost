const path = require('path');
const { URI } = require('vscode-uri');
const fsAdapter = require('native-fs-adapter');

async function pkgDir(directory) {
  const { root } = path.parse(directory);
  while (directory !== root) {
    try {
      await fsAdapter.stat(URI.file(path.resolve(directory, 'package.json')));
      return directory;
    } catch {
      directory = path.resolve(directory, '..');
    }
  }
}

async function parseJson(dir) {
  const pkg = path.join(dir, 'package.json');
  return JSON.parse(await fsAdapter.readFile(URI.file(pkg)));
}

function getPackageName(pkg) {
  const pkgParts = pkg.name.split('/');
  let pkgName = pkgParts.shift();
  if (pkgName.startsWith('@')) {
    pkgName = path.join(pkgName, pkgParts.shift());
  }
  return pkgName;
}

async function getPackageModuleContainer(pkg) {
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
      await fsAdapter.stat(URI.file(path.resolve(modulesDirectory, pkgName)));
      foundDir = modulesDirectory;
    } catch {
      currentDir = path.resolve(projectDir, '..');
    }
  }
  return foundDir;
}

// Find the monorepo root by looking for a root package.json with "workspaces" field
async function findMonorepoRoot(startDir) {
  let dir = startDir;
  const { root } = path.parse(dir);
  while (dir !== root) {
    try {
      const pkgJsonPath = path.resolve(dir, 'package.json');
      const content = await fsAdapter.readFile(URI.file(pkgJsonPath));
      const pkgJson = JSON.parse(content);
      if (pkgJson.workspaces) {
        return dir;
      }
      // Also check for pnpm-workspace.yaml
      try {
        await fsAdapter.stat(URI.file(path.resolve(dir, 'pnpm-workspace.yaml')));
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

// Collect all node_modules paths from file location up to monorepo root
async function getAllNodeModulePaths(fileName) {
  const fileDir = path.dirname(fileName);
  const paths = [];
  const seen = new Set();

  // Start from the nearest package.json
  const projectDir = await pkgDir(fileDir);
  if (projectDir) {
    const localNm = path.join(projectDir, 'node_modules');
    paths.push(localNm);
    seen.add(localNm);
  }

  // Walk up to find the monorepo root
  const monoRoot = await findMonorepoRoot(fileDir);
  if (monoRoot) {
    const rootNm = path.join(monoRoot, 'node_modules');
    if (!seen.has(rootNm)) {
      paths.push(rootNm);
      seen.add(rootNm);
    }
  }

  // Also try the module container for the specific package (handles nested node_modules)
  return paths;
}

async function getPackageDirectory(pkg) {
  const pkgName = getPackageName(pkg);
  const tmp = await getPackageModuleContainer(pkg);
  return path.resolve(tmp, pkgName);
}

async function getPackageVersion(pkg) {
  try {
    return `${getPackageName(pkg)}@${(await getPackageJson(pkg)).version}`;
  } catch {
    return null;
  }
}

async function getPackageJson(pkg) {
  return await parseJson(await getPackageDirectory(pkg));
}

module.exports = {
  getPackageModuleContainer,
  getPackageVersion,
  getPackageJson,
  pkgDir,
  findMonorepoRoot,
  getAllNodeModulePaths,
};
