import { filesize as fileSize } from 'filesize';
import type { PackageInfo } from 'import-cost';
import * as vscode from 'vscode';
import { ALTERNATIVES } from './alternatives';
import logger from './logger';

const decorations: Record<string, Record<number, PackageInfo>> = {};
const decorationType = vscode.window.createTextEditorDecorationType({});
let activeEditor = vscode.window.activeTextEditor;

export function setDecorations(
  fileName: string,
  packages: PackageInfo[],
): void {
  decorations[fileName] = {};
  packages.forEach(packageInfo => decorate(fileName, packageInfo));
  flushDecorationsDebounced(fileName);
}

function decorate(fileName: string, packageInfo: PackageInfo): void {
  const { line } = packageInfo;
  decorations[fileName][line] = packageInfo;
}

export function calculated(fileName: string, packageInfo: PackageInfo): void {
  if (packageInfo.error) {
    logger.log(
      `Error Calculated: ${JSON.stringify({ ...packageInfo, error: true })}`,
    );
    if (Array.isArray(packageInfo.error)) {
      (packageInfo.error as unknown as Error[]).forEach(err => {
        logger.log(err?.message || JSON.stringify(err));
      });
    } else {
      logger.log(packageInfo.error.toString());
    }
  } else {
    logger.log(`Calculated: ${JSON.stringify(packageInfo)}`);
  }
  decorate(fileName, packageInfo);
  flushDecorationsDebounced(fileName);
}

function isOverBudget(packageInfo: PackageInfo | undefined): boolean {
  if (!packageInfo?.size) return false;
  const budget = vscode.workspace
    .getConfiguration('importCost')
    .get<number>('budgetKB', 0);
  return budget > 0 && packageInfo.size / 1024 > budget;
}

function getDecorationMessage(packageInfo: PackageInfo | undefined) {
  const configuration = vscode.workspace.getConfiguration('importCost');
  const text = (s: string) => ({
    after: {
      contentText: s,
      margin: `0 0 0 ${configuration.margin}rem`,
      fontStyle: configuration.fontStyle,
    },
  });
  if (!packageInfo) {
    return text('Calculating...');
  }
  const size = fileSize(packageInfo.size!, { standard: 'jedec' });
  const gzip = fileSize(packageInfo.gzip!, { standard: 'jedec' });
  const brotli = packageInfo.brotli
    ? fileSize(packageInfo.brotli, { standard: 'jedec' })
    : null;
  const treeshakeHint = getTreeshakeHint(packageInfo);
  const overBudget = isOverBudget(packageInfo);
  let label: string;
  const mode = configuration.bundleSizeDecoration;
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
    // "both" (default) — minified + gzip + brotli
    label = brotli
      ? `${size} (gzip: ${gzip}, brotli: ${brotli})`
      : `${size} (gzipped: ${gzip})`;
  }
  if (overBudget) {
    label = `⚠ ${label} — over budget!`;
  } else if (treeshakeHint) {
    label = `${label} — ${treeshakeHint}`;
  }
  return text(label);
}

function getTreeshakeHint(packageInfo: PackageInfo): string | null {
  if (!packageInfo.string || !packageInfo.size) return null;
  const sizeInKB = packageInfo.size / 1024;
  if (sizeInKB < 50) return null;
  if (!packageInfo.string.startsWith('import * as ')) return null;
  const name = packageInfo.name;
  const skipList = [
    'fs',
    'path',
    'os',
    'crypto',
    'http',
    'https',
    'url',
    'util',
    'stream',
    'events',
    'buffer',
    'assert',
    'zlib',
    'net',
    'tls',
    'dns',
    'child_process',
    'cluster',
    'dgram',
    'readline',
    'react',
    'react-dom',
  ];
  if (skipList.includes(name)) return null;
  return 'try named imports to reduce size';
}

