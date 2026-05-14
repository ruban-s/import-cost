# import-cost-core

[![npm version](https://img.shields.io/npm/v/import-cost-core.svg)](https://www.npmjs.com/package/import-cost-core)
[![npm downloads](https://img.shields.io/npm/dm/import-cost-core.svg)](https://www.npmjs.com/package/import-cost-core)
[![license](https://img.shields.io/npm/l/import-cost-core.svg)](https://github.com/ruban-s/import-cost/blob/master/LICENSE)

> Calculate the bundle size of imported packages — powered by esbuild and es-module-lexer.

Find heavy imports, enforce size budgets, and optimize your bundle. Works as a **CLI tool** for CI/CD pipelines and as a **Node.js library** for building editor extensions.

- **Fast** — scans 50+ files/second, bundles in-process with esbuild
- **Accurate** — shows minified, gzipped, and brotli sizes
- **CI-ready** — `--budget` flag exits non-zero when imports exceed limits
- **Tree-shake aware** — reports `sideEffects` status from package.json
- **Zero config** — works with npm, pnpm, yarn, yarn PnP, and bun

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

# Ignore packages
fast-import-cost check src/ --ignore "lodash,moment,@angular/*"

# Compare between git refs
fast-import-cost diff main
fast-import-cost diff main feature-branch
```

**Example output:**

```
  Found 4 imports in 2 files

  src/app.ts:1   @nestjs/common   91.88 KB (gzip: 24.56 KB, brotli: 20.12 KB) [tree-shakeable]
  src/app.ts:2   express          783.37 KB (gzip: 261.47 KB, brotli: 215.30 KB)
  src/main.ts:1  rxjs             42.15 KB (gzip: 12.30 KB, brotli: 10.45 KB) [tree-shakeable]
  src/main.ts:3  lodash           531 KB (gzip: 72 KB, brotli: 58 KB) ⚠ OVER BUDGET

  ⚠ 1 import(s) exceed the budget of 100 KB
```

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

// clean up on shutdown
cleanup();
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `fileName` | `string` | Full path to the file. Needed to resolve `node_modules`. |
| `fileContents` | `string` | File content (from editor buffer, may be unsaved). |
| `language` | `Lang` | `Lang.JAVASCRIPT`, `Lang.TYPESCRIPT`, `Lang.VUE`, or `Lang.SVELTE` |
| `config` | `ImportCostConfig` | Optional. `maxCallTime` (ms), `concurrent` (boolean). |

### PackageInfo

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Package name (e.g. `lodash`) |
| `size` | `number` | Minified size in bytes |
| `gzip` | `number` | Gzipped size in bytes |
| `brotli` | `number` | Brotli compressed size in bytes |
| `sideEffects` | `boolean \| string[]` | `false` = tree-shakeable |
| `line` | `number` | Line number in source |
| `version` | `string` | Resolved version (e.g. `lodash@4.17.21`) |
| `estimated` | `boolean` | `true` if bundling failed, showing entry file size instead |
| `error` | `Error` | Set if calculation failed |

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

Supports **JavaScript**, **TypeScript**, **JSX**, **TSX**, **Vue**, and **Svelte**.

## Ignore List

Create `.importcostignore` in your project root:

```
# Skip heavy packages we accept
@prisma/client
firebase*
@angular/*
```

Glob patterns (`*`, `**`) and `#` comments supported. Picked up by both CLI and editor extensions.

## Credits

Forked from [wix/import-cost](https://github.com/wix/import-cost), rewritten in TypeScript with esbuild and es-module-lexer.

## License

MIT
