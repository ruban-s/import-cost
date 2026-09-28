import { expect } from 'chai';
import { spawn, spawnSync } from 'child_process';
import type { EventEmitter } from 'events';
import * as fs from 'fs';
import { createRequire } from 'module';
import * as os from 'os';
import * as path from 'path';
import type { ImportCostConfig, PackageInfo } from '../dist/index.js';
import {
  cleanup,
  clearSizeCache,
  DebounceError,
  getPackages,
  importCostAsync,
  Lang,
  packageName,
  importCost as runner,
  setCacheDir,
} from '../dist/index.js';

const FAST: ImportCostConfig = { maxCallTime: Infinity, debounceDelay: 0 };
const { version } = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, '..', 'package.json'), 'utf8'),
);
const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ic-test-cache-'));
const cacheFile = path.join(cacheDir, `ic-cache-${version}`);
const cli = path.join(import.meta.dirname, '..', 'dist', 'cli.js');

function fixture(fileName: string): string {
  return path.join(import.meta.dirname, 'fixtures', fileName);
}

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function tempProject(): string {
  const dir = tempDir('ic-proj-');
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    '{"name":"tmp","version":"1.0.0"}',
  );
  fs.cpSync(fixture('node_modules/chai'), path.join(dir, 'node_modules/chai'), {
    recursive: true,
  });
  return dir;
}

function removeChaiCode(dir: string): void {
  fs.rmSync(path.join(dir, 'node_modules/chai/index.js'));
}

async function measure(
  dir: string,
  source: string,
  language: Lang = Lang.JAVASCRIPT,
  config: ImportCostConfig = FAST,
): Promise<PackageInfo> {
  const [pkg] = await importCostAsync(
    path.join(dir, 'a.js'),
    source,
    language,
    config,
  );
  return pkg;
}

function whenDone(emitter: EventEmitter): Promise<PackageInfo[]> {
  return new Promise((resolve, reject) => {
    let start: PackageInfo[] | undefined;
    const calculated: PackageInfo[] = [];
    emitter.on('start', (packages: PackageInfo[]) => {
      expect(start).to.equal(undefined);
      start = packages;
    });
    emitter.on('calculated', (packages: PackageInfo) =>
      calculated.push(packages),
    );
    emitter.on('done', (packages: PackageInfo[]) => {
      expect(start!.length).to.equal(packages.length);
      expect(calculated.length).to.equal(packages.length);
      resolve(packages);
    });
    emitter.on('error', reject);
  });
}

const LANGUAGES: Record<string, Lang> = {
  ts: Lang.TYPESCRIPT,
  js: Lang.JAVASCRIPT,
  jsx: Lang.JAVASCRIPT,
  vue: Lang.VUE,
  svelte: Lang.SVELTE,
};

async function check(
  fileName: string,
  pkg?: string,
  config: ImportCostConfig = FAST,
): Promise<PackageInfo | undefined> {
  const language = LANGUAGES[fileName.split('.').pop()!];
  const content = fs.readFileSync(fixture(fileName), 'utf-8');
  const emitter = runner(fixture(fileName), content, language, config);
  return (await whenDone(emitter)).find(x => x.name === pkg);
}

async function verify(
  fileName: string,
  pkg = 'chai',
  minSize = 10000,
  maxSize = 15000,
  gzipLowBound = 0.01,
  gzipHighBound = 0.8,
): Promise<void> {
  const { size, gzip } = (await check(fileName, pkg))!;
  expect(size).to.be.within(minSize, maxSize);
  expect(gzip).to.be.within(size! * gzipLowBound, size! * gzipHighBound);
}

