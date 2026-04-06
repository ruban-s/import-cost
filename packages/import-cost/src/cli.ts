#!/usr/bin/env node

import { filesize } from 'filesize';
import * as fs from 'fs';
import * as path from 'path';
import { findIgnoreFile, isIgnored } from './ignore';
import { cleanup, importCostAsync, Lang } from './index';
import type { PackageInfo } from './types';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  console.log(`
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
  --help, -h                    Show this help

Ignore file:
  Create .importcostignore in your project root with one pattern per line.
  Supports exact names and glob patterns (e.g. @angular/*, lodash*).
  Lines starting with # are comments.

Examples:
  fast-import-cost check src/
  fast-import-cost check src/app.ts --budget 100
  fast-import-cost check . --json --budget 50
  fast-import-cost check src/ --watch
  fast-import-cost check src/ --ignore "lodash,moment"
  fast-import-cost diff main
  fast-import-cost diff main feature-branch
`);
  process.exit(0);
}

const command = args[0];
if (command !== 'check' && command !== 'diff') {
  console.error(`Unknown command: ${command}. Use "check" or "diff".`);
  process.exit(1);
}

const budgetIdx = args.indexOf('--budget');
const budget = budgetIdx !== -1 ? Number(args[budgetIdx + 1]) : 0;
const jsonOutput = args.includes('--json');
const sortBySize = args.includes('--sort');
const watchMode = args.includes('--watch');
const ignoreIdx = args.indexOf('--ignore');
const cliIgnorePatterns =
  ignoreIdx !== -1
    ? args[ignoreIdx + 1]
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    : [];

// Value-bearing flags: skip the flag AND its argument
const valueFlagIndices = new Set<number>();
if (budgetIdx !== -1) {
  valueFlagIndices.add(budgetIdx);
  valueFlagIndices.add(budgetIdx + 1);
}
if (ignoreIdx !== -1) {
  valueFlagIndices.add(ignoreIdx);
  valueFlagIndices.add(ignoreIdx + 1);
}

const paths = args
  .slice(1)
  .filter((a, i) => !a.startsWith('--') && !valueFlagIndices.has(i + 1));

if (paths.length === 0) {
  console.error('No files or directories specified.');
  process.exit(1);
}

const EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte'];

function getLanguage(
  fileName: string,
): (typeof Lang)[keyof typeof Lang] | null {
  const ext = path.extname(fileName);
  if (['.ts', '.tsx'].includes(ext)) return Lang.TYPESCRIPT;
  if (['.js', '.jsx'].includes(ext)) return Lang.JAVASCRIPT;
  if (ext === '.vue') return Lang.VUE;
  if (ext === '.svelte') return Lang.SVELTE;
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
    if (
      ['node_modules', 'dist', 'build', 'coverage', '.git'].includes(entry.name)
    )
      continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full, files);
    } else if (EXTENSIONS.includes(path.extname(entry.name))) {
      files.push(full);
    }
  }
}

async function processFile(fileName: string): Promise<PackageInfo[]> {
  const lang = getLanguage(fileName);
  if (!lang) return [];
  const content = fs.readFileSync(fileName, 'utf-8');
  return importCostAsync(fileName, content, lang, {
    maxCallTime: 30000,
    concurrent: true,
    debounceDelay: 0,
  });
}

const CONCURRENCY = 10;

async function processFilesParallel(
  files: string[],
  onProgress: (done: number, total: number) => void,
): Promise<(PackageInfo & { file: string })[]> {
  const allPackages: (PackageInfo & { file: string })[] = [];
  let completed = 0;

  async function worker(queue: string[]) {
    while (queue.length > 0) {
      const file = queue.shift()!;
      try {
        const packages = await processFile(file);
        for (const pkg of packages) {
          if (pkg.size && pkg.size > 0) {
            allPackages.push({ ...pkg, file });
          }
        }
      } catch {
        // skip files that fail
      }
      completed++;
      onProgress(completed, files.length);
    }
  }

  const queue = [...files];
  const workers = Array.from(
    { length: Math.min(CONCURRENCY, files.length) },
    () => worker(queue),
  );
  await Promise.all(workers);
  return allPackages;
}

function getIgnorePatterns(): string[] {
  const filePatterns = findIgnoreFile(process.cwd());
  return [...cliIgnorePatterns, ...filePatterns];
}

function filterByIgnore(
  packages: (PackageInfo & { file: string })[],
  patterns: string[],
): (PackageInfo & { file: string })[] {
  if (patterns.length === 0) return packages;
  return packages.filter(pkg => !isIgnored(pkg.name, patterns));
}

