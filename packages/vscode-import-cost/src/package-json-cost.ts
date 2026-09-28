import { filesize } from 'filesize';
import type { PackageInfo } from 'import-cost-core';
import { ALTERNATIVES, importCost, isIgnored, Lang } from 'import-cost-core';
import * as path from 'path';
import * as vscode from 'vscode';
import { budgetDescription, isOverBudget } from './budget';
import { documentPath, ignorePatternsFor } from './document';
import logger from './logger';

const decorationType = vscode.window.createTextEditorDecorationType({});
const decorations: Record<string, Record<number, PackageInfo>> = {};
const previousDeps: Record<string, Record<string, string>> = {};
const dependencyLines: Record<string, Record<string, number>> = {};
let enabled = true;

export function isPackageJson(document?: vscode.TextDocument): boolean {
  const fileName = document && documentPath(document);
  return !!fileName && path.basename(fileName) === 'package.json';
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function findDependencyLines(
  text: string,
  names: string[],
): Record<string, number> {
  const lines: Record<string, number> = {};
  for (const block of ['dependencies', 'devDependencies']) {
    const start = text.search(new RegExp(`"${block}"\\s*:\\s*\\{`));
    if (start < 0) continue;
    const end = text.indexOf('}', start);
    const body = text.slice(start, end < 0 ? undefined : end);
    for (const name of names) {
      if (lines[name]) continue;
      const offset = body.search(new RegExp(`"${escapeRegExp(name)}"\\s*:`));
      if (offset >= 0) {
        lines[name] = text.slice(0, start + offset).split('\n').length;
      }
    }
  }
  return lines;
}

function place(fileName: string, pkg: PackageInfo): void {
  const line = dependencyLines[fileName]?.[pkg.name];
  const fileDecorations = decorations[fileName];
  if (line && fileDecorations) fileDecorations[line] = { ...pkg, line };
}

export function processPackageJson(document: vscode.TextDocument): void {
  const fileName = documentPath(document);
  if (!fileName || path.basename(fileName) !== 'package.json') return;
  const text = document.getText();

  let pkgJson: Record<string, any>;
  try {
    pkgJson = JSON.parse(text);
  } catch {
    return;
  }

  const configuration = vscode.workspace.getConfiguration('importCost');
  const allDeps: Record<string, string> = {
    ...(pkgJson.dependencies || {}),
    ...(configuration.get('packageJsonDevDependencies', false)
      ? pkgJson.devDependencies || {}
      : {}),
  };

  const ignorePatterns = ignorePatternsFor(document);
  const depNames = Object.keys(allDeps).filter(
    name => !name.startsWith('@types/') && !isIgnored(name, ignorePatterns),
  );
  const depLines = findDependencyLines(text, depNames);
  dependencyLines[fileName] = depLines;

  const prev = previousDeps[fileName] || {};
  const changedDeps = depNames.filter(name => prev[name] !== allDeps[name]);
  previousDeps[fileName] = Object.fromEntries(
    depNames.map(name => [name, allDeps[name]]),
  );

  const kept: Record<number, PackageInfo> = {};
  for (const pkg of Object.values(decorations[fileName] ?? {})) {
    const line = depLines[pkg.name];
    if (line && !changedDeps.includes(pkg.name)) kept[line] = { ...pkg, line };
  }
  decorations[fileName] = kept;

  if (changedDeps.length === 0) {
    applyDecorations(fileName);
    return;
  }

  const importStatements = changedDeps
    .map(
      name =>
        `import * as _${name.replace(/[^a-zA-Z0-9]/g, '_')} from '${name}';`,
    )
    .join('\n');

  const emitter = importCost(fileName, importStatements, Lang.JAVASCRIPT, {
    maxCallTime: configuration.get<number>('timeout', 20000),
  });

  const seen = new Set<string>();

  emitter.on('error', (e: Error) =>
    logger.log(`importCost error (package.json): ${e}`),
  );

  emitter.on('calculated', (pkg: PackageInfo) => {
    seen.add(pkg.name);
    place(fileName, pkg);
    applyDecorations(fileName);
  });

  emitter.on('done', () => {
    for (const name of changedDeps) {
      if (seen.has(name)) continue;
      place(fileName, {
        fileName,
        name,
        line: 0,
        string: '',
        error: new Error('Package not found in node_modules'),
      });
    }
    applyDecorations(fileName);
  });
}

function getDecorationColor(pkg: PackageInfo) {
  const configuration = vscode.workspace.getConfiguration('importCost');
  const sizeInKB = (pkg.size || 0) / 1024;
  const color = (dark: string, light: string) => ({
    dark: { after: { color: dark } },
    light: { after: { color: light } },
  });

  if (pkg.error || !pkg.size || pkg.estimated) {
    return color('#888888', '#999999');
  }

  if (isOverBudget(pkg)) {
    return color(
      configuration.largePackageDarkColor,
      configuration.largePackageLightColor,
    );
  }

  if (sizeInKB < configuration.smallPackageSize) {
    return color(
      configuration.smallPackageDarkColor,
      configuration.smallPackageLightColor,
    );
  } else if (sizeInKB < configuration.mediumPackageSize) {
    return color(
      configuration.mediumPackageDarkColor,
      configuration.mediumPackageLightColor,
    );
  } else {
    return color(
      configuration.largePackageDarkColor,
      configuration.largePackageLightColor,
    );
  }
}

function buildLabel(pkg: PackageInfo): string {
  if (pkg.error || !pkg.size) {
    if (pkg.error?.message?.includes('not found')) {
      return '~ not found in node_modules';
    }
    return '~ bundle failed';
  }

  const prefix = pkg.estimated ? '~' : '';
  const configuration = vscode.workspace.getConfiguration('importCost');
  const size = prefix + filesize(pkg.size, { standard: 'jedec' });
  const gzip = prefix + filesize(pkg.gzip ?? 0, { standard: 'jedec' });
  const brotli = pkg.brotli
    ? prefix + filesize(pkg.brotli, { standard: 'jedec' })
    : null;
  const mode = configuration.bundleSizeDecoration;

  let label: string;
  if (mode === 'minified') {
    label = `${size}`;
  } else if (mode === 'gzip') {
    label = `${gzip}`;
  } else if (mode === 'brotli') {
    label = brotli ? `${brotli}` : `${gzip}`;
  } else if (mode === 'minified+gzip') {
    label = `${size} (gzip: ${gzip})`;
  } else if (mode === 'minified+brotli') {
    label = brotli ? `${size} (brotli: ${brotli})` : `${size} (gzip: ${gzip})`;
  } else if (mode === 'compressed') {
    label = brotli ? `gzip: ${gzip} | brotli: ${brotli}` : `${gzip}`;
  } else {
    label = brotli
      ? `${size} (gzip: ${gzip}, brotli: ${brotli})`
      : `${size} (gzipped: ${gzip})`;
  }

  if (isOverBudget(pkg)) {
    label = `⚠ ${label} — over budget!`;
  }

  return label;
}

function buildHoverMessage(pkg: PackageInfo): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.supportThemeIcons = true;
  md.appendMarkdown(`**${pkg.name}**\n\n`);

  if (pkg.error || !pkg.size) {
    const reason = pkg.error?.message?.includes('not found')
      ? `*Not found in node_modules — run \`npm install\` or \`pnpm install\` first.*\n`
      : `*Bundle failed — this package may require native binaries, code generation, or has unresolvable dependencies.*\n`;
    md.appendMarkdown(reason);
    const alt = ALTERNATIVES[pkg.name];
    if (alt) {
      md.appendMarkdown(`\n---\n`);
      md.appendMarkdown(
        `$(lightbulb) **Lighter alternative:** \`${alt.to}\`\n\n`,
      );
      md.appendMarkdown(`${alt.reason}\n`);
    }
    return md;
  }

  if (pkg.estimated) {
    md.appendMarkdown(
      `*⚠ Estimated size — bundling failed, showing entry file size.*\n\n`,
    );
  }

  const size = filesize(pkg.size, { standard: 'jedec' });
  const gzip = filesize(pkg.gzip ?? 0, { standard: 'jedec' });
  const gzipRatio = (((pkg.gzip ?? 0) / pkg.size) * 100).toFixed(0);

  md.appendMarkdown(`| Metric | Value |\n|---|---|\n`);
  md.appendMarkdown(`| Minified | ${size} |\n`);
  md.appendMarkdown(`| Gzipped | ${gzip} (${gzipRatio}% of minified) |\n`);
  if (pkg.brotli) {
    const brotli = filesize(pkg.brotli, { standard: 'jedec' });
    const brotliRatio = ((pkg.brotli / pkg.size) * 100).toFixed(0);
    md.appendMarkdown(`| Brotli | ${brotli} (${brotliRatio}% of minified) |\n`);
  }

  if (isOverBudget(pkg)) {
    md.appendMarkdown(`\n---\n`);
    md.appendMarkdown(
      `$(warning) **Over budget!** The budget is ${budgetDescription()}.\n`,
    );
  }

  const alt = ALTERNATIVES[pkg.name];
  if (alt) {
    md.appendMarkdown(`\n---\n`);
    md.appendMarkdown(
      `$(lightbulb) **Lighter alternative:** \`${alt.to}\`\n\n`,
    );
    md.appendMarkdown(`${alt.reason}\n`);
  }

  return md;
}

