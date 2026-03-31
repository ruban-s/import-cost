# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Import Cost is a monorepo that displays the bundle size of imported packages inline in editors. It uses webpack to calculate the minified and gzipped size of each import/require statement.

## Commands

```bash
# Install all dependencies (from repo root)
npm install

# Run all tests across workspaces
npm test

# Run tests for import-cost only
npm test -w packages/import-cost

# Run a single test (mocha grep)
cd packages/import-cost && npx mocha -t 4000 test/mocha-setup.js test/**/*.spec.js --grep "pattern"

# Lint
npm run lint

# Build (vscode extension)
npm run build
```

## Monorepo Structure (npm workspaces)

- **`packages/import-cost`** — Core Node module. Parses source files for import/require statements using Babel, then bundles each import with webpack (in-memory via memfs) to calculate minified + gzipped sizes. This is the library other editor extensions consume.
- **`packages/vscode-import-cost`** — VSCode extension that wires the core module into VSCode's editor decorations. Has both electron and browser entry points.
- **`packages/coc-import-cost`** — coc.nvim extension for Vim/Neovim.
- **`packages/native-fs-adapter`** — Thin adapter over fs-extra, used by import-cost for cache file I/O (abstracted so browser builds can swap it).

The vscode extension depends on `import-cost` via npm workspaces symlink — changes to the core module are immediately visible without re-publishing.

## Architecture (import-cost core)

The pipeline for calculating a package's import size:

1. **`parser.js`** — Dispatches to `babel-parser.js` for JS/TS, or first extracts `<script>` content for Vue/Svelte files
2. **`babel-parser.js`** — Uses `@babel/parser` + `@babel/traverse` to find all import/require statements, returns package info objects with the import string and line number
3. **`package-info.js`** — Orchestrates size calculation. Maintains an in-memory + on-disk cache (`ic-cache-{version}` in tmpdir). Uses `worker-farm` for concurrent webpack builds, with debouncing per file+line
4. **`webpack.js`** — Creates a temp entry file in memfs, runs webpack with the config from `webpack-config.js`, reads the output bundle size and gzips it
5. **`index.js`** — Public API. Returns an EventEmitter that emits: `start`, `calculated` (per-package), `done`, `error`, `log`

## Key Patterns

- **EventEmitter-based API**: `importCost()` returns an emitter, not a promise. Consumers listen for `start`, `calculated`, `done`, `error` events.
- **In-memory filesystem**: Webpack runs against memfs for both input (temp entry files) and output (bundles). The real filesystem is only used to resolve node_modules via a custom `inputFileSystem` that falls through to the real fs.
- **Worker farm**: In concurrent mode (default for Node, disabled in browser), webpack builds run in separate worker processes via `worker-farm`.
- **Size cache**: Results are cached by `importString#version` in a temp file. Cache is version-scoped to avoid stale entries across import-cost upgrades.

## Languages Supported

JavaScript, TypeScript (both parsed as TS by Babel), Vue, and Svelte (script tags extracted then parsed as TS).

## Testing

Tests are in `packages/import-cost/test/` using Mocha + Chai. The test suite imports real packages from fixtures and verifies calculated sizes are within expected ranges. Tests have a 4-second timeout per test due to webpack compilation time.
