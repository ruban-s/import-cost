# Import Cost Fast — coc.nvim

> See the bundle size of every import in Vim/Neovim.

Display import sizes as virtual text using [coc.nvim](https://github.com/neoclide/coc.nvim). Powered by [esbuild](https://esbuild.github.io/) and [es-module-lexer](https://github.com/nicolo-ribaudo/es-module-lexer).

![Example](images/coc-import-cost.gif)

## Requirements

- [coc.nvim](https://github.com/neoclide/coc.nvim) installed and configured
- Code lens enabled in coc config

## Installation

```vim
:CocInstall coc-import-cost-fast
```

Enable code lens (`:CocConfig`):

```json
{
  "codeLens.enable": true
}
```

## Features

- **Inline size display** — minified, gzipped, and brotli sizes shown as virtual text
- **All import patterns** — `import`, `import *`, `import { }`, `require()`, dynamic `import()`
- **Language support** — JavaScript, TypeScript, Vue, and Svelte
- **Cached results** — sizes cached per package + version for instant display
- **Tree-shake awareness** — reports if a package supports tree-shaking
- **Brotli compression** — shows brotli alongside gzip
- **Budget warnings** — `⚠ over budget!` when imports exceed configured `budgetKB`
- **Lighter alternatives** — suggests smaller replacements (moment → dayjs, lodash → lodash-es)
- **Estimated sizes** — `~` prefix when bundling falls back to entry file size

## Configuration

```json
{
  "importCost.typescriptExtensions": ["\\.tsx?$"],
  "importCost.javascriptExtensions": ["\\.jsx?$"],
  "importCost.vueExtensions": ["\\.vue$"],
  "importCost.svelteExtensions": ["\\.svelte$"],
  "importCost.bundleSizeDecoration": "both",
  "importCost.showCalculatingDecoration": true,
  "importCost.budgetKB": 0,
  "importCost.debug": false
}
```

## Credits

Forked from [wix/import-cost](https://github.com/wix/import-cost), rewritten in TypeScript with esbuild and es-module-lexer.

## License

MIT
