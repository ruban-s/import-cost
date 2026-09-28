# Changes

## Unreleased

- Add **`importCost.budgetMetric`**: apply `budgetKB` to the minified, gzip or brotli size
- Settings changes apply to open files immediately, no edit needed
- Faster, leaner first calculation: imports from the same package share one esbuild build (18-import React file: 307 ms to 222 ms, peak memory 218 MB to 170 MB)

## 5.8.0

- Add **optimization report** — new command opens a webview panel with ranked bundle savings, clickable file links, and potential KB savings
- Add **duplicate capability detection** — warns when project uses multiple packages for the same purpose (e.g. moment + dayjs)
- Fix **platform builds**: every VSIX is now platform-targeted with the matching esbuild binary (the published universal package only worked on Apple Silicon; elsewhere every size fell back to a grey `~` estimate), and a missing binary fails the build
- Fix **CPU loop on untitled buffers**: bare imports in an unsaved buffer no longer spin forever; untitled buffers are measured only inside a workspace folder, and git diff sides and notebook cells are no longer decorated as the working file
- Fix **Toggle**: off/on/off no longer throws `illegal state - object is disposed`, and diagnostics keep working after re-enabling
- Fix **React subpaths**: `react-dom/client` and `react/jsx-runtime` show their real size instead of ~300 B
- Fix **JSX/TSX parsing**: `import React, { useState } from 'react'` is no longer dropped when the file trips the lexer
- Fix **package.json view**: sizes sit on the dependency's own line (not `keywords` or `peerDependencies`); devDependencies are skipped unless `importCost.packageJsonDevDependencies` is on
- Fix **ignored packages** are never resolved or bundled; `.importcostignore` is read from the file's own workspace folder
- Fix **hovers**: icons render, the markdown is no longer trusted, and the `sideEffects` row reports the field accurately instead of guessing tree-shakeability
- Fix **timeouts** show as errors instead of a permanently cached estimate; estimates and workspace packages are never cached to disk
- Remove **Convert to named import** (it produced code that did not compile) and the no-op budget quick fix
- **Duplicate detection** no longer flags companion packages (@emotion/react + @emotion/styled, moment + moment-timezone, redux + @reduxjs/toolkit, framer-motion + motion, react-spring + @react-spring/web), reports once per file and package, and can be turned off with `importCost.duplicateDetection`
- **Optimization report**: no false suggestions for deep imports like `lodash/pick`, no double-counted savings, savings labelled as estimates, accurate file counts, complete results when opened during the initial scan, and a CSP-locked webview
- **Workspace sharing** counts only files in the same package and ignores tests, stories and config files; the hover no longer claims a ~0 KB marginal cost unconditionally
- **Status bar** opens the optimization report (it used to clear the cache) and hides on unsupported files
- `.mts`, `.cts`, `.mjs` and `.cjs` files are supported by default; the default medium colour is now amber
- Size cache moved from shared `/tmp` to the extension's global storage
- **Memory**: the esbuild service stops after 30 s idle (it kept ~250 MB resident), at most 4 builds run at once, and compression runs off the extension host thread

## 5.7.0

- Add **workspace-aware import sharing** — decorations show `· shared N files` for packages imported across multiple files
- Add **marginal cost in hover** — lists other files using the same package, notes marginal bundle cost is ~0 KB
- Add **unique cost in status bar** — `Σ 340 KB (45 KB unique)` when shared imports exist
- New settings: `importCost.workspaceAwareness`, `importCost.showWorkspaceSharing`

## 5.6.0

- Fix **memory leak** — clean up emitters, timers, and decorations when files are closed
- Enable **parallel bundling** in IDE — concurrent import calculations for faster results
- **Smart debouncing** — track previous imports per file, skip recalculating unchanged ones
- **Incremental package.json** — only recalculate changed/added dependencies, not all
- **Estimated size indicator** — show `~` prefix and grey color when bundling falls back to entry file size
- **Export analysis** in hover — show named import count, suggest named imports for wildcard on large packages
- **Multi-line import detection** — use es-module-lexer byte offsets instead of string search
- **LRU cache eviction** — cap at 5000 entries, atomic write-rename for crash safety, configurable cache directory
- **Platform-specific VSIX** — `npm run build:platform` generates per-platform packages (~5x smaller)

## 5.5.1

- Faster cold open: drop 500ms debounce, 200ms activation, and 100ms editor-switch delays
- Show `⚠ bundle failed` decoration with hover error instead of silent hide
- Failed bundles retry on next call instead of being cached as zero
- Halve package.json reads by combining version + sideEffects lookup

## 5.5.0

- Add **watch mode** — `--watch` flag re-scans files on changes, live terminal output during development
- Add **diff mode** — `fast-import-cost diff main` compares import costs between git branches/commits
- Add **ignore list** — `.importcostignore` file with glob patterns, `--ignore` CLI flag, integrated with VS Code settings
- Enhance **status bar** — shows `Σ` total with brotli in tooltip, `$(warning)` icon when imports exceed budget

## 5.4.0

- Add **diagnostic warnings** — over-budget imports appear in the Problems panel with yellow squiggles
- Add **side effects badge** — hover shows `Tree-shakeable: Yes/No/Partial` based on package's `sideEffects` field
- Add **CLI mode** — `npx import-cost-core check src/ --budget 100` for CI pipelines, supports `--json` and `--sort`

## 5.3.1

- Fallback to entry file size when esbuild bundling fails (covers `prisma`, `@nestjs/cli`, `firebase`, etc.)
- Use `require.resolve` for package lookup — natively supports npm, pnpm, yarn, yarn PnP, and bun
- Add bun workspace detection via `bun.lock`
- Fix `$(warning)` codicon not rendering in decorations — use unicode `⚠` instead

## 5.3.0

- Show "bundle failed" indicator for packages that can't be bundled (e.g. `@prisma/client`, native modules)
- Skip `@types/*` packages in package.json view (no runtime code)
- Grey color for failed packages with hover explaining the reason

## 5.2.0

- Replace **SWC** with **es-module-lexer** — remove 23MB native binary
- VSIX size: 13MB → **4.2MB**, installed size: 33MB → **10MB**
- Only one native dependency remains (`esbuild`)

## 5.1.1

- Fix package.json decorations to support all display modes (brotli, budgets, alternatives)
- Replace deprecated `vsce` CLI with `@vscode/vsce`

## 5.1.0

- Add **brotli compression** display — shows real-world CDN size alongside gzip
- Add **size budget** (`importCost.budgetKB`) — warning icon and red color when imports exceed the limit
- Add **code actions** — quick-fix to convert wildcard imports to named imports on large packages
- Add **lighter alternative suggestions** — hover tooltip suggests smaller replacements (e.g. moment → dayjs)
- Add 7 display modes: `both`, `minified`, `gzip`, `brotli`, `minified+gzip`, `minified+brotli`, `compressed`

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
