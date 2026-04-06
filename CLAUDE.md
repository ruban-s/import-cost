# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm install                # Install all workspace dependencies
npm test                   # Run tests across all packages
npm run build              # Build all packages
npm run lint               # Lint with Biome
npm run lint:fix           # Auto-fix lint issues

# import-cost core tests
npm test -w import-cost
# Single test by grep pattern
cd packages/import-cost && npx mocha -t 10000 test/mocha-setup.js 'test/**/*.spec.js' --grep "pattern"

# VSCode extension type check (no emit — it uses esbuild for building)
cd packages/vscode-import-cost && npm run typecheck

# Build VSCode extension + package VSIX
cd packages/vscode-import-cost && npm run build
# Build extension JS only (no VSIX)
cd packages/vscode-import-cost && node build.mjs
```

## Architecture

npm workspaces monorepo with three packages:

### `packages/import-cost` — Core library

The public API is `importCost(fileName, text, language, config)` which returns an EventEmitter (`start`, `calculated`, `done`, `error`, `log` events).

Pipeline: **parse** -> **resolve versions** -> **bundle & measure**

1. **Parser** (`parser.ts` -> `swc-parser.ts`): Extracts import/require statements from source code. Uses `es-module-lexer` for ESM imports, regex for CJS `require()` and TS `import = require()`. Has a regex fallback for JSX files that es-module-lexer can't parse. Vue/Svelte files get their `<script>` block extracted first.

2. **Version resolution** (`utils.ts`): Finds package version and `sideEffects` field by walking up to find `node_modules`. Uses `require.resolve` first (handles pnpm/yarn PnP), falls back to manual directory traversal. Also resolves monorepo root for `nodePaths`.

3. **Bundler** (`bundler.ts`): Bundles each import string with esbuild (minified, browser platform), then measures raw/gzip/brotli sizes. Peer dependencies are externalized. Node builtins and asset files (.css, .png, etc.) are stubbed empty. Falls back to reading the entry file size when bundling fails.

4. **Caching** (`package-info.ts`): Size results are cached in-memory and persisted to `$TMPDIR/ic-cache-<version>`. Cache key is `importString#packageVersion`. Debouncing (`debounce-promise.ts`) prevents redundant calculations when the user types fast.

### `packages/vscode-import-cost` — VS Code extension

- `extension.ts`: Activation, command registration, wires up `importCost` events to decorations
- `decorator.ts`: Inline text decorations showing sizes, color coding (small/medium/large), budget warnings, treeshake hints
- `diagnostics.ts`: VS Code diagnostics for over-budget imports
- `package-json-cost.ts`: Shows sizes for dependencies listed in package.json
- `build.mjs`: Custom esbuild build script that bundles the extension and copies platform-specific esbuild binaries into `dist/node_modules/`

### `packages/coc-import-cost` — coc.nvim extension

Vim/Neovim adapter using virtual text via coc.nvim. Consumes `import-cost` core directly (linked via npm workspaces).

## Key Details

- **Linting**: Biome (not ESLint). Single quotes, 2-space indent, trailing commas. Pre-commit hook runs `lint-staged` -> Biome.
- **TypeScript**: Target ES2022, CommonJS output. The vscode-import-cost package uses `noEmit` (esbuild handles its build via `build.mjs`), while import-cost uses `tsc` directly.
- **Workspace linking**: `vscode-import-cost` depends on `import-cost` via workspace symlink. Changes to core are immediately available without rebuilding the extension.
- **Tests**: Mocha + Chai in `packages/import-cost/test/`. Tests require `npm install` in the test fixtures directory structure. The `pretest` script runs `tsc` first.

## Git Commit Rules

- Commit by feature or fix, one logical change per commit
- Short messages: `feat: add typing indicator endpoint` or `fix: handle nfm_reply in webhook`
- Prefix: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`
- Do NOT add Co-Authored-By or author attribution
- Do NOT use `git add -A` or `git add .`

