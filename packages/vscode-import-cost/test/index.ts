import { runTests as runElectronTests } from '@vscode/test-electron';
import { runTests as runWebTests } from '@vscode/test-web';
import * as path from 'path';

async function main(): Promise<void> {
  await runElectronTests({
    extensionDevelopmentPath: path.resolve(__dirname, '../../'),
    extensionTestsPath: path.resolve(__dirname, './runner/electron.js'),
  });
  await runWebTests({
    browserType: 'chromium',
    folderPath: path.resolve(__dirname, '../../../../'),
    extensionDevelopmentPath: path.resolve(__dirname, '../../'),
    extensionTestsPath: path.resolve(__dirname, './runner/browser.js'),
  });
  process.exit(0);
}

main().catch(() => process.exit(1));
