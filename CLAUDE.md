# CLAUDE.md

## Commands

npm workspaces (`package-lock.json`; CI runs `npm ci`). Workspace names differ from directory names: `packages/import-cost` = `import-cost-core`, `packages/vscode-import-cost` = `fast-import-cost`, `packages/coc-import-cost` = `coc-import-cost-fast`.

```sh
npm test                   # Build core, then run every workspace's tests
npm run build              # Build all packages
npm run lint               # Biome (lint:fix to write)

npm test -w import-cost-core
# Single test by grep pattern. Skips pretest and the specs import ../dist, so build core first.
cd packages/import-cost && npx mocha -t 10000 test/mocha-setup.mts 'test/*.spec.mts' --grep "pattern"

cd packages/vscode-import-cost && npm run typecheck   # no emit; esbuild builds the extension
cd packages/vscode-import-cost && npm run build       # host-platform build + VSIX
cd packages/vscode-import-cost && node build.mts      # extension JS only
```

Root `npm test` also runs `fast-import-cost`'s tests, which download and launch a real VS Code via `@vscode/test-electron`; use `npm test -w import-cost-core` for core tests only.

## Architecture

### `packages/import-cost` — Core library

The public API is `importCost(fileName, text, language, config)` which returns an EventEmitter (`start`, `calculated`, `done`, `error`, `log` events).

Pipeline: **parse** -> **resolve versions** -> **bundle & measure**

1. **Parser** (`parser.ts` -> `js-parser.ts`): Extracts import/require statements from source code. Uses `es-module-lexer` for ESM imports, regex for CJS `require()` and TS `import = require()`. Has a regex fallback for JSX files that es-module-lexer can't parse. Vue/Svelte files get their `<script>` block extracted first.

2. **Version resolution** (`utils.ts`): Finds package version and `sideEffects` field. Uses `require.resolve` first (handles pnpm and symlinks), falls back to walking up `node_modules` directories. Packages whose real path is outside `node_modules` (workspace/linked) are flagged `local`. Every upward walk must stop at the filesystem root (`dir === path.dirname(dir)`); relative paths such as untitled editor buffers previously looped forever.

3. **Bundler** (`bundler.ts`): Bundles imports with esbuild (minified, browser platform); same-package imports sharing a project dir and externals go through one batched build. Then measures raw/gzip/brotli sizes off the main thread (async zlib). Peer dependencies plus `react`/`react-dom` are externalized, except the imported package itself (compared by package root, so `react-dom/client` is measured). At most 4 builds run at once, and the esbuild service is stopped after 30 s idle because it keeps its peak heap resident. Node builtins and asset files (.css, .png, etc.) are stubbed empty. Falls back to reading the entry file size when bundling fails, but never on timeout (`TimeoutError`).

4. **Caching** (`package-info.ts`): Size results are cached in-memory and persisted to `$TMPDIR/ic-cache-<version>` (the VS Code extension uses its global storage dir). Cache key is `importString#packageVersion`. Estimates and `local` packages are never persisted; disk writes are serialized and coalesced. Debouncing (`debounce-promise.ts`) is opt-in via `debounceDelay` (default `0`).

### `packages/vscode-import-cost` — VS Code extension

`build.mts` bundles the extension with esbuild (core is bundled in; only `vscode` and `esbuild` stay external) and copies platform-specific esbuild binaries into `dist/node_modules/`.

### `packages/coc-import-cost` — coc.nvim extension (virtual text)

## Key Details

- **Linting**: Biome (not ESLint). Husky pre-commit runs `lint-staged` -> Biome.
- **TypeScript**: 7.x, `module: node20`, target ES2022, CommonJS output. `@types/*` are no longer auto-discovered in TS 6+, so every tsconfig lists what it needs in `types`. The vscode-import-cost package uses `noEmit` for src (esbuild handles its build via `build.mts`) but compiles `test/` with `tsc` into `out/test/`, since VS Code's extension host loads the test runners directly and cannot strip types. `import-cost` uses `tsc` directly; its `test/*.mts` files run under Node's native type stripping and are typechecked by `test/tsconfig.json`.
- **Test fixtures** in `packages/import-cost/test/fixtures/` stay `.js`/`.jsx` — they are parser *input*, not source.
- **Workspace linking**: the extension and coc resolve `import-cost-core` through a workspace symlink to its built `dist/`, so a core change needs `npm run build -w import-cost-core` and, for VS Code, an extension rebuild.
- **Tests**: Mocha + Chai in `packages/import-cost/test/`. Fixture packages are committed under `test/fixtures/node_modules/` despite the root `.gitignore`'s `node_modules` rule (new ones need `git add -f`). `pretest` runs `tsc && tsc -p test` (build `dist/`, typecheck specs).

## Git Commit Rules

- Short messages, prefix `feat:`, `fix:`, `perf:`, `refactor:`, `chore:`, `docs:`
- Do NOT add Co-Authored-By or author attribution

