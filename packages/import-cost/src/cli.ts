#!/usr/bin/env node

import { execFileSync } from 'child_process';
import { filesize } from 'filesize';
import * as fs from 'fs';
import * as path from 'path';
import { findIgnoreFile } from './ignore';
import { cleanup, importCostAsync, Lang } from './index';
import type { ImportCostConfig, PackageInfo } from './types';

type Entry = PackageInfo & { file: string };
type Failure = { file: string; message: string };

const HELP = `
Usage: fast-import-cost <command> <files|dirs...> [options]

Commands:
  check <paths...>              Scan files for import costs
  diff <base> [head]            Compare import costs between git refs

Options:
  --budget <KB>                 Max allowed import size in KB (exit 1 if exceeded)
  --json                        Output results as JSON
  --sort                        Sort results by size (largest first)
  --watch                       Re-scan on file changes
  --ignore <patterns>           Comma-separated package patterns to ignore (e.g. "lodash,@angular/*")
  --strict                      Exit 1 when a file or import cannot be measured
  --help, -h                    Show this help

Ignore file:
  Create .importcostignore in your project root with one pattern per line.
  Supports exact names and glob patterns (e.g. @angular/*, lodash*).
  Lines starting with # are comments.

Notes:
  Sizes prefixed with ~ are estimates (bundling failed, entry file size shown).
  diff measures both refs against the currently installed node_modules, so
  dependency version bumps are not reflected, only import changes.

Examples:
  fast-import-cost check src/
  fast-import-cost check src/app.ts --budget 100
  fast-import-cost check . --json --budget 50
  fast-import-cost check src/ --watch
  fast-import-cost check src/ --ignore "lodash,moment"
  fast-import-cost diff main
  fast-import-cost diff main feature-branch
`;

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(HELP);
  process.exit(0);
}

const command = args[0];
if (command !== 'check' && command !== 'diff') {
  fail(`Unknown command: ${command}. Use "check" or "diff".`);
}

const VALUE_FLAGS = new Set(['--budget', '--ignore']);
const BOOLEAN_FLAGS = new Set(['--json', '--sort', '--watch', '--strict']);
const flags = new Map<string, string>();
const positional: string[] = [];
for (let i = 1; i < args.length; i++) {
  const arg = args[i];
  if (VALUE_FLAGS.has(arg)) {
    const value = args[++i];
    if (value === undefined || value.startsWith('--')) {
      fail(`${arg} requires a value`);
    }
    flags.set(arg, value);
  } else if (BOOLEAN_FLAGS.has(arg)) {
    flags.set(arg, 'true');
  } else if (arg.startsWith('-')) {
    fail(`Unknown option: ${arg}`);
  } else {
    positional.push(arg);
  }
}

const budgetArg = flags.get('--budget');
const budget = budgetArg === undefined ? 0 : Number(budgetArg);
if (budgetArg !== undefined && !(Number.isFinite(budget) && budget > 0)) {
  fail(
    `Invalid --budget value "${budgetArg}": expected a number of KB greater than 0`,
  );
}
const jsonOutput = flags.has('--json');
const sortBySize = flags.has('--sort');
const watchMode = flags.has('--watch');
const strict = flags.has('--strict');
const cliIgnorePatterns = (flags.get('--ignore') ?? '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

if (command === 'check' && positional.length === 0) {
  fail('No files or directories specified.');
}

const EXTENSIONS = [
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.vue',
  '.svelte',
];

function getLanguage(fileName: string): Lang | null {
  if (/\.[cm]?tsx?$/.test(fileName)) return Lang.TYPESCRIPT;
  if (/\.[cm]?jsx?$/.test(fileName)) return Lang.JAVASCRIPT;
  if (fileName.endsWith('.vue')) return Lang.VUE;
  if (fileName.endsWith('.svelte')) return Lang.SVELTE;
  return null;
}

function collectFiles(targets: string[]): string[] {
  const files: string[] = [];
  for (const target of targets) {
    const resolved = path.resolve(target);
    if (!fs.existsSync(resolved)) {
      console.error(`Path not found: ${target}`);
      continue;
    }
    const stat = fs.statSync(resolved);
    if (stat.isFile()) {
      if (EXTENSIONS.includes(path.extname(resolved))) {
        files.push(resolved);
      }
    } else if (stat.isDirectory()) {
      walkDir(resolved, files);
    }
  }
  return files;
}

function walkDir(dir: string, files: string[]): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (['node_modules', 'dist', 'build', 'coverage'].includes(entry.name))
      continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full, files);
    } else if (EXTENSIONS.includes(path.extname(entry.name))) {
      files.push(full);
    }
  }
}

function getConfig(): ImportCostConfig {
  return {
    maxCallTime: 30000,
    debounceDelay: 0,
    ignore: [...cliIgnorePatterns, ...findIgnoreFile(process.cwd())],
  };
}

function errorMessage(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).split('\n')[0];
}

const CONCURRENCY = 10;

