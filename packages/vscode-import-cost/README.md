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

Hover for a detailed breakdown with compression ratios, tree-shake status, and lighter alternatives.

### Workspace-Aware Sharing

The extension scans your entire workspace to track which packages are imported across multiple files. When a package is shared, the inline decoration tells you:

```typescript
import { debounce } from 'lodash';     72 KB (gzip: 25 KB) · shared 4 files
import { Chart } from 'chart.js';      198 KB (gzip: 65 KB)
```

- **`· shared N files`** — this package is already in your bundle from other files; marginal cost is ~0
- **No tag** — unique to this file; full bundle cost applies

Hover shows which other files import the same package.

The status bar reflects this too: `Σ 340 KB (45 KB unique)` — so you know how much of this file's import weight is truly new.

### Package.json Cost View

Open any `package.json` to see the bundle size of each dependency:

```json
"dependencies": {
    "@nestjs/common": "^10.0.0",       91.64 KB (gzipped: 24.47 KB)
    "express": "^4.18.0",             783 KB (gzipped: 261 KB)
    "ms": "^2.1.3",                     1.39 KB (gzipped: 674 B)
}
```

### Size Budgets

Set `importCost.budgetKB` to a max KB per import. Violations get a warning icon, red color, and appear in the Problems panel:

```typescript
import * as lodash from 'lodash';  ⚠ 531 KB (gzip: 72 KB) — over budget!
```

### Lighter Alternatives

Hover over a heavy package to see a suggested replacement:

> **Lighter alternative:** `dayjs`
>
> dayjs has the same API at ~2KB vs ~300KB

16+ built-in suggestions including moment, lodash, axios, uuid, classnames, and more.

### Tree-Shake Hints

When `import * as ...` is used on a large package (50KB+), a hint suggests named imports:

```typescript
import * as lodash from 'lodash';  531 KB (gzip: 72 KB) — try named imports
```

### Code Actions

Lightbulb quick-fixes on large imports:

- **Convert to named import** — rewrites `import * as lodash` to `import { pick, map }` for packages over 50KB
- **Suggest lighter alternative** — when a smaller replacement exists

### Smart Defaults

- Skips relative imports (`./utils`) and type-only imports
- Caches results by package + version — tab switching is instant
- Color coded: green (small) → yellow (medium) → red (large)
- Debounced recalculation as you type
- Works with npm, pnpm, yarn, and bun workspaces

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `importCost.bundleSizeDecoration` | `both` | Display format: `both`, `minified`, `gzip`, `brotli`, `minified+gzip`, `minified+brotli`, `compressed` |
| `importCost.bundleSizeColoring` | `minified` | Which size metric determines the color |
| `importCost.smallPackageSize` | `50` | Upper KB limit for green |
| `importCost.mediumPackageSize` | `100` | Upper KB limit for yellow |
| `importCost.budgetKB` | `0` | Max allowed import size in KB (0 = disabled) |
| `importCost.timeout` | `20000` | Calculation timeout in ms |
| `importCost.ignoredPackages` | `[]` | Package names to skip |
| `importCost.workspaceAwareness` | `true` | Track imports across workspace for shared/unique detection |
| `importCost.showWorkspaceSharing` | `true` | Show `· shared N files` tag on decorations |
| `importCost.showCalculatingDecoration` | `true` | Show "Calculating..." while computing |
| `importCost.typescriptExtensions` | `["\\.tsx?$"]` | File extensions for TypeScript parser |
| `importCost.javascriptExtensions` | `["\\.jsx?$"]` | File extensions for JavaScript parser |
| `importCost.vueExtensions` | `["\\.vue$"]` | File extensions for Vue parser |
| `importCost.svelteExtensions` | `["\\.svelte$"]` | File extensions for Svelte parser |

## Commands

- **Import Cost: Toggle** — enable or disable the extension
- **Import Cost: Clear Cache** — clear cached sizes and recalculate

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
