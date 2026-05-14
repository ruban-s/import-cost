import { execFileSync } from 'child_process';

const PLATFORMS = [
  { target: 'darwin-arm64', vsceTarget: 'darwin-arm64' },
  { target: 'darwin-x64', vsceTarget: 'darwin-x64' },
  { target: 'linux-x64', vsceTarget: 'linux-x64' },
  { target: 'linux-arm64', vsceTarget: 'linux-arm64' },
  { target: 'win32-x64', vsceTarget: 'win32-x64' },
  { target: 'win32-arm64', vsceTarget: 'win32-arm64' },
];

const requested = process.argv[2];
const targets = requested
  ? PLATFORMS.filter(p => p.target === requested)
  : PLATFORMS;

if (targets.length === 0) {
  console.error(
    `Unknown platform: ${requested}\nAvailable: ${PLATFORMS.map(p => p.target).join(', ')}`,
  );
  process.exit(1);
}

for (const { target, vsceTarget } of targets) {
  console.log(`\nBuilding for ${target}...`);
  try {
    execFileSync('node', ['build.mjs', `--target=${target}`], {
      stdio: 'inherit',
    });
    execFileSync(
      'npx',
      [
        '@vscode/vsce',
        'package',
        '--no-dependencies',
        '--target',
        vsceTarget,
      ],
      { stdio: 'inherit' },
    );
    console.log(`Done: ${target}`);
  } catch (e) {
    console.error(`Failed: ${target} — ${e.message}`);
  }
}