function printResults(
  allPackages: (PackageInfo & { file: string })[],
  fileCount: number,
): number {
  if (sortBySize) {
    allPackages.sort((a, b) => (b.size || 0) - (a.size || 0));
  }

  let overBudgetCount = 0;
  if (budget > 0) {
    for (const pkg of allPackages) {
      if ((pkg.size || 0) / 1024 > budget) overBudgetCount++;
    }
  }

  if (jsonOutput) {
    const output = allPackages.map(pkg => ({
      file: path.relative(process.cwd(), pkg.file),
      name: pkg.name,
      line: pkg.line,
      size: pkg.size,
      gzip: pkg.gzip,
      brotli: pkg.brotli,
      sideEffects: pkg.sideEffects,
      overBudget: budget > 0 && (pkg.size || 0) / 1024 > budget,
    }));
    console.log(JSON.stringify(output, null, 2));
  } else {
    if (allPackages.length === 0) {
      console.log('No imports found.');
    } else {
      console.log(
        `  Found ${allPackages.length} imports in ${fileCount} files\n`,
      );
      for (const pkg of allPackages) {
        const size = filesize(pkg.size!, { standard: 'jedec' });
        const gzip = filesize(pkg.gzip!, { standard: 'jedec' });
        const brotli = pkg.brotli
          ? filesize(pkg.brotli, { standard: 'jedec' })
          : '-';
        const rel = path.relative(process.cwd(), pkg.file);
        const over = budget > 0 && (pkg.size || 0) / 1024 > budget;
        const marker = over ? ' ⚠ OVER BUDGET' : '';
        const treeshake = pkg.sideEffects === false ? ' [tree-shakeable]' : '';
        console.log(
          `  ${rel}:${pkg.line}  ${pkg.name}  ${size} (gzip: ${gzip}, brotli: ${brotli})${treeshake}${marker}`,
        );
      }
      console.log();
    }

    if (budget > 0) {
      if (overBudgetCount > 0) {
        console.log(
          `  ⚠ ${overBudgetCount} import(s) exceed the budget of ${budget} KB\n`,
        );
      } else {
        console.log(`  ✓ All imports within budget (${budget} KB)\n`);
      }
    }
  }
  return overBudgetCount;
}

async function runCheck(): Promise<void> {
  const files = collectFiles(paths);
  if (files.length === 0) {
    console.error('No matching files found.');
    process.exit(1);
  }

  const ignorePatterns = getIgnorePatterns();

  if (!jsonOutput) {
    process.stderr.write(`  Scanning ${files.length} files...\n`);
  }

  const allPackages = await processFilesParallel(files, (done, total) => {
    if (!jsonOutput) {
      process.stderr.write(`\r  Progress: ${done}/${total} files`);
    }
  });

  if (!jsonOutput) {
    process.stderr.write('\r\x1b[K');
  }

  const filtered = filterByIgnore(allPackages, ignorePatterns);
  const overBudgetCount = printResults(filtered, files.length);

  if (!watchMode) {
    cleanup();
    process.exit(budget > 0 && overBudgetCount > 0 ? 1 : 0);
  }
}

// --- Watch mode ---

function startWatch(): void {
  const resolvedPaths = paths.map(p => path.resolve(p));
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  console.log('  Watching for changes... (press Ctrl+C to stop)\n');

  for (const target of resolvedPaths) {
    try {
      fs.watch(target, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        const ext = path.extname(filename);
        if (!EXTENSIONS.includes(ext)) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          process.stdout.write('\x1b[2J\x1b[H'); // clear screen
          console.log(`  File changed: ${filename}\n`);
          await runCheck();
          console.log('  Watching for changes... (press Ctrl+C to stop)\n');
        }, 300);
      });
    } catch {
      console.error(`Cannot watch: ${target}`);
    }
  }
}

// --- Diff mode ---

import { execFileSync } from 'child_process';

function gitExec(gitArgs: string[]): string {
  return execFileSync('git', gitArgs, { encoding: 'utf-8' }).trim();
}

