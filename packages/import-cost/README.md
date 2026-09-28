# import-cost-core

[![npm version](https://img.shields.io/npm/v/import-cost-core.svg)](https://www.npmjs.com/package/import-cost-core)
[![npm downloads](https://img.shields.io/npm/dm/import-cost-core.svg)](https://www.npmjs.com/package/import-cost-core)
[![license](https://img.shields.io/npm/l/import-cost-core.svg)](https://github.com/ruban-s/import-cost/blob/main/LICENSE)

> Calculate the bundle size of imported packages — powered by esbuild and es-module-lexer.

Find heavy imports, enforce size budgets, and optimize your bundle. Works as a **CLI tool** for CI/CD pipelines and as a **Node.js library** for building editor extensions.

- **Fast** — scans 50+ files/second, bundles in-process with esbuild
- **Accurate** — shows minified, gzipped, and brotli sizes
- **CI-ready** — `--budget` flag exits non-zero when imports exceed limits
- **Tree-shake aware** — reports the `sideEffects` field from package.json
- **Zero config** — works with npm, pnpm, yarn (node_modules linker), and bun. Yarn PnP is not supported.

## CLI

```bash
npm install -g import-cost-core
```

```bash
# Scan a directory
fast-import-cost check src/

# Enforce a size budget (exits 1 if exceeded)
fast-import-cost check src/ --budget 100

# JSON output for CI
fast-import-cost check src/ --json --budget 50

# Sort by size
fast-import-cost check . --sort

# Watch mode
fast-import-cost check src/ --watch

# Ignore packages (never resolved or bundled)
fast-import-cost check src/ --ignore "lodash,moment,@angular/*"

# Fail when a file or import cannot be measured
fast-import-cost check src/ --budget 100 --strict

# Budget the gzip (or brotli) size instead of the minified size
fast-import-cost check src/ --budget 30 --budget-metric gzip

# Compare between git refs
fast-import-cost diff main
fast-import-cost diff main feature-branch
```

**Example output:**

```
  Found 4 imports in 2 files

  src/app.ts:1   @nestjs/common   91.88 KB (gzip: 24.56 KB, brotli: 20.12 KB) [sideEffects: false]
  src/app.ts:2   express          783.37 KB (gzip: 261.47 KB, brotli: 215.30 KB)
  src/main.ts:1  rxjs             42.15 KB (gzip: 12.30 KB, brotli: 10.45 KB) [sideEffects: false]
  src/main.ts:3  lodash           531 KB (gzip: 72 KB, brotli: 58 KB) ⚠ OVER BUDGET

  ⚠ 1 import(s) exceed the budget of 100 KB
```

Sizes prefixed with `~` are estimates: bundling failed and the entry file size is shown instead. Files that cannot be parsed are reported on stderr; `--strict` turns them (and failed imports) into exit code 1.

**Exit codes:** `0` success, `1` budget exceeded (or unmeasurable input with `--strict`), `2` invalid arguments such as `--budget 1KB`.

`diff` measures both refs against the currently installed `node_modules`, so it reports import changes, not dependency version bumps.

**Diff output:**

```
  3 imports changed between main and HEAD

  ↑ src/app.ts  express          +12.5 KB
  + src/app.ts  axios            45.2 KB
  - src/utils.ts  moment         231 KB

  Total change: -173.3 KB
```

## Library API

```bash
npm install import-cost-core
```

```typescript
import { importCost, cleanup, Lang } from 'import-cost-core';
import type { PackageInfo } from 'import-cost-core';

const emitter = importCost(fileName, fileContents, Lang.TYPESCRIPT);

emitter.on('start', (packages: PackageInfo[]) => {
  // packages found, sizes being calculated
});

emitter.on('calculated', (pkg: PackageInfo) => {
  console.log(pkg.name, pkg.size, pkg.gzip, pkg.brotli);
  console.log('tree-shakeable:', pkg.sideEffects === false);
});

emitter.on('done', (packages: PackageInfo[]) => {
  // all sizes ready
});

emitter.on('error', (e: Error) => {
  // parse error
});

// stop listening on file change
emitter.removeAllListeners();

// stop the esbuild service on shutdown (it also stops itself after 30 s idle)
await cleanup();
```

`importCostAsync(fileName, fileContents, language, config)` returns the same results as a `Promise<PackageInfo[]>`.

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `fileName` | `string` | Full path to the file. Needed to resolve `node_modules`. |
| `fileContents` | `string` | File content (from editor buffer, may be unsaved). |
| `language` | `Lang` | `Lang.JAVASCRIPT`, `Lang.TYPESCRIPT`, `Lang.VUE`, or `Lang.SVELTE` |
| `config` | `ImportCostConfig` | Optional. `maxCallTime` (ms; a timeout is reported as an error, never cached), `debounceDelay` (ms, default `0`), `cacheDir`, `ignore` (package patterns that are never resolved or bundled). |

### PackageInfo

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Package name (e.g. `lodash`) |
| `size` | `number` | Minified size in bytes |
| `gzip` | `number` | Gzipped size in bytes |
| `brotli` | `number` | Brotli compressed size in bytes |
| `sideEffects` | `boolean \| string[]` | The package.json `sideEffects` field |
| `line` | `number` | Line number in source |
| `version` | `string` | Resolved version (e.g. `lodash@4.17.21`) |
| `estimated` | `boolean` | `true` if bundling failed, showing entry file size instead (never persisted) |
| `local` | `boolean` | `true` for workspace or linked packages outside `node_modules` (re-measured, never cached) |
| `error` | `Error` | Set if calculation failed (for example a `TimeoutError`) |

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `start` | `PackageInfo[]` | Parsing complete, sizes being calculated |
| `calculated` | `PackageInfo` | Single package size ready |
| `done` | `PackageInfo[]` | All packages calculated |
| `error` | `Error` | Fatal parse error |
| `log` | `string` | Debug logging |

## Supported Import Patterns

- `import x from 'pkg'`
- `import * as x from 'pkg'`
- `import { a, b } from 'pkg'`
- `import { a as b } from 'pkg'`
- `const x = require('pkg')`
- `import('pkg')` (dynamic)
- `import x = require('pkg')` (TypeScript)
- `import { type A, b } from 'pkg'` (inline `type` specifiers are ignored; all-type imports are skipped)
- `export { a } from 'pkg'` and `export * from 'pkg'`

Supports **JavaScript**, **TypeScript**, **JSX**, **TSX** (including `.mjs`, `.cjs`, `.mts`, `.cts`), **Vue**, and **Svelte**. Every `<script>` block of a Vue or Svelte file is scanned.

## Ignore List

Create `.importcostignore` in your project root:

```
# Skip heavy packages we accept
@prisma/client
firebase*
@angular/*
```

Glob patterns (`*`, `**`) and `#` comments supported. Picked up by both CLI and editor extensions. Ignored packages are never resolved or bundled.

## Credits

Forked from [wix/import-cost](https://github.com/wix/import-cost), rewritten in TypeScript with esbuild and es-module-lexer.

## License

MIT
