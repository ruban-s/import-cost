# Changes

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
