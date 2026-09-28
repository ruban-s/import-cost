import assert from 'node:assert/strict';
import * as path from 'path';
import {
  ConfigurationTarget,
  commands,
  type Diagnostic,
  extensions,
  languages,
  Uri,
  window,
  workspace,
} from 'vscode';

interface Logger {
  onLog(listener: (text: string) => void): void;
}

interface Calculated {
  name: string;
  size: number;
  gzip: number;
}

const fixture = (name: string) =>
  path.resolve(__dirname, '../../../test/fixtures', name);

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

async function activate(): Promise<Logger> {
  const extension = extensions.getExtension('ruban-s.fast-import-cost');
  assert.ok(extension, 'extension not found');
  await extension.activate();
  return extension.exports.logger;
}

async function open(fileName: string): Promise<void> {
  await window.showTextDocument(await workspace.openTextDocument(fileName));
}

async function budgetDiagnostics(
  uri: Uri,
  expected: number,
): Promise<Diagnostic[]> {
  const deadline = Date.now() + 8000;
  for (;;) {
    const found = languages
      .getDiagnostics(uri)
      .filter(d => d.code === 'over-budget');
    if (found.length === expected) return found;
    if (Date.now() > deadline) {
      assert.fail(
        `expected ${expected} over-budget diagnostics, got ${found.length}`,
      );
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function assertWithin(
  actual: number,
  min: number,
  max: number,
  label: string,
): void {
  assert.ok(
    actual >= min && actual <= max,
    `${label} ${actual} not within ${min}..${max}`,
  );
}

describe('Import Cost VSCode Extension', () => {
  it('Should report module bundle size', async () => {
    const logger = await activate();
    const done = whenDone(logger, 'filesize');
    await open(fixture('require-filesize.js'));
    const { size, gzip } = await done;
    assertWithin(size, 1000, 20000, 'size');
    assertWithin(gzip, size * 0.01, size * 0.8, 'gzip');
  });

  it('Toggles off, on and off again without throwing', async () => {
    await activate();
    await open(fixture('require-filesize.js'));
    for (let i = 0; i < 3; i++) {
      await commands.executeCommand('importCost.toggle');
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    await commands.executeCommand('importCost.toggle');
  });

  it('Applies the budget to the chosen size metric when settings change', async () => {
    await activate();
    const file = fixture('require-filesize.js');
    await open(file);
    const config = workspace.getConfiguration('importCost');
    try {
      await config.update('budgetKB', 3, ConfigurationTarget.Global);
      const [minified] = await budgetDiagnostics(Uri.file(file), 1);
      assert.match(minified.message, /exceeds budget of 3 KB$/);
      await config.update('budgetMetric', 'gzip', ConfigurationTarget.Global);
      await budgetDiagnostics(Uri.file(file), 0);
    } finally {
      await config.update('budgetKB', undefined, ConfigurationTarget.Global);
      await config.update(
        'budgetMetric',
        undefined,
        ConfigurationTarget.Global,
      );
    }
  });
});