function editorsFor(fileName: string): vscode.TextEditor[] {
  return vscode.window.visibleTextEditors.filter(
    editor => documentPath(editor.document) === fileName,
  );
}

function applyDecorations(fileName: string): void {
  if (!enabled || !decorations[fileName]) return;
  const configuration = vscode.workspace.getConfiguration('importCost');
  const arr: vscode.DecorationOptions[] = [];

  for (const [line, pkg] of Object.entries(decorations[fileName])) {
    const dec: vscode.DecorationOptions = {
      renderOptions: {
        ...getDecorationColor(pkg),
        after: {
          contentText: `  ${buildLabel(pkg)}`,
          margin: `0 0 0 ${configuration.margin}rem`,
          fontStyle: configuration.fontStyle,
        },
      },
      range: new vscode.Range(
        new vscode.Position(Number(line) - 1, 1024),
        new vscode.Position(Number(line) - 1, 1024),
      ),
    };
    dec.hoverMessage = buildHoverMessage(pkg);
    arr.push(dec);
  }

  for (const editor of editorsFor(fileName)) {
    editor.setDecorations(decorationType, arr);
  }
}

export function onEditorChange(editor: vscode.TextEditor): void {
  const fileName = documentPath(editor.document);
  if (fileName && isPackageJson(editor.document)) {
    applyDecorations(fileName);
  }
}

export function setPackageJsonEnabled(on: boolean): void {
  enabled = on;
  if (!on) clearPackageJsonDecorations();
}

export function clearPackageJsonDecorations(): void {
  for (const editor of vscode.window.visibleTextEditors) {
    if (isPackageJson(editor.document)) {
      editor.setDecorations(decorationType, []);
    }
  }
}

export function forgetPackageJson(fileName: string): void {
  delete decorations[fileName];
  delete previousDeps[fileName];
  delete dependencyLines[fileName];
}

export function hasPackageJsonDecorations(fileName: string): boolean {
  return !!(
    decorations[fileName] && Object.keys(decorations[fileName]).length > 0
  );
}
