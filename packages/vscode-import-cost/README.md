# Import Cost Fast

> See the real cost of every import — inline, as you type.

Display the bundle size of imported packages inline in the editor. Powered by [esbuild](https://esbuild.github.io/) for bundling and [es-module-lexer](https://github.com/nicolo-ribaudo/es-module-lexer) for parsing.

## Features

### Inline Size Decorations

Every `import` and `require` shows its minified, gzipped, and brotli size inline:

```typescript
import { Controller, Get } from '@nestjs/common';  91.88 KB (gzip: 24.56 KB, brotli: 20.12 KB)
import { Request } from 'express';                  783 KB (gzip: 261 KB, brotli: 215 KB)
import { PrismaService } from './prisma.service';   // local imports skipped
import type { StringValue } from 'ms';              // type imports skipped
```

Hover for a detailed breakdown with compression ratios, the package's `sideEffects` field, and lighter alternatives.

### Workspace-Aware Sharing

The extension scans your workspace to track which packages are imported by other files in the same package (nearest `package.json`). Tests, stories and config files are not counted. When a package is shared, the inline decoration tells you:

```typescript
import { debounce } from 'lodash';     72 KB (gzip: 25 KB) · shared 4 files
import { Chart } from 'chart.js';      198 KB (gzip: 65 KB)
```

- **`· shared N files`**: other files in this package import it too; if they ship in the same bundle, this import adds little
- **No tag**: no other file in this package imports it

Hover shows which other files import the same package.

The status bar reflects this too: `Σ 340 KB (45 KB unique)` — so you know how much of this file's import weight is truly new.

### Package.json Cost View

Open any `package.json` to see the bundle size of each dependency (devDependencies too when `importCost.packageJsonDevDependencies` is on):

```json
"dependencies": {
    "@nestjs/common": "^10.0.0",       91.64 KB (gzipped: 24.47 KB)
    "express": "^4.18.0",             783 KB (gzipped: 261 KB)
    "ms": "^2.1.3",                     1.39 KB (gzipped: 674 B)
}
```

### Size Budgets

Set `importCost.budgetKB` to a max KB per import, and `importCost.budgetMetric` to `minified` (default), `gzip` or `brotli` to choose which size it applies to. Violations get a warning icon, red color, and appear in the Problems panel:

```typescript
import * as lodash from 'lodash';  ⚠ 531 KB (gzip: 72 KB) — over budget!
```

### Lighter Alternatives

Hover over a heavy package to see a suggested replacement:

> **Lighter alternative:** `dayjs`
>
> dayjs has a near-identical API at a fraction of the size

Built-in suggestions for moment, lodash, axios, uuid, classnames, and more.

### Tree-Shake Hints

When `import * as ...` is used on a large package (50KB+), a hint suggests named imports:

```typescript
import * as lodash from 'lodash';  531 KB (gzip: 72 KB) — try named imports
```

### Code Actions

Lightbulb quick-fix on imports that have a lighter alternative: **Consider replacing with …** shows the suggested package and why.

### Optimization Report

**Import Cost: Optimization Report** (also a click on the status bar item) lists lighter alternatives, duplicate libraries for the same job, and large wildcard imports, with estimated savings and clickable file links.

### Smart Defaults

- Skips relative imports (`./utils`) and type-only imports (including all-`type` named imports)
- Caches results by package + version in the extension's storage; workspace packages are re-measured
- Color coded: green (small), amber (medium), red (large)
- Debounced recalculation as you type
- Works with npm, pnpm, yarn (node_modules linker), and bun workspaces
- The bundler process stops after 30 s idle to give memory back

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `importCost.bundleSizeDecoration` | `both` | Display format: `both`, `minified`, `gzip`, `brotli`, `minified+gzip`, `minified+brotli`, `compressed` |
| `importCost.bundleSizeColoring` | `minified` | Which size metric determines the color |
| `importCost.smallPackageSize` | `50` | Upper KB limit for green |
| `importCost.mediumPackageSize` | `100` | Upper KB limit for yellow |
| `importCost.budgetKB` | `0` | Max allowed import size in KB (0 = disabled) |
| `importCost.budgetMetric` | `minified` | Size the budget applies to: `minified`, `gzip` or `brotli` |
| `importCost.timeout` | `20000` | Calculation timeout in ms |
| `importCost.ignoredPackages` | `[]` | Package names or globs that are never resolved or bundled |
| `importCost.workspaceAwareness` | `true` | Track imports across workspace for shared/unique detection |
| `importCost.showWorkspaceSharing` | `true` | Show `· shared N files` tag on decorations |
| `importCost.duplicateDetection` | `true` | Report duplicate libraries for the same job (e.g. two date libraries) |
| `importCost.packageJsonDevDependencies` | `false` | Also measure devDependencies in the package.json view |
| `importCost.showCalculatingDecoration` | `true` | Show "Calculating..." while computing |
| `importCost.typescriptExtensions` | `["\\.[cm]?tsx?$"]` | File extensions for TypeScript parser |
| `importCost.javascriptExtensions` | `["\\.[cm]?jsx?$"]` | File extensions for JavaScript parser |
| `importCost.vueExtensions` | `["\\.vue$"]` | File extensions for Vue parser |
| `importCost.svelteExtensions` | `["\\.svelte$"]` | File extensions for Svelte parser |

## Commands

- **Import Cost: Toggle** — enable or disable the extension
- **Import Cost: Clear Cache** — clear cached sizes and recalculate
- **Import Cost: Optimization Report** — ranked suggestions for reducing bundle size

## CLI

The core library also provides a CLI for CI/CD:

```bash
npx import-cost-core check src/ --budget 100
npx import-cost-core check src/ --json --sort
npx import-cost-core diff main
```

See the [`import-cost-core` README](../import-cost/README.md) for full CLI documentation.

## Compatibility

Works with **VS Code**, **VS Code Insiders**, **Cursor**, and other VS Code-based editors.

Supports **JavaScript**, **TypeScript**, **Vue**, and **Svelte**.

## Credits

Forked from [wix/import-cost](https://github.com/wix/import-cost), rewritten in TypeScript with esbuild and es-module-lexer.

## License

MIT