async function scanFiles(
  files: string[],
  config: ImportCostConfig,
  onProgress: (done: number, total: number) => void,
): Promise<{ entries: Entry[]; failures: Failure[] }> {
  const entries: Entry[] = [];
  const failures: Failure[] = [];
  const queue = [...files];
  let completed = 0;

  async function worker() {
    for (let file = queue.shift(); file; file = queue.shift()) {
      const lang = getLanguage(file);
      try {
        if (lang) {
          const content = fs.readFileSync(file, 'utf-8');
          const packages = await importCostAsync(file, content, lang, config);
          for (const pkg of packages) entries.push({ ...pkg, file });
        }
      } catch (e) {
        failures.push({ file, message: errorMessage(e) });
      }
      onProgress(++completed, files.length);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker),
  );
  return { entries, failures };
}

const isOverBudget = (pkg: PackageInfo) =>
  budget > 0 && (pkg.size || 0) / 1024 > budget;
const format = (bytes: number) => filesize(bytes, { standard: 'jedec' });

function printFailures(failures: Failure[]): void {
  for (const { file, message } of failures) {
    console.error(
      `  ⚠ Skipped ${path.relative(process.cwd(), file)}: ${message}`,
    );
  }
}

function printResults(
  entries: Entry[],
  failures: Failure[],
  fileCount: number,
): number {
  const measured = entries.filter(pkg => !pkg.error && (pkg.size || 0) > 0);
  const errored = entries.filter(pkg => pkg.error);
  const shown = [...measured, ...errored].sort((a, b) =>
    sortBySize
      ? (b.size || 0) - (a.size || 0)
      : a.file.localeCompare(b.file) || a.line - b.line,
  );
  const overBudgetCount = measured.filter(isOverBudget).length;

  if (jsonOutput) {
    const output = shown.map(pkg => ({
      file: path.relative(process.cwd(), pkg.file),
      name: pkg.name,
      line: pkg.line,
      size: pkg.size,
      gzip: pkg.gzip,
      brotli: pkg.brotli,
      sideEffects: pkg.sideEffects,
      overBudget: isOverBudget(pkg),
      ...(pkg.estimated ? { estimated: true } : {}),
      ...(pkg.error ? { error: errorMessage(pkg.error) } : {}),
    }));
    console.log(JSON.stringify(output, null, 2));
    printFailures(failures);
    return overBudgetCount;
  }

  if (shown.length === 0) {
    console.log('No imports found.');
  } else {
    console.log(`  Found ${measured.length} imports in ${fileCount} files\n`);
    for (const pkg of shown) {
      const rel = path.relative(process.cwd(), pkg.file);
      if (pkg.error) {
        console.log(
          `  ${rel}:${pkg.line}  ${pkg.name}  ⚠ failed: ${errorMessage(pkg.error)}`,
        );
        continue;
      }
      const prefix = pkg.estimated ? '~' : '';
      const brotli = pkg.brotli ? prefix + format(pkg.brotli) : '-';
      const sideEffects =
        pkg.sideEffects === false ? ' [sideEffects: false]' : '';
      const estimated = pkg.estimated ? ' (estimated)' : '';
      const marker = isOverBudget(pkg) ? ' ⚠ OVER BUDGET' : '';
      console.log(
        `  ${rel}:${pkg.line}  ${pkg.name}  ${prefix}${format(pkg.size || 0)} (gzip: ${prefix}${format(pkg.gzip || 0)}, brotli: ${brotli})${estimated}${sideEffects}${marker}`,
      );
    }
    console.log();
  }
  printFailures(failures);
  if (budget > 0) {
    console.log(
      overBudgetCount > 0
        ? `  ⚠ ${overBudgetCount} import(s) exceed the budget of ${budget} KB\n`
        : `  ✓ All imports within budget (${budget} KB)\n`,
    );
  }
  return overBudgetCount;
}

const showProgress = !jsonOutput && process.stderr.isTTY;

async function runCheck(): Promise<boolean> {
  const files = collectFiles(positional);
  if (files.length === 0) {
    console.error('No matching files found.');
    process.exitCode = 1;
    return false;
  }

  if (showProgress)
    process.stderr.write(`  Scanning ${files.length} files...\n`);
  const { entries, failures } = await scanFiles(
    files,
    getConfig(),
    (done, total) => {
      if (showProgress)
        process.stderr.write(`\r  Progress: ${done}/${total} files`);
    },
  );
  if (showProgress) process.stderr.write('\r\x1b[K');

  const overBudgetCount = printResults(entries, failures, files.length);
  const unmeasured = failures.length + entries.filter(pkg => pkg.error).length;
  process.exitCode = overBudgetCount > 0 || (strict && unmeasured > 0) ? 1 : 0;
  return true;
}

function startWatch(): void {
  const resolvedPaths = positional.map(p => path.resolve(p));
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  console.log('  Watching for changes... (press Ctrl+C to stop)\n');

  for (const target of resolvedPaths) {
    try {
      fs.watch(target, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        if (!EXTENSIONS.includes(path.extname(filename))) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          process.stdout.write('\x1b[2J\x1b[H');
          console.log(`  File changed: ${filename}\n`);
          try {
            await runCheck();
          } catch (e) {
            console.error(e);
          }
          console.log('  Watching for changes... (press Ctrl+C to stop)\n');
        }, 300);
      });
    } catch {
      console.error(`Cannot watch: ${target}`);
    }
  }
}

