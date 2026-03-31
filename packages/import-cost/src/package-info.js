const os = require('os');
const path = require('path');
const { URI } = require('vscode-uri');
const fsAdapter = require('native-fs-adapter');
const { debouncePromise, DebounceError } = require('./debounce-promise.js');
const { version: icVersion } = require('../package.json');
const { calcSize } = require('./bundler.js');

let sizeCache = {};
const failedSize = { size: 0, gzip: 0 };
const cacheFileName = path.join(os.tmpdir(), `ic-cache-${icVersion}`);

async function getSize(pkg, config) {
  const key = `${pkg.string}#${pkg.version}`;
  await readSizeCache();
  if (sizeCache[key] === undefined || sizeCache[key] instanceof Promise) {
    try {
      sizeCache[key] = sizeCache[key] || calcPackageSize(pkg, config);
      sizeCache[key] = await sizeCache[key];
      await saveSizeCache();
    } catch (e) {
      if (e === DebounceError) {
        delete sizeCache[key];
        throw e;
      } else {
        sizeCache[key] = failedSize;
        return { ...pkg, ...sizeCache[key], error: e };
      }
    }
  }
  return { ...pkg, ...sizeCache[key] };
}

function calcPackageSize(packageInfo, config) {
  const key = `${packageInfo.fileName}#${packageInfo.line}`;
  return debouncePromise(key, (resolve, reject) => {
    calcSize(packageInfo, config, (e, result) =>
      e ? reject(e) : resolve(result),
    );
  });
}

async function clearSizeCache() {
  try {
    sizeCache = {};
    await fsAdapter.delete(URI.file(cacheFileName));
  } catch {
    // silent error
  }
}

async function readSizeCache() {
  try {
    if (Object.keys(sizeCache).length === 0) {
      sizeCache = JSON.parse(await fsAdapter.readFile(URI.file(cacheFileName)));
    }
  } catch {
    // silent error
  }
}

async function saveSizeCache() {
  try {
    const keys = Object.keys(sizeCache).filter(key => {
      const size = sizeCache[key]?.size;
      return typeof size === 'number' && size > 0;
    });
    const cache = keys.reduce(
      (obj, key) => ({ ...obj, [key]: sizeCache[key] }),
      {},
    );
    if (Object.keys(cache).length > 0) {
      await fsAdapter.writeFile(
        URI.file(cacheFileName),
        Buffer.from(JSON.stringify(cache, null, 2), 'utf8'),
      );
    }
  } catch (_e) {
    // silent error
  }
}

function cleanup() {
  // no-op: esbuild runs in-process, no workers to clean up
}

module.exports = {
  getSize,
  clearSizeCache,
  cleanup,
  cacheFileName,
};
