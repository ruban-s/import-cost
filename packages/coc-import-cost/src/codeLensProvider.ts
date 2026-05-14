import { type CodeLensProvider, workspace } from 'coc.nvim';
import { importCost, Lang } from 'import-cost-core';
import type { CodeLens, TextDocument } from 'vscode-languageserver-protocol';

let fileSize: any;
async function getFileSize() {
  if (!fileSize) {
    fileSize = (await import('filesize')).filesize;
  }
  return fileSize;
}

import logger from './logger';

const ALTERNATIVES: Record<string, { to: string; reason: string }> = {
  moment: { to: 'dayjs', reason: 'dayjs has the same API at ~2KB vs ~300KB' },
  lodash: {
    to: 'lodash-es or individual imports',
    reason: 'lodash-es is tree-shakeable',
  },
  axios: { to: 'ky or native fetch', reason: 'ky is ~3KB, fetch is built-in' },
  uuid: {
    to: 'crypto.randomUUID()',
    reason: 'built into Node 19+ and modern browsers',
  },
  classnames: {
    to: 'clsx',
    reason: 'clsx is a smaller drop-in replacement',
  },
  underscore: {
    to: 'lodash-es or native JS',
    reason: 'most utilities have native equivalents',
  },
  bluebird: {
    to: 'native Promise',
    reason: 'native Promise is fast enough for most use cases',
  },
};

function language(doc) {
  const fileName = doc.uri;
  const languageId = doc.fileType;
  const configuration = workspace.getConfiguration('importCost');
  const typescriptRegex = new RegExp(
    configuration.typescriptExtensions.join('|'),
  );
  const javascriptRegex = new RegExp(
    configuration.javascriptExtensions.join('|'),
  );
  if (languageId === 'svelte' || /\.svelte$/.test(fileName)) {
    return Lang.SVELTE;
  } else if (languageId === 'vue' || /\.vue$/.test(fileName)) {
    return Lang.VUE;
  } else if (
    languageId === 'typescript' ||
    languageId === 'typescriptreact' ||
    typescriptRegex.test(fileName)
  ) {
    return Lang.TYPESCRIPT;
  } else if (
    languageId === 'javascript' ||
    languageId === 'javascriptreact' ||
    javascriptRegex.test(fileName)
  ) {
    return Lang.JAVASCRIPT;
  } else {
    return undefined;
  }
}

async function getDecorationMessage(packageInfo) {
  if (packageInfo.size <= 0) {
    return '';
  }

  const fileSizeFn = await getFileSize();
  const configuration = workspace.getConfiguration('importCost');
  const estimated = packageInfo.estimated;
  const prefix = estimated ? '~' : '';
  const size = prefix + fileSizeFn(packageInfo.size, { standard: 'jedec' });
  const gzip = prefix + fileSizeFn(packageInfo.gzip, { standard: 'jedec' });
  const brotli = packageInfo.brotli
    ? prefix + fileSizeFn(packageInfo.brotli, { standard: 'jedec' })
    : null;

  const mode = configuration.bundleSizeDecoration;
  let label: string;

  if (mode === 'minified') {
    label = size;
  } else if (mode === 'gzipped' || mode === 'gzip') {
    label = gzip;
  } else if (mode === 'brotli') {
    label = brotli || gzip;
  } else if (mode === 'compressed') {
    label = brotli ? `gzip: ${gzip} | brotli: ${brotli}` : gzip;
  } else {
    label = brotli
      ? `${size} (gzip: ${gzip}, brotli: ${brotli})`
      : `${size} (gzipped: ${gzip})`;
  }

  const budget = configuration.get<number>('budgetKB', 0);
  if (budget > 0 && packageInfo.size / 1024 > budget) {
    label = `⚠ ${label} — over budget!`;
  } else if (getTreeshakeHint(packageInfo)) {
    label = `${label} — try named imports`;
  }

  const alt = ALTERNATIVES[packageInfo.name];
  if (alt) {
    label = `${label} [→ ${alt.to}]`;
  }

  return label;
}

function getTreeshakeHint(packageInfo): boolean {
  if (!packageInfo.string || !packageInfo.size) return false;
  if (packageInfo.size / 1024 < 50) return false;
  if (!packageInfo.string.startsWith('import * as ')) return false;
  return true;
}

const uriFileProtocol = 'file://';
function getFileName(uri) {
  if (uri.startsWith(uriFileProtocol)) {
    return uri.slice(uriFileProtocol.length);
  } else {
    return uri;
  }
}

export default class ImportCostCodeLensProvider implements CodeLensProvider {
  private isActive = () => true;

  public constructor(isActive) {
    this.isActive = isActive;
  }

  public provideCodeLenses(document: TextDocument): Promise<CodeLens[]> {
    return new Promise(resolve => {
      if (!this.isActive()) {
        resolve([]);
      }

      const fileName = getFileName(document.uri);
      const { timeout } = workspace.getConfiguration('importCost');
      try {
        const emitter = importCost(
          fileName,
          document.getText(),
          language(document),
          { concurrent: true, maxCallTime: timeout },
        );

        emitter.on('done', async packages => {
          try {
            const imports = await Promise.all(
              packages
                .filter(pkg => pkg.size > 0)
                .map(async pkg => {
                  logger.log(
                    `done with ${pkg.name}: ${JSON.stringify(pkg, null, 2)}`,
                  );
                  return calculated(pkg);
                }),
            );

            logger.log(
              `resolving promise with: ${JSON.stringify({ imports }, null, 2)}`,
            );
            resolve(imports);
          } catch (e) {
            logger.log(`Exception in done emitter: ${e}`);
            resolve([]);
          }
        });

        emitter.on('error', e => {
          logger.log(
            `error while calculating import costs for ${fileName}: ${e}`,
          );
        });
      } catch (e) {
        resolve([]);
      }
    });
  }

  public resolveCodeLens(codeLens: CodeLens): Promise<CodeLens> {
    return Promise.resolve(codeLens);
  }
}

async function calculated(packageInfo) {
  const decorationMessage = await getDecorationMessage(packageInfo);

  return makeCodeLens(decorationMessage, packageInfo);
}

function makeCodeLens(text, packageInfo) {
  const position = { line: packageInfo.line - 1, character: 1024 };
  logger.log(
    `Setting Decoration: ${text}, ${JSON.stringify(packageInfo, null, 2)}`,
  );
  return {
    command: { title: text },
    range: { start: position, end: position },
    data: { fileName: packageInfo.fileName },
  };
}
