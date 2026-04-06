# Import Cost Fast

Display the bundle size of imported packages inline in the editor — powered by **esbuild** and **SWC**.

## Features

### Import/Require Size

Shows the minified, gzipped, and brotli-compressed size of every imported package inline:

```typescript
import { Controller, Get, Post } from '@nestjs/common';  91.88 KB (gzip: 24.56 KB, brotli: 20.12 KB)
import { Request } from 'express';                        783.37 KB (gzip: 261.47 KB, brotli: 215.30 KB)
import { PrismaService } from './prisma.service';         // local imports are skipped
import type { StringValue } from 'ms';                    // type imports are skipped
```

Hover over any size for a detailed breakdown with compression ratios.

Supported patterns:

- `import Func from 'utils'`
- `import * as Utils from 'utils'`
- `import { Func } from 'utils'`
- `import { orig as alias } from 'utils'`
- `import Func from 'utils/Func'`
- `const Func = require('utils').Func`
- `import('utils')` (dynamic import)

Supports **JavaScript**, **TypeScript**, **Vue**, and **Svelte**.

### Package.json Size

Open any `package.json` to see the bundle size of each dependency next to the version:

```json
"dependencies": {
    "@nestjs/common": "^10.0.0",       91.64 KB (gzipped: 24.47 KB)
    "express": "^4.18.0",             783.37 KB (gzipped: 261.47 KB)
    "class-validator": "^0.14.0",       8.51 KB (gzipped: 2.85 KB)
    "ms": "^2.1.3",                     1.39 KB (gzipped: 674 B)
}
```

Works for both `dependencies` and `devDependencies`.

### Status Bar

Shows the total import cost of the current file in the status bar. Hover to see the gzipped total and package count. Click to clear cache and recalculate.

### Size Budget

Set a maximum allowed size per import. Any import that exceeds the budget gets a warning icon and red color:

```typescript
import * as lodash from 'lodash';  ⚠ 531 KB (gzip: 72 KB, brotli: 58 KB) — over budget!
```

Configure via `importCost.budgetKB` (default: 0 = disabled).

### Code Actions

Lightbulb quick-fixes appear on large imports:

- **Convert to named import** — rewrites `import * as lodash` to `import { pick, map }` on packages over 50KB
- **Suggest lighter alternative** — when a smaller replacement exists (e.g. moment → dayjs)

### Lighter Alternative Suggestions

Hover over a heavy package to see a suggested replacement:

> **moment** `2.30.1`
> | Minified | 531 KB |
> | Gzipped | 72 KB (14% of minified) |
> | Brotli | 58 KB (11% of minified) |
> ---
> **Lighter alternative:** `dayjs`
> dayjs has the same API at ~2KB vs ~300KB

Supports 16+ common swaps including lodash, axios, uuid, classnames, and more.

### Treeshake Hints

When `import * as ...` is used on a large package (50KB+), a hint is shown suggesting named imports to reduce bundle size:

```typescript
import * as lodash from 'lodash';  531 KB (gzip: 72 KB, brotli: 58 KB) — try named imports
```

### Smart Behavior

- **Skips local imports** — relative paths like `./utils` are ignored
- **Skips type imports** — `import type` adds zero bytes, so no size is shown
- **Cached results** — sizes are cached per package version, so switching tabs is instant
- **Color coded** — green for small, yellow for medium, red for large packages
- **Debounced** — recalculates as you type without slowing down the editor
- **Hover details** — hover over any size to see minified, gzipped, brotli, and compression ratios
- **Size budgets** — set a max allowed size per import via `importCost.budgetKB`
- **Code actions** — lightbulb quick-fixes to convert wildcard imports and suggest alternatives
- **Alternative suggestions** — hover tooltip suggests lighter replacements for heavy packages
- **Diagnostic warnings** — over-budget imports show in the Problems panel
- **Side effects badge** — hover shows whether a package is tree-shakeable
- **Ignore list** — skip specific packages via `importCost.ignoredPackages` setting
- **Monorepo support** — works with npm, yarn, pnpm, and bun workspaces

## CLI

Run import cost checks from the command line or CI:

```bash
# Scan a directory
npx fast-import-cost check src/

# Set a budget (exits with code 1 if exceeded)
npx fast-import-cost check src/ --budget 100

# JSON output for CI integration
npx fast-import-cost check src/ --json --budget 50

# Sort by size (largest first)
npx fast-import-cost check . --sort
```

## Performance

Built from the ground up for speed:

- **esbuild** for bundling — 10-100x faster than webpack
- **es-module-lexer** for parsing — purpose-built import scanner, <1ms per file
- **No worker processes** — esbuild is fast enough to run in-process
- **No temp files** — bundling happens entirely in memory
- **Lightweight** — only 2 runtime dependencies (`esbuild`, `es-module-lexer`)

## Configuration

| Setting                                | Default        | Description                              |
| -------------------------------------- | -------------- | ---------------------------------------- |
| `importCost.bundleSizeDecoration`      | `both`         | `both`, `minified`, `gzip`, `brotli`, `minified+gzip`, `minified+brotli`, `compressed` |
| `importCost.bundleSizeColoring`        | `minified`     | Which size to use for coloring           |
| `importCost.smallPackageSize`          | `50`           | Upper limit (KB) for small (green)       |
| `importCost.mediumPackageSize`         | `100`          | Upper limit (KB) for medium (yellow)     |
| `importCost.showCalculatingDecoration` | `true`         | Show "Calculating..." while computing    |
| `importCost.timeout`                   | `20000`        | Size calculation timeout (ms)            |
| `importCost.budgetKB`                  | `0`            | Max import size in KB (0 = disabled)     |
| `importCost.typescriptExtensions`      | `["\\.tsx?$"]` | File extensions for TypeScript           |
| `importCost.javascriptExtensions`      | `["\\.jsx?$"]` | File extensions for JavaScript           |
| `importCost.ignoredPackages`           | `[]`           | Package names to skip calculation for    |

## Commands

- **Import Cost: Toggle** — Enable or disable the extension
- **Import Cost: Clear Cache** — Clear cached sizes and recalculate

## Compatibility

Works with **VSCode**, **VSCode Insiders**, **Cursor**, and other VSCode-based editors.

## Credits

Forked from [wix/import-cost](https://github.com/wix/import-cost), thanks to the wix team!

## License

MIT
