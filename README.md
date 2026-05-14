# Import Cost

> Know the cost of every import before you ship.

**Import Cost** displays the bundle size of imported packages inline in your editor. It scans your imports, bundles each one with [esbuild](https://esbuild.github.io/), and shows the minified, gzipped, and brotli-compressed size — right next to the import statement.

```typescript
import { debounce } from 'lodash';     // 72.1 KB (gzip: 25.3 KB) · shared 4 files
import { format } from 'date-fns';     // 12.4 KB (gzip: 4.1 KB)
import express from 'express';         // 783 KB (gzip: 261 KB) — try named imports
```

## Packages

| Package | Description | Version |
|---------|-------------|---------|
| [`import-cost-core`](packages/import-cost) | Core library and CLI | [![npm](https://img.shields.io/npm/v/import-cost-core.svg)](https://www.npmjs.com/package/import-cost-core) |
| [`fast-import-cost`](packages/vscode-import-cost) | VS Code extension | [![VS Code](https://img.shields.io/visual-studio-marketplace/v/ruban-s.fast-import-cost.svg)](https://marketplace.visualstudio.com/items?itemName=ruban-s.fast-import-cost) |
| [`coc-import-cost-fast`](packages/coc-import-cost) | coc.nvim extension | [![npm](https://img.shields.io/npm/v/coc-import-cost-fast.svg)](https://www.npmjs.com/package/coc-import-cost-fast) |

## Key Features

- **Inline size decorations** — see the cost of every `import` and `require` as you type
- **Workspace-aware sharing** — shows `· shared N files` when a package is imported across multiple files, so you know its marginal cost is ~0
- **Package.json cost view** — open any `package.json` to see sizes for all dependencies
- **Size budgets** — set a max KB per import; violations show warnings in the editor and Problems panel
- **Lighter alternatives** — hover tooltip suggests smaller replacements (moment → dayjs, lodash → lodash-es, etc.)
- **Tree-shake hints** — suggests named imports when `import *` is used on large packages
- **CLI for CI/CD** — `fast-import-cost check src/ --budget 100` fails builds when imports are too large
- **Diff mode** — `fast-import-cost diff main` compares import costs between git branches

## How It Works

1. **Parse** — [es-module-lexer](https://github.com/nicolo-ribaudo/es-module-lexer) extracts all import/require statements (<1ms per file)
2. **Resolve** — finds the installed package version via `require.resolve` (works with npm, pnpm, yarn, bun)
3. **Bundle** — [esbuild](https://esbuild.github.io/) bundles and minifies each import in-process
4. **Measure** — calculates raw, gzip, and brotli sizes
5. **Cache** — results are cached by package name + version, persisted to disk

## Development

```sh
git clone https://github.com/ruban-s/import-cost.git
cd import-cost
npm install
```

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests |
| `npm run build` | Build all packages |
| `npm run lint` | Lint with Biome |
| `npm test -w import-cost-core` | Core tests only |
| `cd packages/vscode-import-cost && npm run typecheck` | Type-check extension |
| `cd packages/vscode-import-cost && npm run build` | Build + package VSIX |

Changes to the core library are immediately available in the extension via npm workspaces symlink.

See [RELEASE.md](RELEASE.md) for the release checklist.

## Credits

Forked from [wix/import-cost](https://github.com/wix/import-cost). Rewritten in TypeScript with esbuild, es-module-lexer, and Biome — reducing runtime dependencies from 16 to 3.

## License

MIT
