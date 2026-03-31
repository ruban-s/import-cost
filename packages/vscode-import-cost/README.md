# Import Cost Fast

> Forked from [wix/import-cost](https://github.com/wix/import-cost) and rebuilt for performance.

Display the bundle size of imported packages inline in the editor — powered by **esbuild** and **SWC**.

## Features

### Import/Require Size

Shows the minified and gzipped size of every imported package inline, right next to the `from` clause:

- `import Func from 'utils'`
- `import * as Utils from 'utils'`
- `import { Func } from 'utils'`
- `import { orig as alias } from 'utils'`
- `import Func from 'utils/Func'`
- `const Func = require('utils').Func`
- `import('utils')` (dynamic import)
- Supports **JavaScript**, **TypeScript**, **Vue**, and **Svelte**
- `import type` is correctly skipped (zero runtime cost)

### Package.json Size (New in 4.1)

Open any `package.json` and see the bundle size of each dependency right next to the version:

```json
"dependencies": {
    "@nestjs/common": "^10.0.0",     92 KB (gzipped: 24 KB)
    "express": "^4.18.0",            783 KB (gzipped: 261 KB)
}
```

Works for both `dependencies` and `devDependencies`.

## What's Different from the Original

| | Original (wix) | This Fork |
|---|---|---|
| **Bundler** | webpack 5 | esbuild (10-100x faster) |
| **Parser** | Babel (16 plugins) | SWC (Rust-based) |
| **Package size** | ~45 MB | ~17 MB |
| **Bundle time** | 500-2000ms per import | 50-200ms per import |
| **CPU usage** | 60-80% spikes | Minimal |
| **package.json sizes** | Not supported | Supported |

## Configuration

All settings from the original Import Cost extension are supported:

| Setting | Default | Description |
|---|---|---|
| `importCost.bundleSizeDecoration` | `both` | Show `minified`, `compressed`, or `both` |
| `importCost.bundleSizeColoring` | `minified` | Which size to use for coloring |
| `importCost.smallPackageSize` | `50` | Upper limit (KB) for small packages (green) |
| `importCost.mediumPackageSize` | `100` | Upper limit (KB) for medium packages (yellow) |
| `importCost.showCalculatingDecoration` | `true` | Show "Calculating..." while computing |
| `importCost.timeout` | `20000` | Size calculation timeout (ms) |
| `importCost.typescriptExtensions` | `["\\.tsx?$"]` | File extensions for TypeScript |
| `importCost.javascriptExtensions` | `["\\.jsx?$"]` | File extensions for JavaScript |

## Commands

- **Toggle Import Cost** — Enable or disable the extension
