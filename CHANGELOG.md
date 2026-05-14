# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [5.5.1] - 2026-05-14

### Fixed

- Faster cold open: drop 500ms debounce, 200ms activation, and 100ms editor-switch delays
- Show `bundle failed` decoration with hover error instead of silent hide
- Failed bundles retry on next call instead of being cached as zero
- Halve package.json reads by combining version + sideEffects lookup

## [5.5.0]

### Added

- Watch mode (`--watch`) for live terminal output during development
- Diff mode (`fast-import-cost diff main`) to compare import costs between git branches/commits
- Ignore list via `.importcostignore` file, `--ignore` CLI flag, and VS Code settings

### Changed

- Status bar shows total with brotli in tooltip, warning icon when imports exceed budget

## [5.4.2]

### Changed

- CLI runs in under 1s instead of 30s
- Files processed concurrently in CLI with progress indicator

## [5.4.0]

### Added

- Diagnostic warnings for over-budget imports in the VS Code Problems panel
- Side effects badge showing tree-shakeability in hover tooltip
- CLI mode (`npx fast-import-cost check src/ --budget 100`) with `--json` and `--sort` support

## [5.3.1]

### Fixed

- Fallback to entry file size when esbuild bundling fails (covers prisma, nestjs, firebase, etc.)
- Use `require.resolve` for package lookup — supports npm, pnpm, yarn, yarn PnP, and bun
- Add bun workspace detection via `bun.lock`
- Fix codicon not rendering in decorations — use unicode warning symbol instead

## [5.3.0]

### Added

- "Bundle failed" indicator for packages that cannot be bundled (native modules, etc.)

### Changed

- Skip `@types/*` packages in package.json view (no runtime code)
- Grey color for failed packages with hover explaining the reason

## [5.2.0]

### Changed

- Replace SWC with es-module-lexer — remove 23MB native binary
- VSIX size reduced from 13MB to 4.2MB, installed size from 33MB to 10MB

### Removed

- SWC native binary dependency (only esbuild remains as native dep)

## [5.1.1]

### Fixed

- Package.json decorations now support all display modes (brotli, budgets, alternatives)
- Replace deprecated `vsce` CLI with `@vscode/vsce`

## [5.1.0]

### Added

- Brotli compression display showing real-world CDN size alongside gzip
- Size budget setting (`importCost.budgetKB`) with warning icon and red color
- Code actions to convert wildcard imports to named imports on large packages
- Lighter alternative suggestions in hover tooltip (e.g. moment to dayjs)
- Seven display modes: both, minified, gzip, brotli, minified+gzip, minified+brotli, compressed

## [5.0.0]

### Changed

- Rewrite all packages to TypeScript with full type declarations
- Reduce VSIX size from 43MB to 33MB with platform-specific builds

### Removed

- `native-fs-adapter` and `fs-extra` dependencies (replaced with `node:fs/promises`)

## [4.4.0]

### Added

- Monorepo support for npm, yarn, and pnpm workspaces
- pnpm workspace detection via `pnpm-workspace.yaml`

### Fixed

- Workspace packages (e.g. `@app/common`) silently skipped instead of erroring

## [4.3.0]

### Added

- Hover details showing minified size, gzipped size, and compression ratio
- `importCost.ignoredPackages` setting to skip calculation for specific packages
- Large package warning (100KB+) in hover tooltip

## [4.2.0]

### Added

- Status bar showing total import cost of current file
- "Import Cost: Clear Cache" command
- Treeshake hint for wildcard imports on large packages (50KB+)

### Fixed

- Status bar click triggers clear cache instead of toggle
- Skip treeshake hint for packages that only support namespace imports

## [4.1.2]

### Fixed

- Lower minimum VS Code version to ^1.75.0 for Cursor and other fork compatibility

## [4.1.1]

### Changed

- Update all repository URLs to forked repo
- Update extension branding, icon, and READMEs

## [4.1.0]

### Added

- Show bundle sizes for dependencies in package.json
- Show size on the `from` line for multi-line imports

### Fixed

- Use text matching for line numbers so decorations show on the import keyword line
- Delay initial processing to ensure editor is rendered
- Track active editor and re-apply decorations on tab switch

## [4.0.0]

### Changed

- Replace webpack with esbuild for bundle size calculation (10-100x faster)
- Replace Babel with SWC for import parsing (5-10x faster)
- Replace cheerio with regex for Vue/Svelte script extraction
- Replace ESLint + Prettier with Biome
- Rebuild extension with esbuild (smaller VSIX, faster builds)
- New extension icon and branding

### Removed

- worker-farm (esbuild is fast enough for direct calls)
- Browser polyfills and web extension support

### Fixed

- All security vulnerabilities resolved (0 audit issues)
- Decoration persistence on tab switch
- Line number calculation for multi-line imports

## [3.2.0]

### Fixed

- Use bundled mode in Electron environment

## [3.1.0]

### Added

- Web extension support (works in vscode.dev)
- Webpack bundling for the extension

### Changed

- Handle timeouts in webpack plugin instead of worker farm

## [2.15.0]

### Changed

- Bump vscode-import-cost to use import-cost 2.2.0

## [2.14.0]

### Added

- Support for Svelte files
- Support for Vue single-file components

### Changed

- Modernize VS Code extension infrastructure

## [2.13.0]

### Changed

- Bump parser dependencies

## [2.12.0]

### Added

- Support for dynamic imports

## [2.11.0]

### Added

- Ability to toggle the extension on/off
- Support for monorepo directory structures

## [2.10.0]

### Changed

- Use Babel to parse TypeScript (instead of ts-specific parser)
- Handle bundle size calculation timeout gracefully

## [2.9.0]

### Added

- Support for decorator syntax via Babel config

## [2.8.0]

### Changed

- Upgrade to Babel 7

### Added

- Support for `import module = require("module")` syntax

## [2.7.2]

### Fixed

- Remove misguided NODE_ENV setting

## [2.7.1]

### Fixed

- Standardize TypeScript import statements using parser AST for better caching
- Correct handling of TypeScript imports with no import clause

## [2.7.0]

### Changed

- Upgrade to webpack 4
- More specific activation events for faster load time

### Fixed

- Handle legacy TypeScript import syntax

## [2.6.2]

### Fixed

- Pin lock files for reproducible builds

## [2.6.1]

### Fixed

- Exception when parsing cherry-picked packages

## [2.6.0]

### Changed

- Externalize peer dependencies from bundle size calculation

### Fixed

- Keep hard-coded externals in addition to peer deps

## [2.5.1]

### Fixed

- Allow imports with no semicolon

## [2.4.0]

### Added

- Configuration to control the calculating decoration display

## [2.1.0]

### Added

- Gzip size display alongside minified size

## [2.0.0]

### Changed

- Split into `vscode-import-cost` extension and `import-cost` core library (monorepo with Lerna)

## [1.3.0]

### Changed

- Bundle with NODE_ENV set to production for accurate size measurement

## [1.2.3]

### Fixed

- Allow imports with no semicolon in parser

## [1.2.2]

### Changed

- Treat react and react-dom as externals for React component packages

## [1.1.0]

### Added

- Gzip size reporting

### Changed

- Scope hoisting for more accurate bundle sizes

## [1.0.0]

### Added

- Initial release
- Inline display of import/require package sizes in VS Code
- Support for JavaScript and TypeScript files
- Cross-session cache for faster repeated lookups
- Color-coded size decorations (small, medium, large)
- Configurable file extensions and size thresholds
