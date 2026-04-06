import { type CodeLensProvider, workspace } from 'coc.nvim';
import { importCost, Lang } from 'import-cost-core';
import {
  CancellationToken,
  type CodeLens,
  type TextDocument,
} from 'vscode-languageserver-protocol';

let fileSize: any;
async function getFileSize() {
  if (!fileSize) {
    fileSize = (await import('filesize')).filesize;
  }
  return fileSize;
}

import logger from './logger';

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
  if (
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
  let decorationMessage: string;
  const configuration = workspace.getConfiguration('importCost');
  const size = fileSizeFn(packageInfo.size, { standard: 'jedec' });
  const gzip = fileSizeFn(packageInfo.gzip, { standard: 'jedec' });
  if (configuration.bundleSizeDecoration === 'both') {
    decorationMessage = `${size} (gzipped: ${gzip})`;
  } else if (configuration.bundleSizeDecoration === 'minified') {
    decorationMessage = size;
  } else if (configuration.bundleSizeDecoration === 'gzipped') {
    decorationMessage = gzip;
  }
  return decorationMessage;
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
  const { fileName } = packageInfo;
  const position = { line: packageInfo.line - 1, character: 1024 };
  logger.log(
    `Setting Decoration: ${text}, ${JSON.stringify(packageInfo, null, 2)}`,
  );
  const codeLens = {
    command: { title: text },
    range: { start: position, end: position },
    data: { fileName },
  };

  return codeLens;
}
