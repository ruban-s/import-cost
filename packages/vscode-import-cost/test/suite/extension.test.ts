import { expect } from 'chai';
import { extensions, window, workspace } from 'vscode';

interface Logger {
  onLog(listener: (text: string) => void): void;
}

interface Calculated {
  name: string;
  size: number;
  gzip: number;
}

function whenDone(emitter: Logger, pkg: string): Promise<Calculated> {
  return new Promise(resolve => {
    emitter.onLog(log => {
      if (log.startsWith('Calculated: ')) {
        const calculated: Calculated = JSON.parse(
          log.replace('Calculated: ', ''),
        );
        if (calculated.name === pkg) resolve(calculated);
      }
    });
  });
}

async function importCost(
  content: string,
  language = 'javascript',
): Promise<Logger> {
  const doc = await workspace.openTextDocument({ content, language });
  await window.showTextDocument(doc);
  const extension = extensions.getExtension('ruban-s.fast-import-cost')!;
  await extension.activate();
  return extension.exports.logger;
}

async function verify(
  fixture: string,
  pkg = 'chai',
  minSize = 10000,
  maxSize = 15000,
  gzipLowBound = 0.01,
  gzipHighBound = 0.8,
): Promise<void> {
  const { size, gzip } = await whenDone(await importCost(fixture), pkg);
  expect(size).to.be.within(minSize, maxSize);
  expect(gzip).to.be.within(size * gzipLowBound, size * gzipHighBound);
}

describe('Import Cost VSCode Extension', () => {
  it('Should report module bundle size', () =>
    verify('const fileSize = require("filesize");\n', 'filesize', 2000, 3000));
});
