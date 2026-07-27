import { runTests } from '@vscode/test-electron';
import * as path from 'path';

async function main(): Promise<void> {
  await runTests({
    extensionDevelopmentPath: path.resolve(__dirname, '../../'),
    extensionTestsPath: path.resolve(__dirname, './runner/electron.js'),
  });
  process.exit(0);
}

main().catch(() => process.exit(1));
