import Mocha from 'mocha';
import * as path from 'path';

export function run(): Promise<void> {
  return new Promise((resolve, reject) => {
    const mocha = new Mocha({ ui: 'bdd', color: true, timeout: 10000 });
    mocha.addFile(path.resolve(__dirname, '../suite/extension.test.js'));
    mocha.run(failures =>
      failures > 0 ? reject(new Error('Tests failed')) : resolve(),
    );
  });
}