async function runDiff(): Promise<void> {
  const diffArgs = args.slice(1).filter(a => !a.startsWith('--'));
  const base = diffArgs[0];
  const head = diffArgs[1] || 'HEAD';

  if (!base) {
    console.error('Usage: fast-import-cost diff <base> [head]');
    process.exit(1);
  }

  // Get changed files between refs
  let changedFiles: string[];
  try {
    const output = gitExec([
      'diff',
      '--name-only',
      `${base}...${head}`,
      '--',
      ...EXTENSIONS.map(e => `*${e}`),
    ]);
    changedFiles = output
      .split('\n')
      .filter(Boolean)
      .filter(f => EXTENSIONS.includes(path.extname(f)));
  } catch (e: any) {
    console.error(`Failed to get git diff: ${e.message}`);
    process.exit(1);
  }

  if (changedFiles.length === 0) {
    console.log('No relevant file changes between refs.');
    process.exit(0);
  }

  const ignorePatterns = getIgnorePatterns();

  if (!jsonOutput) {
    process.stderr.write(
      `  Comparing ${changedFiles.length} changed files: ${base} → ${head}\n`,
    );
  }

  // Get file contents at a ref and calculate import costs
  async function getPackagesAtRef(
    ref: string,
    files: string[],
  ): Promise<(PackageInfo & { file: string })[]> {
    const results: (PackageInfo & { file: string })[] = [];
    for (const file of files) {
      try {
        const content = gitExec(['show', `${ref}:${file}`]);
        const lang = getLanguage(file);
        if (!lang) continue;
        const absPath = path.resolve(file);
        const packages = await importCostAsync(absPath, content, lang, {
          maxCallTime: 30000,
          concurrent: true,
          debounceDelay: 0,
        });
        for (const pkg of packages) {
          if (pkg.size && pkg.size > 0) {
            results.push({ ...pkg, file });
          }
        }
      } catch {
        // file may not exist at this ref
      }
    }
    return results;
  }

  const [basePackages, headPackages] = await Promise.all([
    getPackagesAtRef(base, changedFiles),
    getPackagesAtRef(head, changedFiles),
  ]);

  const baseFiltered = filterByIgnore(basePackages, ignorePatterns);
  const headFiltered = filterByIgnore(headPackages, ignorePatterns);

  // Build lookup maps
  type PkgEntry = PackageInfo & { file: string };
  const baseMap = new Map<string, PkgEntry>();
  const headMap = new Map<string, PkgEntry>();
  for (const pkg of baseFiltered) baseMap.set(`${pkg.file}:${pkg.name}`, pkg);
  for (const pkg of headFiltered) headMap.set(`${pkg.file}:${pkg.name}`, pkg);

  const allKeys = new Set([...baseMap.keys(), ...headMap.keys()]);

  interface DiffEntry {
    file: string;
    name: string;
    status: 'added' | 'removed' | 'changed';
    baseSize: number;
    headSize: number;
    delta: number;
  }

  const diffs: DiffEntry[] = [];
  for (const key of allKeys) {
    const basePkg = baseMap.get(key);
    const headPkg = headMap.get(key);
    const file = (headPkg || basePkg)!.file;
    const name = (headPkg || basePkg)!.name;
    const baseSize = basePkg?.size || 0;
    const headSize = headPkg?.size || 0;
    const delta = headSize - baseSize;

    let status: DiffEntry['status'];
    if (!basePkg) status = 'added';
    else if (!headPkg) status = 'removed';
    else if (delta !== 0) status = 'changed';
    else continue; // unchanged, skip

    diffs.push({ file, name, status, baseSize, headSize, delta });
  }

  diffs.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  if (jsonOutput) {
    console.log(JSON.stringify(diffs, null, 2));
  } else {
    if (diffs.length === 0) {
      console.log('  No import size changes.\n');
    } else {
      console.log(
        `  ${diffs.length} import${diffs.length !== 1 ? 's' : ''} changed between ${base} and ${head}\n`,
      );
      for (const d of diffs) {
        const deltaStr = filesize(Math.abs(d.delta), { standard: 'jedec' });
        const sign = d.delta > 0 ? '+' : '-';
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
            ? filesize(d.headSize, { standard: 'jedec' })
            : d.status === 'removed'
              ? filesize(d.baseSize, { standard: 'jedec' })
              : `${sign}${deltaStr}`;
        console.log(`  ${icon}${d.file}  ${d.name}  ${sizeInfo}`);
      }
      const totalDelta = diffs.reduce((sum, d) => sum + d.delta, 0);
      const totalStr = filesize(Math.abs(totalDelta), { standard: 'jedec' });
      const totalSign = totalDelta > 0 ? '+' : '-';
      console.log(
        `\n  Total change: ${totalDelta === 0 ? '0 B' : `${totalSign}${totalStr}`}\n`,
      );
    }
  }

  cleanup();
  process.exit(0);
}

// --- Entry point ---

if (command === 'diff') {
  runDiff().catch(e => {
    console.error(e);
    process.exit(1);
  });
} else {
  runCheck()
    .then(() => {
      if (watchMode) startWatch();
    })
    .catch(e => {
      console.error(e);
      process.exit(1);
    });
}
