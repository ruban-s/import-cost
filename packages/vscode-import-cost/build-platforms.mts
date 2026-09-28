import { execFileSync } from 'child_process';

const PLATFORMS = [
  'darwin-arm64',
  'darwin-x64',
  'linux-x64',
  'linux-arm64',
  'win32-x64',
  'win32-arm64',
];

const requested = process.argv[2];
const host = `${process.platform}-${process.arch}`;
const targets =
  requested === 'host'
    ? [host]
    : requested
      ? PLATFORMS.filter(p => p === requested)
      : PLATFORMS;

if (targets.length === 0 || !targets.every(t => PLATFORMS.includes(t))) {
  console.error(
    `Unknown platform: ${requested === 'host' ? host : requested}\nAvailable: host, ${PLATFORMS.join(', ')}`,
  );
  process.exit(1);
}

const failed: string[] = [];
for (const target of targets) {
  console.log(`\nBuilding for ${target}...`);
  try {
    execFileSync('node', ['build.mts', `--target=${target}`], {
      stdio: 'inherit',
    });
    execFileSync(
      'npx',
      ['@vscode/vsce', 'package', '--no-dependencies', '--target', target],
      { stdio: 'inherit', shell: process.platform === 'win32' },
    );
    console.log(`Done: ${target}`);
  } catch (e) {
    failed.push(target);
    console.error(
      `Failed: ${target} — ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

if (failed.length > 0) {
  console.error(`\nFailed targets: ${failed.join(', ')}`);
  process.exit(1);
}
