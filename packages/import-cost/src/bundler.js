const path = require('path');
const esbuild = require('esbuild');
const { gzipSync } = require('zlib');
const {
  getPackageJson,
  getPackageModuleContainer,
  pkgDir,
} = require('./utils.js');

const nodeBuiltins = new Set(require('module').builtinModules);

async function calcSize(packageInfo, config, callback) {
  try {
    const projectDir = await pkgDir(path.dirname(packageInfo.fileName));
    const moduleContainer = await getPackageModuleContainer(packageInfo);
    const pkgJson = await getPackageJson(packageInfo);

    const externals = Object.keys(pkgJson.peerDependencies || {})
      .concat(['react', 'react-dom'])
      .filter(p => p !== packageInfo.name);

    const buildPromise = esbuild.build({
      stdin: {
        contents: packageInfo.string,
        resolveDir: path.join(projectDir, 'node_modules'),
        loader: 'js',
      },
      bundle: true,
      minify: true,
      write: false,
      platform: 'browser',
      define: { 'process.env.NODE_ENV': '"production"' },
      external: externals,
      nodePaths: [path.join(projectDir, 'node_modules'), moduleContainer],
      mainFields: ['browser', 'module', 'main'],
      loader: {
        '.css': 'empty',
        '.scss': 'empty',
        '.png': 'empty',
        '.jpg': 'empty',
        '.jpeg': 'empty',
        '.gif': 'empty',
        '.svg': 'empty',
        '.woff': 'empty',
        '.woff2': 'empty',
        '.ttf': 'empty',
        '.eot': 'empty',
        '.wav': 'empty',
      },
      logLevel: 'silent',
      plugins: [
        {
          name: 'ignore-unresolved',
          setup(build) {
            build.onResolve({ filter: /.*/ }, args => {
              const name = args.path.replace(/^node:/, '');
              if (nodeBuiltins.has(name) || name === 'electron') {
                return { path: args.path, namespace: 'empty-module' };
              }
              return null;
            });
            build.onLoad({ filter: /.*/, namespace: 'empty-module' }, () => ({
              contents: 'module.exports = {};',
              loader: 'js',
            }));
          },
        },
      ],
    });

    let result;
    if (config.maxCallTime && config.maxCallTime !== Infinity) {
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('TimeoutError')), config.maxCallTime),
      );
      result = await Promise.race([buildPromise, timeout]);
    } else {
      result = await buildPromise;
    }

    const output = Buffer.concat(
      result.outputFiles.map(f => Buffer.from(f.contents)),
    );
    const size = output.length;
    const gzip = gzipSync(output).length;
    callback(null, { size, gzip });
  } catch (e) {
    callback(e);
  }
}

module.exports = {
  calcSize,
};
