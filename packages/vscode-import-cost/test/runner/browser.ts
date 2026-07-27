const mocha = require('mocha/mocha');

export function run(): Promise<void> {
  return new Promise((resolve, reject) => {
    mocha.setup({ ui: 'bdd', timeout: 10000, reporter: undefined });
    require('../suite/extension.test.js');
    mocha.run((failures: number) =>
      failures > 0 ? reject(new Error('Tests failed')) : resolve(),
    );
  });
}
