# Changes

## 3.7.0

- Fix: the published package could not load `import-cost-core` (it was a `file:` dependency that installed as a dangling symlink); now a normal `^5.8.0` dependency
- Fix: code lens requests no longer hang when a calculation errors, and return immediately while toggled off
- Fix: file paths with spaces or non-ASCII characters (document URIs are now decoded)
- `coc.nvim` and `vscode-languageserver-protocol` are no longer installed as runtime dependencies
- Activate on Vue and Svelte files; `bundleSizeDecoration` accepts every mode the extension supports
- Lighter-alternative suggestions come from the shared core table

## 3.6.0

- Version bump to align with core 5.7.0 (workspace intelligence feature in VS Code extension)

## 3.5.0

- Add **Vue and Svelte** language support
- Add **brotli compression** display alongside gzip
- Add **budget warnings** — `⚠ over budget!` when imports exceed configured `budgetKB`
- Add **tree-shake hints** — suggest named imports for large wildcard imports
- Add **lighter alternative suggestions** — e.g. moment → dayjs, lodash → lodash-es
- Add **estimated size indicator** — `~` prefix when bundling falls back to entry file size

## 1.0.0

Initial release
