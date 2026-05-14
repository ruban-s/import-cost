# Contributing to import-cost

## Project Structure

npm workspaces monorepo with three packages:

| Package | npm name | Description |
|---------|----------|-------------|
| `packages/import-cost` | `import-cost-core` | Core library: parse, resolve, bundle, measure |
| `packages/vscode-import-cost` | `fast-import-cost` | VS Code extension |
| `packages/coc-import-cost` | `coc-import-cost-fast` | coc.nvim extension for Vim/Neovim |

## Getting Started

```sh
git clone https://github.com/ruban-s/import-cost.git
cd import-cost
npm install        # installs all workspace dependencies
npm run build      # builds all packages
npm test           # runs tests across all packages
```

Node 18+ is required.

## Building

`npm run build` at the root builds every package. To build individually:

```sh
# Core library (tsc)
npm run build -w import-cost-core

# VS Code extension (esbuild + VSIX packaging)
cd packages/vscode-import-cost && npm run build

# Extension JS only (no VSIX)
cd packages/vscode-import-cost && node build.mjs

# coc.nvim extension
npm run build -w coc-import-cost-fast
```

## Testing

Tests live in `packages/import-cost/test/` and use Mocha + Chai.

```sh
npm test                          # all workspaces
npm test -w import-cost-core      # core only

# Run a specific test by grep pattern
cd packages/import-cost && npx mocha -t 10000 test/mocha-setup.js 'test/**/*.spec.js' --grep "pattern"
```

The `pretest` script compiles TypeScript before running tests.

## Linting

The project uses [Biome](https://biomejs.dev/) (not ESLint).

```sh
npm run lint       # check
npm run lint:fix   # auto-fix
```

Style rules:
- Single quotes
- 2-space indent
- Trailing commas
- Arrow parens only when needed

## Pre-commit Hooks

[Husky](https://typicode.github.io/husky/) + [lint-staged](https://github.com/lint-staged/lint-staged) run Biome on staged `.js`, `.ts`, and `.mjs` files before every commit. If the hook fails, fix the issues with `npm run lint:fix` and re-stage.

## Architecture

The core library pipeline:

1. **Parse** -- Extract import/require statements using `es-module-lexer` (ESM) and regex (CJS). Vue/Svelte files have their `<script>` block extracted first.
2. **Resolve versions** -- Walk `node_modules` to find each package's version and `sideEffects` field.
3. **Bundle & measure** -- Bundle each import with esbuild (minified, browser platform) and measure raw, gzip, and brotli sizes.

Results are cached in-memory and on disk at `$TMPDIR/ic-cache-<version>`.

## TypeScript

- Target: ES2022
- Module: CommonJS
- Strict mode enabled
- The VS Code extension uses `noEmit` (esbuild handles its build); the core library uses `tsc` directly.

## Submitting Changes

### Commit conventions

- One logical change per commit.
- Prefix the message: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`
- Keep the subject line short and descriptive.
- Do not add `Co-Authored-By` lines.

### Pull requests

1. Fork the repo and create a branch from `master`.
2. Make your changes. Add or update tests if applicable.
3. Ensure `npm test` and `npm run lint` pass.
4. Open a PR against `master` with a clear description of what changed and why.

## License

This project is MIT licensed. By contributing you agree that your contributions will be licensed under the same terms.
