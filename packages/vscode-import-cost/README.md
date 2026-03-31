# Import Cost VSCode Extension

> Forked from [wix/import-cost](https://github.com/wix/import-cost) and optimized for performance.

This extension will display inline in the editor the size of the imported package.
The extension utilizes esbuild in order to detect the imported size.

![Example Image](https://citw.dev/_next/image?url=%2Fposts%2Fimport-cost%2F1quov3TFpgG2ur7myCLGtsA.gif&w=1080&q=75)

## Features
Calculates the size of imports and requires.
Currently supports:

- Default importing: `import Func from 'utils';`
- Entire content importing: `import * as Utils from 'utils';`
- Selective importing: `import {Func} from 'utils';`
- Selective importing with alias: `import {orig as alias} from 'utils';`
- Submodule importing: `import Func from 'utils/Func';`
- Require: `const Func = require('utils').Func;`
- Supports both `Javascript` and `Typescript`

## Why & How
We detail the why and how in this blog post:
https://medium.com/@yairhaimo/keep-your-bundle-size-under-control-with-import-cost-vscode-extension-5d476b3c5a76

## Known Issues
- Importing two libraries with a common dependency will show the size of both libraries isolated from each other, even if the common library needs to be imported only once.
