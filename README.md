# Import Cost

This extension will display inline in the editor the size of the imported package.
The extension utilizes esbuild in order to detect the imported size.

## What Changed from the Original

- **Parser**: Replaced Babel with [SWC](https://swc.rs/) (Rust-based, 5-10x faster parsing)
- **Bundler**: Replaced webpack with [esbuild](https://esbuild.github.io/) (Go-based, 10-100x faster bundling)
- **Linter/Formatter**: Replaced ESLint + Prettier with [Biome](https://biomejs.dev/) (Rust-based, single tool)
- **Extension build**: Replaced webpack with esbuild for building the VSCode extension
- **Removed**: cheerio (replaced with regex), worker-farm (esbuild is fast enough), memfs, terser, css-loader, file-loader, url-loader, 12 browser polyfills
- **Result**: Runtime dependencies reduced from 16 to 2 (`esbuild`, `@swc/core`)

## Project Structure

This is an [npm workspaces](https://docs.npmjs.com/cli/v7/using-npm/workspaces) monorepo:

- [`packages/import-cost`](packages/import-cost) — Core Node module for calculating import sizes
- [`packages/vscode-import-cost`](packages/vscode-import-cost) — VSCode extension
- [`packages/coc-import-cost`](packages/coc-import-cost) — [coc.nvim](https://github.com/neoclide/coc.nvim) extension for Vim/Neovim
- [`packages/native-fs-adapter`](packages/native-fs-adapter) — Filesystem adapter for cache I/O

## Getting Started

```sh
git clone <your-fork-url>
npm install
```

## Commands

```sh
# Run all tests
npm test

# Run import-cost tests only
cd packages/import-cost && npx mocha -t 10000 test/mocha-setup.js 'test/**/*.spec.js'

# Run a single test
cd packages/import-cost && npx mocha -t 10000 test/mocha-setup.js 'test/**/*.spec.js' --grep "pattern"

# Lint (Biome)
npm run lint

# Auto-fix lint issues
npm run lint:fix

# Build VSCode extension
cd packages/vscode-import-cost && node build.mjs

# Package VSIX
cd packages/vscode-import-cost && npm run build
```

## Applying Changes

Thanks to npm workspaces, `vscode-import-cost` has a symlink to the local `import-cost` package. Changes to the core module are immediately visible without re-publishing.

Verify the link exists:

```sh
ls -la packages/vscode-import-cost/node_modules | grep import-cost
```

If the link is missing:

```sh
git clean -xdf
npm install
```

## Publishing

Publish the core module first (if changed):

```sh
cd packages/import-cost
npm version patch | minor | major
git commit -a -m "releasing version X.X.X"
git push
npm publish
```

Then publish the extension:

```sh
cd packages/vscode-import-cost
npm version patch | minor | major
git commit -a -m "releasing version X.X.X"
git push
npx @vscode/vsce publish
```

## Why & How

Original blog post: https://citw.dev/posts/import-cost
