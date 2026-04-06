# import-cost-core

[![npm version](https://img.shields.io/npm/v/import-cost-core.svg)](https://www.npmjs.com/package/import-cost-core)
[![npm downloads](https://img.shields.io/npm/dm/import-cost-core.svg)](https://www.npmjs.com/package/import-cost-core)
[![license](https://img.shields.io/npm/l/import-cost-core.svg)](https://github.com/ruban-s/import-cost/blob/master/LICENSE)

Calculate the bundle size of imported packages in JavaScript and TypeScript — powered by **esbuild** and **es-module-lexer**.

Find heavy imports, enforce size budgets, and optimize your bundle. Works as a **CLI tool** for CI/CD pipelines and as a **Node.js library** for building editor extensions.

**Why import-cost-core?**
- **Blazing fast** — scans 50+ files in under 1 second
- **Accurate** — shows minified, gzipped, and brotli sizes
- **CI-ready** — `--budget` flag fails builds when imports are too large
- **Tree-shake aware** — tells you if a package supports tree-shaking
- **Zero config** — works with npm, pnpm, yarn, and bun out of the box

## CLI

```bash
# Install globally (provides the `fast-import-cost` command)
npm install -g import-cost-core

# Or run directly with npx
npx import-cost-core check src/

# Scan a directory
fast-import-cost check src/

# Set a budget — exits with code 1 if any import exceeds it
fast-import-cost check src/ --budget 100

# JSON output for CI integration
fast-import-cost check src/ --json --budget 50

# Sort results by size (largest first)
fast-import-cost check . --sort

# Watch mode — re-scan on file changes
fast-import-cost check src/ --watch

# Ignore specific packages
fast-import-cost check src/ --ignore "lodash,moment,@angular/*"

# Compare import costs between git branches
fast-import-cost diff main
fast-import-cost diff main feature-branch
```

Example output:

```
  Found 4 imports in 2 files

  src/app.ts:1   @nestjs/common   91.88 KB (gzip: 24.56 KB, brotli: 20.12 KB) [tree-shakeable]
  src/app.ts:2   express          783.37 KB (gzip: 261.47 KB, brotli: 215.30 KB)
  src/main.ts:1  rxjs             42.15 KB (gzip: 12.30 KB, brotli: 10.45 KB) [tree-shakeable]
  src/main.ts:3  lodash           531 KB (gzip: 72 KB, brotli: 58 KB) ⚠ OVER BUDGET

  ⚠ 1 import(s) exceed the budget of 100 KB
```

Diff output:

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
  // mark lines as "calculating..."
});

emitter.on('calculated', (pkg: PackageInfo) => {
  // show size for this package
  console.log(pkg.name, pkg.size, pkg.gzip, pkg.brotli);
  console.log('tree-shakeable:', pkg.sideEffects === false);
});

emitter.on('done', (packages: PackageInfo[]) => {
  // all packages calculated
});

emitter.on('error', (e: Error) => {
  // parse error, usually safe to ignore
});

// when file changes, stop listening
emitter.removeAllListeners();

// when shutting down
cleanup();
```

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `fileName` | `string` | Full path to the file being processed. Needed to resolve `node_modules`. |
| `fileContents` | `string` | The file content (from IDE buffer, may be unsaved). |
| `language` | `Lang` | `Lang.JAVASCRIPT`, `Lang.TYPESCRIPT`, `Lang.VUE`, or `Lang.SVELTE` |
| `config` | `ImportCostConfig` | Optional. `maxCallTime` (ms timeout), `concurrent` (boolean). |

## PackageInfo

Each calculated package contains:

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Package name (e.g. `lodash`) |
| `size` | `number` | Minified size in bytes |
| `gzip` | `number` | Gzipped size in bytes |
| `brotli` | `number` | Brotli compressed size in bytes |
| `sideEffects` | `boolean \| string[]` | From the package's `package.json` — `false` means tree-shakeable |
| `line` | `number` | Line number in the source file |
| `version` | `string` | Resolved version (e.g. `lodash@4.17.21`) |
| `error` | `Error` | Set if bundling failed |

## Events

| Event | Callback | Description |
|-------|----------|-------------|
| `start` | `(packages: PackageInfo[]) => void` | Parsing complete, sizes being calculated |
| `calculated` | `(pkg: PackageInfo) => void` | Single package size ready |
| `done` | `(packages: PackageInfo[]) => void` | All packages calculated |
| `error` | `(e: Error) => void` | Fatal parse error |
| `log` | `(message: string) => void` | Debug logging |

## Supported Patterns

- `import x from 'pkg'`
- `import * as x from 'pkg'`
- `import { a, b } from 'pkg'`
- `import { a as b } from 'pkg'`
- `const x = require('pkg')`
- `import('pkg')` (dynamic import)
- `import x = require('pkg')` (TypeScript)

Supports **JavaScript**, **TypeScript**, **JSX**, **TSX**, **Vue**, and **Svelte** files.

## Ignore List

Create a `.importcostignore` file in your project root to skip specific packages:

```
# Heavy packages we accept
@prisma/client
firebase*

# All Angular packages
@angular/*

# Development tools
webpack
typescript
```

Patterns support exact names and glob wildcards (`*`, `**`). Lines starting with `#` are comments.

The ignore file is automatically picked up by both the CLI and the VS Code extension.

## Package Manager Support

Works with **npm**, **pnpm**, **yarn**, **yarn PnP**, and **bun**. Uses `require.resolve` for package lookup which handles all symlink structures natively.

## Performance

- **esbuild** for bundling — 10-100x faster than webpack
- **es-module-lexer** for parsing — purpose-built, <1ms per file
- **Brotli** compression calculated at quality 4 for speed
- Only 2 runtime dependencies

## Credits

Forked from [wix/import-cost](https://github.com/wix/import-cost), thanks to the wix team!

## License

MIT
