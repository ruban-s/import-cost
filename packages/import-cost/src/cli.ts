#!/usr/bin/env node

import { filesize } from 'filesize';
import * as fs from 'fs';
import * as path from 'path';
import { cleanup, clearSizeCache, importCost, Lang } from './index';
import type { PackageInfo } from './types';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  console.log(`
Usage: fast-import-cost check <files|dirs...> [options]

Commands:
  check <paths...>    Scan files for import costs

Options:
  --budget <KB>       Max allowed import size in KB (exit 1 if exceeded)
  --json              Output results as JSON
  --sort              Sort results by size (largest first)
  --help, -h          Show this help

Examples:
  fast-import-cost check src/
  fast-import-cost check src/app.ts --budget 100
  fast-import-cost check . --json --budget 50
`);
  process.exit(0);
}

const command = args[0];
if (command !== 'check') {
  console.error(`Unknown command: ${command}. Use "check".`);
  process.exit(1);
}

const budgetIdx = args.indexOf('--budget');
const budget = budgetIdx !== -1 ? Number(args[budgetIdx + 1]) : 0;
const jsonOutput = args.includes('--json');
const sortBySize = args.includes('--sort');

const paths = args
  .slice(1)
  .filter(
    a =>
      !a.startsWith('--') &&
      (budgetIdx === -1 || args.indexOf(a) !== budgetIdx + 1),
  );

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

function processFile(fileName: string): Promise<PackageInfo[]> {
  return new Promise((resolve, reject) => {
    const lang = getLanguage(fileName);
    if (!lang) return resolve([]);
    const content = fs.readFileSync(fileName, 'utf-8');
    const emitter = importCost(fileName, content, lang, {
      maxCallTime: 30000,
      concurrent: false,
    });
    emitter.on('done', resolve);
    emitter.on('error', reject);
  });
}

async function main() {
  const files = collectFiles(paths);
  if (files.length === 0) {
    console.error('No matching files found.');
    process.exit(1);
  }

  const allPackages: (PackageInfo & { file: string })[] = [];
  let overBudgetCount = 0;

  for (const file of files) {
    try {
      const packages = await processFile(file);
      for (const pkg of packages) {
        if (pkg.size && pkg.size > 0) {
          allPackages.push({ ...pkg, file });
          if (budget > 0 && pkg.size / 1024 > budget) {
            overBudgetCount++;
          }
        }
      }
    } catch {
      // skip files that fail
    }
  }

  if (sortBySize) {
    allPackages.sort((a, b) => (b.size || 0) - (a.size || 0));
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
        `\n  Found ${allPackages.length} imports in ${files.length} files\n`,
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

  cleanup();
  await clearSizeCache();

  if (budget > 0 && overBudgetCount > 0) {
    process.exit(1);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