function gitExec(gitArgs: string[]): string {
  return execFileSync('git', gitArgs, {
    encoding: 'utf-8',
    maxBuffer: 1 << 26,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function runDiff(): Promise<void> {
  const [base, head = 'HEAD'] = positional;
  if (!base) fail('Usage: fast-import-cost diff <base> [head]');

  let top: string;
  let changedFiles: string[];
  try {
    top = gitExec(['rev-parse', '--show-toplevel']);
    changedFiles = gitExec([
      'diff',
      '--name-only',
      `${base}...${head}`,
      '--',
      ...EXTENSIONS.map(e => `*${e}`),
    ])
      .split('\n')
      .filter(f => f && getLanguage(f));
  } catch (e) {
    console.error(`Failed to get git diff: ${errorMessage(e)}`);
    process.exitCode = 1;
    return;
  }

  if (changedFiles.length === 0) {
    console.log('No relevant file changes between refs.');
    return;
  }

  const config = getConfig();
  if (!jsonOutput) {
    process.stderr.write(
      `  Comparing ${changedFiles.length} changed files: ${base} → ${head}\n`,
    );
  }

  const failures: Failure[] = [];
  async function getPackagesAtRef(ref: string): Promise<Entry[]> {
    const results: Entry[] = [];
    for (const file of changedFiles) {
      let content: string;
      try {
        content = gitExec(['show', `${ref}:${file}`]);
      } catch {
        continue;
      }
      const lang = getLanguage(file);
      if (!lang) continue;
      try {
        const packages = await importCostAsync(
          path.resolve(top, file),
          content,
          lang,
          config,
        );
        for (const pkg of packages) {
          if (pkg.size && pkg.size > 0) results.push({ ...pkg, file });
        }
      } catch (e) {
        failures.push({ file: `${ref}:${file}`, message: errorMessage(e) });
      }
    }
    return results;
  }

  const [basePackages, headPackages] = await Promise.all([
    getPackagesAtRef(base),
    getPackagesAtRef(head),
  ]);

  const baseMap = new Map<string, Entry>();
  const headMap = new Map<string, Entry>();
  for (const pkg of basePackages) baseMap.set(`${pkg.file}:${pkg.name}`, pkg);
  for (const pkg of headPackages) headMap.set(`${pkg.file}:${pkg.name}`, pkg);

  interface DiffEntry {
    file: string;
    name: string;
    status: 'added' | 'removed' | 'changed';
    baseSize: number;
    headSize: number;
    delta: number;
  }

  const diffs: DiffEntry[] = [];
  for (const key of new Set([...baseMap.keys(), ...headMap.keys()])) {
    const basePkg = baseMap.get(key);
    const headPkg = headMap.get(key);
    const pkg = headPkg ?? basePkg;
    if (!pkg) continue;
    const baseSize = basePkg?.size || 0;
    const headSize = headPkg?.size || 0;
    const delta = headSize - baseSize;

    let status: DiffEntry['status'];
    if (!basePkg) status = 'added';
    else if (!headPkg) status = 'removed';
    else if (delta !== 0) status = 'changed';
    else continue;

    diffs.push({
      file: pkg.file,
      name: pkg.name,
      status,
      baseSize,
      headSize,
      delta,
    });
  }

  diffs.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  if (jsonOutput) {
    console.log(JSON.stringify(diffs, null, 2));
  } else if (diffs.length === 0) {
    console.log('  No import size changes.\n');
  } else {
    console.log(
      `  ${diffs.length} import${diffs.length !== 1 ? 's' : ''} changed between ${base} and ${head}\n`,
    );
    for (const d of diffs) {
      const icon =
        d.status === 'added'
          ? '+ '
          : d.status === 'removed'
            ? '- '
            : d.delta > 0
              ? '↑ '
              : '↓ ';
      const sizeInfo =
        d.status === 'added'
          ? format(d.headSize)
          : d.status === 'removed'
            ? format(d.baseSize)
            : `${d.delta > 0 ? '+' : '-'}${format(Math.abs(d.delta))}`;
      console.log(`  ${icon}${d.file}  ${d.name}  ${sizeInfo}`);
    }
    const totalDelta = diffs.reduce((sum, d) => sum + d.delta, 0);
    const total =
      totalDelta === 0
        ? '0 B'
        : `${totalDelta > 0 ? '+' : '-'}${format(Math.abs(totalDelta))}`;
    console.log(`\n  Total change: ${total}\n`);
  }
  printFailures(failures);
  if (strict && failures.length > 0) process.exitCode = 1;
}

async function main(): Promise<void> {
  if (command === 'diff') {
    await runDiff();
  } else if ((await runCheck()) && watchMode) {
    return startWatch();
  }
  await cleanup();
}

main().catch(async e => {
  console.error(e);
  process.exitCode = 1;
  await cleanup();
});