function getDecorationColor(packageInfo: PackageInfo | undefined) {
  const configuration = vscode.workspace.getConfiguration('importCost');
  const color = (dark: string, light: string) => ({
    dark: { after: { color: dark } },
    light: { after: { color: light } },
  });

  if (isOverBudget(packageInfo)) {
    return color(
      configuration.largePackageDarkColor,
      configuration.largePackageLightColor,
    );
  }

  const size =
    (configuration.bundleSizeColoring === 'minified'
      ? packageInfo?.size
      : packageInfo?.gzip) || 0;
  const sizeInKB = size / 1024;
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

function decoration(
  line: number,
  packageInfo: PackageInfo | undefined,
): vscode.DecorationOptions {
  const dec: vscode.DecorationOptions = {
    renderOptions: {
      ...getDecorationColor(packageInfo),
      ...getDecorationMessage(packageInfo),
    },
    range: new vscode.Range(
      new vscode.Position(line - 1, 1024),
      new vscode.Position(line - 1, 1024),
    ),
  };
  if (packageInfo && (packageInfo.size || 0) > 0) {
    dec.hoverMessage = buildHoverMessage(packageInfo);
  }
  return dec;
}

function buildHoverMessage(pkg: PackageInfo): vscode.MarkdownString {
  const size = fileSize(pkg.size!, { standard: 'jedec' });
  const gzip = fileSize(pkg.gzip!, { standard: 'jedec' });
  const gzipRatio = ((pkg.gzip! / pkg.size!) * 100).toFixed(0);
  const sizeKB = pkg.size! / 1024;

  const md = new vscode.MarkdownString();
  md.supportHtml = true;
  md.isTrusted = true;
  md.appendMarkdown(
    `**${pkg.name}**${pkg.version ? ` \`${pkg.version.split('@').pop()}\`` : ''}\n\n`,
  );
  md.appendMarkdown(`| Metric | Value |\n|---|---|\n`);
  md.appendMarkdown(`| Minified | ${size} |\n`);
  md.appendMarkdown(`| Gzipped | ${gzip} (${gzipRatio}% of minified) |\n`);
  if (pkg.brotli) {
    const brotli = fileSize(pkg.brotli, { standard: 'jedec' });
    const brotliRatio = ((pkg.brotli / pkg.size!) * 100).toFixed(0);
    md.appendMarkdown(`| Brotli | ${brotli} (${brotliRatio}% of minified) |\n`);
  }

  if (isOverBudget(pkg)) {
    const budget = vscode.workspace
      .getConfiguration('importCost')
      .get<number>('budgetKB', 0);
    md.appendMarkdown(`\n---\n`);
    md.appendMarkdown(
      `$(warning) **Over budget!** This import is ${fileSize(pkg.size!, { standard: 'jedec' })} — budget is ${budget} KB.\n`,
    );
  } else if (sizeKB > 100) {
    md.appendMarkdown(`\n---\n`);
    md.appendMarkdown(
      `*This is a large package. Consider if all imports are needed.*`,
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

function buildDecorationArray(fileName: string): vscode.DecorationOptions[] {
  if (!decorations[fileName]) return [];
  const arr: vscode.DecorationOptions[] = [];
  const { showCalculatingDecoration } =
    vscode.workspace.getConfiguration('importCost');
  Object.entries(decorations[fileName]).forEach(([line, packageInfo]) => {
    if (packageInfo.size === undefined && showCalculatingDecoration) {
      arr.push(decoration(Number(line), undefined));
    } else if ((packageInfo.size || 0) > 0) {
      arr.push(decoration(Number(line), packageInfo));
    }
  });
  return arr;
}

let decorationsDebounce: ReturnType<typeof setTimeout>;
function flushDecorationsDebounced(fileName: string): void {
  clearTimeout(decorationsDebounce);
  decorationsDebounce = setTimeout(() => applyDecorations(fileName), 10);
}

function applyDecorations(fileName: string): void {
  const arr = buildDecorationArray(fileName);
  if (activeEditor && activeEditor.document.fileName === fileName) {
    activeEditor.setDecorations(decorationType, arr);
  }
  vscode.window.visibleTextEditors
    .filter(
      editor =>
        editor !== activeEditor && editor.document.fileName === fileName,
    )
    .forEach(editor => {
      editor.setDecorations(decorationType, arr);
    });
}

export function onDidChangeActiveEditor(editor: vscode.TextEditor): void {
  activeEditor = editor;
  if (editor) {
    const fileName = editor.document.fileName;
    const arr = buildDecorationArray(fileName);
    editor.setDecorations(decorationType, arr);
  }
}

export function clearDecorations(): void {
  vscode.window.visibleTextEditors.forEach(textEditor => {
    textEditor.setDecorations(decorationType, []);
  });
}

export function hasDecorations(fileName: string): boolean {
  return !!(
    decorations[fileName] && Object.keys(decorations[fileName]).length > 0
  );
}

export function getDecorationsForFile(
  fileName: string,
): Record<number, PackageInfo> | undefined {
  return decorations[fileName];
}
