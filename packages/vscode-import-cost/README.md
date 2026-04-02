# Import Cost Fast

Display the bundle size of imported packages inline in the editor — powered by **esbuild** and **SWC**.

## Features

### Import/Require Size

Shows the minified and gzipped size of every imported package inline:

```typescript
import { Controller, Get, Post } from '@nestjs/common';  91.88 KB (gzipped: 24.56 KB)
import { Request } from 'express';                        783.37 KB (gzipped: 261.47 KB)
import { PrismaService } from './prisma.service';         // local imports are skipped
import type { StringValue } from 'ms';                    // type imports are skipped
```

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

### Treeshake Hints

When `import * as ...` is used on a large package (50KB+), a hint is shown suggesting named imports to reduce bundle size:

```typescript
import * as lodash from 'lodash';  531 KB (gzipped: 72 KB) — try named imports to reduce size
```

### Smart Behavior

- **Skips local imports** — relative paths like `./utils` are ignored
- **Skips type imports** — `import type` adds zero bytes, so no size is shown
- **Cached results** — sizes are cached per package version, so switching tabs is instant
- **Color coded** — green for small, yellow for medium, red for large packages
- **Debounced** — recalculates as you type without slowing down the editor
- **Hover details** — hover over any size to see minified, gzipped, and compression ratio
- **Ignore list** — skip specific packages via `importCost.ignoredPackages` setting
- **Monorepo support** — works with npm, yarn, and pnpm workspaces

## Performance

Built from the ground up for speed:

- **esbuild** for bundling — 10-100x faster than webpack
- **SWC** for parsing — Rust-based parser, 5-10x faster than Babel
- **No worker processes** — esbuild is fast enough to run in-process
- **No temp files** — bundling happens entirely in memory
- **Lightweight** — only 2 runtime dependencies (`esbuild`, `@swc/core`)

## Configuration

| Setting                                | Default        | Description                              |
| -------------------------------------- | -------------- | ---------------------------------------- |
| `importCost.bundleSizeDecoration`      | `both`         | Show `minified`, `compressed`, or `both` |
| `importCost.bundleSizeColoring`        | `minified`     | Which size to use for coloring           |
| `importCost.smallPackageSize`          | `50`           | Upper limit (KB) for small (green)       |
| `importCost.mediumPackageSize`         | `100`          | Upper limit (KB) for medium (yellow)     |
| `importCost.showCalculatingDecoration` | `true`         | Show "Calculating..." while computing    |
| `importCost.timeout`                   | `20000`        | Size calculation timeout (ms)            |
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
