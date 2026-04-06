# Changes

## 5.1.0

- Add **brotli compression** display — shows real-world CDN size alongside gzip
- Add **size budget** (`importCost.budgetKB`) — warning icon and red color when imports exceed the limit
- Add **code actions** — quick-fix to convert wildcard imports to named imports on large packages
- Add **lighter alternative suggestions** — hover tooltip suggests smaller replacements (e.g. moment → dayjs)

## 5.0.0

- Rewrite all packages to **TypeScript** with full type declarations
- Reduce VSIX size from 43MB to 33MB with platform-specific builds and deduplicated binaries
- Remove `native-fs-adapter` and `fs-extra` — use built-in `node:fs/promises`

## 4.4.0

- Monorepo support — resolves packages from hoisted root `node_modules` in npm/yarn/pnpm workspaces
- pnpm workspace detection via `pnpm-workspace.yaml`
- Workspace packages (like `@app/common`) are silently skipped instead of erroring

## 4.3.0

- Add hover details — hover over any import size to see minified, gzipped, and compression ratio
- Add `importCost.ignoredPackages` setting — skip size calculation for specific packages
- Large package warning (100KB+) shown in hover tooltip

## 4.2.0

- Add status bar showing total import cost of current file
- Add "Import Cost: Clear Cache" command to force recalculation
- Add treeshake hint for wildcard imports (`import *`) on large packages (50KB+)

## 4.1.2

- Lower minimum VSCode version to ^1.75.0 for Cursor and other fork compatibility

## 4.1.1

- Update all repository URLs to forked repo
- Update extension branding and icon
- Update all package READMEs with fork attribution

## 4.1.0

- Show bundle sizes for dependencies in `package.json`
- Show size on the `from` line for multi-line imports

## 4.0.0

- Replace webpack with **esbuild** for bundle size calculation (10-100x faster)
- Replace Babel with **SWC** for import parsing (Rust-based, 5-10x faster)
- Replace cheerio with regex for Vue/Svelte script extraction
- Remove worker-farm (esbuild is fast enough for direct calls)
- Replace ESLint + Prettier with **Biome** (Rust-based linter/formatter)
- Rebuild extension with esbuild (smaller VSIX, faster builds)
- Remove browser polyfills and web extension support
- Fix decoration persistence on tab switch
- Fix line number calculation for multi-line imports
- Update all dependencies to latest versions
- Fix all security vulnerabilities (0 audit issues)
- Replace `vsce` with `@vscode/vsce`
- New extension icon and branding

## 3.1.0 (original wix release)

- Make the extension work on vscode web
- Moved to bundling the extension with webpack
- Moved to handling timeouts in webpack plugin instead of worker farm

## 2.12.0

- Add support for dynamic imports

## 2.11.0

- Ability to toggle the extension
- Support monorepo structure

## 2.10.0

- Use Babel to parse Typescript
- Handle bundle size calculation timeout gracefully

## 2.9.0

- Handle decorators

## 2.8.0

- Update to Babel 7
- Add support for `import module = require("module")`

## 2.7.0

- Upgrade to Webpack 4
- More specific activation events
- Limit number of workers
- Handle legacy Typescript imports

## 2.0.0

- Split into `vscode-import-cost` and `import-cost` packages

## 1.0.6

- Initial release