describe('importCost', () => {
  before(() => setCacheDir(cacheDir));
  beforeEach(() => clearSizeCache());
  afterEach(() => clearSizeCache());
  after(async () => {
    await cleanup();
    fs.rmSync(cacheDir, { recursive: true, force: true });
  });

  describe('imports', () => {
    it('calculates size of require in javascript', () => {
      return verify('require.js');
    });
    it('calculates size of require in typescript', () => {
      return verify('require.ts');
    });
    it('calculates size of template require in javascript', () => {
      return verify('require-template.js');
    });
    it('calculates size of template require in typescript', () => {
      return verify('require-template.ts');
    });
    it('calculates size of import in javascript', () => {
      return verify('import.js');
    });
    it('calculates size of import in typescript', () => {
      return verify('import.ts');
    });
    it('calculate size of imports in a file containing typescript features not supported by babel', () => {
      return verify('typescript-not-supported-features.ts');
    });
    it('calculates size of aliased import in javascript', () => {
      return verify('import-aliased.js');
    });
    it('calculates size of aliased import in typescript', () => {
      return verify('import-aliased.ts');
    });
    it('calculates size of import with no semicolon in typescript', () => {
      return verify('import-no-semicolon.ts');
    });
    it('calculates size of legacy import in javascript', () => {
      return verify('import-legacy.js');
    });
    it('calculates size of legacy import in typescript', () => {
      return verify('import-legacy.ts');
    });
    it('calculates size of node import in javascript', () => {
      return verify('import-node.js', 'node-stuff');
    });
    it('calculates size of namespace import in javascript', () => {
      return verify('import-namespace.js');
    });
    it('calculates size of imports in a file with shorthand react fragments', () => {
      return verify('react-fragments.jsx');
    });
    it('calculates size of namespace import in typescript', () => {
      return verify('import-namespace.ts');
    });
    it('calculates size of specifiers import in javascript', () => {
      return verify('import-specifiers.js');
    });
    it('calculates size of specifiers import in typescript', () => {
      return verify('import-specifiers.ts');
    });
    it('calculates size of mixed default+named import in javascript', () => {
      return verify('import-mixed.js');
    });
    it('calculates size of mixed default+named import in typescript', () => {
      return verify('import-mixed.ts');
    });
    it('calculates size of mixed default+global import in javascript', () => {
      return verify('import-global-mixed.js', 'react');
    });
    it('calculates size of mixed default+global import in typescript', () => {
      return verify('import-global-mixed.ts', 'react');
    });
    it('calculates size of cherry pick import in javascript', () => {
      return verify('import-cherry.js', 'chai/abc');
    });
    it('calculates size of cherry pick import in typescript', () => {
      return verify('import-cherry.ts', 'chai/abc');
    });
    it('calculates size of scoped import in javascript', () => {
      return verify('import-scoped.js', '@angular/core');
    });
    it('calculates size of scoped import in typescript', () => {
      return verify('import-scoped.ts', '@angular/core');
    });
    it('calculates size of scoped esm import in javascript', () => {
      return verify('import-scoped-esm.js', '@angular/core/esm');
    });
    it('calculates size of scoped esm import in typescript', () => {
      return verify('import-scoped-esm.ts', '@angular/core/esm');
    });
    it('calculates size of shaken import in javascript', () => {
      return verify('import-shaken.js', 'react', 30, 300, 0.01, 1.5);
    });
    it('calculates size of shaken import in typescript', () => {
      return verify('import-shaken.ts', 'react', 30, 300, 0.01, 1.5);
    });
    it('calculates size of production env import in javascript', () => {
      return verify('import-env.js', 'react-dom', 30, 300, 0.01, 1.5);
    });
    it('calculates size of production env import in typescript', () => {
      return verify('import-env.ts', 'react-dom', 30, 300, 0.01, 1.5);
    });
    it('calculates size without externals', () => {
      return verify('import-externals.js', 'wix-style', 30, 400);
    });
    it('calculates size without peerDependencies', () => {
      return verify('import-peer.js', 'haspeerdeps', 30, 300);
    });
    it('supports a monorepo-like structure', () => {
      return verify('yarn-workspace/import-nested-project.js', 'chai');
    });
    it('supports a monorepo-like structure with scoped module', () => {
      return verify('yarn-workspace/import-with-scope.js', '@angular/core');
    });
    it('supports a monorepo-like structure with scoped module and file name', () => {
      return verify(
        'yarn-workspace/import-with-scope-filename.js',
        '@angular/core/index.js',
      );
    });
    it('calculates size of a dynamic import in javascript', () => {
      return verify('dynamic-import.js');
    });
    it('calculates size of a dynamic import in typescript', () => {
      return verify('dynamic-import.ts');
    });
    it('calculates size of a vue script', () => {
      return verify('vue.vue');
    });
    it('calculates size of a svelte script', () => {
      return verify('svelte.svelte');
    });
  });

  describe('caching', () => {
    it('serves repeated imports from cache regardless of specifier order', async () => {
      for (const language of [Lang.JAVASCRIPT, Lang.TYPESCRIPT]) {
        const dir = tempProject();
        const first = await measure(
          dir,
          `import { expect, assert } from 'chai';`,
          language,
        );
        removeChaiCode(dir);
        const again = await measure(
          dir,
          `import { assert, expect } from 'chai';`,
          language,
        );
        expect(again.error).to.equal(undefined);
        expect(again.size).to.equal(first.size);
      }
    });
    it('debounces consecutive calculations of the same import line', async () => {
      const line = (x: string) =>
        whenDone(
          runner(fixture('import.js'), x, Lang.JAVASCRIPT, {
            maxCallTime: Infinity,
            debounceDelay: 1000,
          }),
        );
      const first = line('import "chai";');
      await new Promise(resolve => setTimeout(resolve, 200));
      const second = line('import "chai/index";');
      await Promise.all([
        expect(first).to.be.rejectedWith(DebounceError),
        expect(second).to.be.fulfilled,
      ]);
    });
    it('persists results to disk and reloads them', async () => {
      const dir = tempProject();
      const first = await measure(dir, `import chai from 'chai';`);
      const saved = fs.readFileSync(cacheFile);
      await clearSizeCache();
      fs.writeFileSync(cacheFile, saved);
      removeChaiCode(dir);
      const again = await measure(dir, `import chai from 'chai';`);
      expect(again.size).to.equal(first.size);
    });
    it('keeps estimated sizes out of the disk cache', async () => {
      await verify('import.js');
      const pkg = (await check('failed-bundle.js', 'jest'))!;
      expect(pkg.estimated).to.equal(true);
      const disk = fs.readFileSync(cacheFile, 'utf8');
      expect(disk).to.include("from 'chai'");
      expect(disk).not.to.include("from 'jest'");
    });
    it('never writes the cache file concurrently', async () => {
      const names = ['expect', 'assert', 'should', 'use', 'util', 'config'];
      const source = names
        .flatMap((a, i) =>
          names.slice(i + 1).map(b => `import { ${a}, ${b} } from 'chai';`),
        )
        .join('\n');
      const fsp = createRequire(import.meta.url)('fs/promises');
      const writeFile = fsp.writeFile;
      let writing = 0;
      let peak = 0;
      fsp.writeFile = async (file: string, ...rest: unknown[]) => {
        if (!String(file).startsWith(cacheFile))
          return writeFile(file, ...rest);
        peak = Math.max(peak, ++writing);
        try {
          return await writeFile(file, ...rest);
        } finally {
          writing--;
        }
      };
      let results: PackageInfo[];
      try {
        results = await importCostAsync(
          fixture('import.js'),
          source,
          Lang.JAVASCRIPT,
          FAST,
        );
      } finally {
        fsp.writeFile = writeFile;
      }
      expect(results).to.have.length(15);
      expect(peak).to.equal(1);
      expect(
        Object.keys(JSON.parse(fs.readFileSync(cacheFile, 'utf8'))),
      ).to.have.length(15);
    });
    it('re-measures workspace packages instead of caching them', async () => {
      const root = tempDir('ic-ws-');
      const lib = path.join(root, 'packages', 'lib');
      const app = path.join(root, 'app');
      fs.mkdirSync(lib, { recursive: true });
      fs.mkdirSync(path.join(app, 'node_modules'), { recursive: true });
      fs.writeFileSync(
        path.join(lib, 'package.json'),
        '{"name":"lib","version":"0.0.0","main":"index.js"}',
      );
      fs.writeFileSync(path.join(lib, 'index.js'), 'export const a = 1;');
      fs.writeFileSync(
        path.join(app, 'package.json'),
        '{"name":"app","version":"1.0.0"}',
      );
      fs.symlinkSync(lib, path.join(app, 'node_modules', 'lib'), 'junction');
      const before = await measure(app, `import { a } from 'lib';`);
      expect(before.local).to.equal(true);
      fs.writeFileSync(
        path.join(lib, 'index.js'),
        `export const a = ${JSON.stringify('x'.repeat(2000))};`,
      );
      const after = await measure(app, `import { a } from 'lib';`);
      expect(after.size).to.be.above(before.size! + 1000);
    });
  });

  describe('error handling', () => {
    it('not added to package list if dependency is missing', async () => {
      expect(await check('failed-missing.js', 'sinon')).to.eql(undefined);
    });
    it('returns fallback size if bundle fails', async () => {
      const pkg = await check('failed-bundle.js', 'jest');
      expect(pkg!.size).to.be.above(0);
    });
    it('marks fallback sizes as estimated', async () => {
      const pkg = await check('failed-bundle.js', 'jest');
      expect(pkg!.estimated).to.equal(true);
    });
    it('errors on broken javascript', () => {
      return expect(check('incomplete.bad.js')).to.be.rejected;
    });
    it('errors on broken typescript', () => {
      return expect(check('incomplete.bad.ts')).to.be.rejected;
    });
    it('errors on broken vue', () => {
      return expect(check('incomplete.bad.vue')).to.be.rejected;
    });
    it('completes with empty array for unknown file type', async () => {
      expect(await check('import.flow', 'chai')).to.eql(undefined);
    });
    it('reports timeouts as errors and does not cache them', async () => {
      const dir = tempProject();
      const slow = path.join(dir, 'node_modules', 'slow');
      fs.mkdirSync(slow);
      fs.writeFileSync(
        path.join(slow, 'package.json'),
        '{"name":"slow","version":"1.0.0","main":"index.js"}',
      );
      const modules = Array.from({ length: 400 }, (_, i) => `m${i}`);
      for (const m of modules) {
        fs.writeFileSync(path.join(slow, `${m}.js`), `export const ${m} = 1;`);
      }
      fs.writeFileSync(
        path.join(slow, 'index.js'),
        modules.map(m => `export * from './${m}.js';`).join('\n'),
      );
      const source = `import * as slow from 'slow';`;
      const timedOut = await measure(dir, source, Lang.JAVASCRIPT, {
        maxCallTime: 1,
        debounceDelay: 0,
      });
      expect(timedOut.error?.name).to.equal('TimeoutError');
      expect(timedOut.size).to.equal(0);
      const real = await measure(dir, source);
      expect(real.error).to.equal(undefined);
      expect(real.estimated).to.not.equal(true);
      expect(real.size).to.be.above(0);
    });
    it('terminates for relative file names outside any package', async () => {
      const cwd = process.cwd();
      process.chdir(tempDir('ic-nopkg-'));
      try {
        const result = await importCostAsync(
          'Untitled-1',
          `import x from 'definitely-not-installed';`,
          Lang.JAVASCRIPT,
          FAST,
        );
        expect(result).to.eql([]);
      } finally {
        process.chdir(cwd);
      }
    });
  });

  describe('parsing', () => {
    it('detects line number using offset for static imports', () => {
      const source = `import {\n  expect\n} from 'chai';\n`;
      const packages = getPackages(
        fixture('import.js'),
        source,
        Lang.JAVASCRIPT,
      );
      expect(packages).to.have.length(1);
      expect(packages[0].name).to.equal('chai');
      expect(packages[0].line).to.equal(1);
    });
    it('detects line number for imports not on first line', () => {
      const source = `const x = 1;\nconst y = 2;\nimport chai from 'chai';\n`;
      const packages = getPackages(
        fixture('import.js'),
        source,
        Lang.JAVASCRIPT,
      );
      const pkg = packages.find(p => p.name === 'chai');
      expect(pkg).to.not.be.undefined;
      expect(pkg!.line).to.equal(3);
    });
    it('handles require on correct line', () => {
      const source = `// comment\n// another\nconst x = require('chai');\n`;
      const packages = getPackages(
        fixture('require.js'),
        source,
        Lang.JAVASCRIPT,
      );
      const pkg = packages.find(p => p.name === 'chai');
      expect(pkg).to.not.be.undefined;
      expect(pkg!.line).to.equal(3);
    });
    it('keeps line numbers after import = require without a semicolon', () => {
      const source = `import fs = require('fs')\n\nimport chai from 'chai';\n`;
      const pkg = getPackages(
        fixture('import.ts'),
        source,
        Lang.TYPESCRIPT,
      ).find(p => p.name === 'chai');
      expect(pkg?.line).to.equal(3);
    });
    it('ignores require() calls inside comments', () => {
      const source = `// const a = require('chai')\n/* require('react') */\nconst b = require('react-dom');\n`;
      const names = getPackages(
        fixture('require.js'),
        source,
        Lang.JAVASCRIPT,
      ).map(p => p.name);
      expect(names).to.eql(['react-dom']);
    });
    it('keeps default+named imports when JSX forces the regex fallback', () => {
      const source = `import React, { useState } from 'react';\nexport const A = () => <span>Due 12/31</span>;\n`;
      const [pkg] = getPackages(fixture('import.js'), source, Lang.JAVASCRIPT);
      expect(pkg?.name).to.equal('react');
      expect(pkg.string).to.include('import React, {useState}');
    });
    it('reads every <script> block in vue and svelte files', () => {
      const vue = `<script lang="ts">\nexport default {}\n</script>\n\n<script setup lang="ts">\nimport { expect } from 'chai';\n</script>\n`;
      const svelte = `<script context="module">\nimport React from 'react';\n</script>\n<script>\nimport { expect } from 'chai';\n</script>\n`;
      const lines = (source: string, file: string, language: Lang) =>
        getPackages(fixture(file), source, language).map(p => [p.name, p.line]);
      expect(lines(vue, 'vue.vue', Lang.VUE)).to.eql([['chai', 6]]);
      expect(lines(svelte, 'svelte.svelte', Lang.SVELTE)).to.eql([
        ['react', 2],
        ['chai', 5],
      ]);
    });
    it('extracts scope-aware package names', () => {
      const names = [
        'lodash',
        'lodash/debounce',
        '@scope/pkg',
        '@scope/pkg/deep/path',
      ].map(packageName);
      expect(names).to.eql(['lodash', 'lodash', '@scope/pkg', '@scope/pkg']);
    });
  });

  describe('bundling', () => {
    it('measures react-dom subpaths instead of externalizing them', async () => {
      const [pkg] = await importCostAsync(
        fixture('import.js'),
        `import { createRoot } from 'react-dom/client';`,
        Lang.JAVASCRIPT,
        FAST,
      );
      expect(pkg.name).to.equal('react-dom/client');
      expect(pkg.size).to.be.above(1000);
    });
    it('drops inline type specifiers and skips all-type imports', async () => {
      const results = await importCostAsync(
        fixture('import.ts'),
        `import { type Foo, expect } from 'chai';\nimport { type Bar } from 'react';\n`,
        Lang.TYPESCRIPT,
        FAST,
      );
      expect(results.map(p => p.name)).to.eql(['chai']);
      expect(results[0].string).not.to.include('type');
      expect(results[0].estimated).to.not.equal(true);
    });
    it('bundles { default as x } imports', async () => {
      const [pkg] = await importCostAsync(
        fixture('import.js'),
        `import { default as chai } from 'chai';`,
        Lang.JAVASCRIPT,
        FAST,
      );
      expect(pkg.estimated).to.not.equal(true);
      expect(pkg.size).to.be.above(0);
    });
    it('never resolves or bundles ignored packages', async () => {
      const results = await importCostAsync(
        fixture('import.js'),
        `import chai from 'chai';\nimport React from 'react';\n`,
        Lang.JAVASCRIPT,
        { ...FAST, ignore: ['chai'] },
      );
      expect(results.map(p => p.name)).to.eql(['react']);
    });
  });

  describe('cache directory', () => {
    it('persists cache to custom directory via setCacheDir', async () => {
      const dir = tempDir('ic-test-');
      try {
        setCacheDir(dir);
        await verify('import.js');
        const files = fs.readdirSync(dir);
        expect(files.some(f => f.startsWith('ic-cache-'))).to.be.true;
      } finally {
        setCacheDir(cacheDir);
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('importCostAsync', () => {
    it('returns results as a promise', async () => {
      const content = fs.readFileSync(fixture('import.js'), 'utf-8');
      const results = await importCostAsync(
        fixture('import.js'),
        content,
        Lang.JAVASCRIPT,
        { maxCallTime: 30000, debounceDelay: 0 },
      );
      const pkg = results.find(r => r.name === 'chai');
      expect(pkg).to.not.be.undefined;
      expect(pkg!.size).to.be.above(0);
      expect(pkg!.gzip).to.be.above(0);
    });
  });

  describe('cli', () => {
    const env = { ...process.env, TMPDIR: cacheDir };
    const run = (args: string[]) =>
      spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env });

    function cliProject(files: Record<string, string>): string {
      const dir = tempDir('ic-cli-');
      fs.writeFileSync(
        path.join(dir, 'package.json'),
        '{"name":"cli-test","version":"1.0.0"}',
      );
      fs.symlinkSync(
        fixture('node_modules'),
        path.join(dir, 'node_modules'),
        'junction',
      );
      for (const [name, content] of Object.entries(files)) {
        fs.writeFileSync(path.join(dir, name), content);
      }
      return dir;
    }

    it('rejects a malformed --budget instead of silently disabling it', () => {
      for (const value of ['1KB', 'abc']) {
        const result = run(['check', fixture('import.js'), '--budget', value]);
        expect(result.status).to.equal(2);
        expect(result.stderr).to.include('Invalid --budget');
      }
      expect(run(['check', fixture('import.js'), '--budget']).status).to.equal(
        2,
      );
    });
    it('writes complete JSON through a pipe', async () => {
      const files: Record<string, string> = {};
      for (let i = 0; i < 400; i++) {
        files[`f${i}.js`] =
          `import chai from 'chai';\nimport React from 'react';\n`;
      }
      const dir = cliProject(files);
      const stdout = await new Promise<string>((resolve, reject) => {
        const child = spawn(process.execPath, [cli, 'check', dir, '--json'], {
          env,
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        let out = '';
        child.stdout.on('data', chunk => (out += chunk));
        child.on('error', reject);
        child.on('close', () => resolve(out));
      });
      expect(stdout.length).to.be.above(65536);
      expect(JSON.parse(stdout)).to.have.length(800);
    });
    it('fails --strict runs that could not measure a file', () => {
      const dir = cliProject({
        'good.js': `import chai from 'chai';\n`,
        'broken.js': `import chai from 'chai';\nconst x = {;\n`,
      });
      const lenient = run(['check', dir]);
      expect(lenient.status).to.equal(0);
      expect(lenient.stderr).to.include('Skipped');
      expect(run(['check', dir, '--strict']).status).to.equal(1);
    });
  });
});
