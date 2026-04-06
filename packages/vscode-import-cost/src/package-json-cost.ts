import { filesize } from 'filesize';
import type { PackageInfo } from 'import-cost';
import { importCost, Lang } from 'import-cost';
import * as vscode from 'vscode';
import { ALTERNATIVES } from './alternatives';

const decorationType = vscode.window.createTextEditorDecorationType({});
const decorations: Record<string, Record<number, PackageInfo>> = {};
let activeEditor: vscode.TextEditor | null = null;

export function isPackageJson(document?: vscode.TextDocument): boolean {
  return !!document?.fileName?.endsWith('package.json');
}

export function processPackageJson(document: vscode.TextDocument): void {
  if (!isPackageJson(document)) return;

  const fileName = document.fileName;
  const text = document.getText();
  const lines = text.split('\n');

  let pkgJson: Record<string, any>;
  try {
    pkgJson = JSON.parse(text);
  } catch {
    return;
  }

  const allDeps: Record<string, string> = {
    ...(pkgJson.dependencies || {}),
    ...(pkgJson.devDependencies || {}),
  };

  const depNames = Object.keys(allDeps).filter(
    name => !name.startsWith('@types/'),
  );
  if (depNames.length === 0) return;

  const depLines: Record<string, number> = {};
  for (const name of depNames) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(`"${name}"`)) {
        depLines[name] = i + 1;
        break;
      }
    }
  }

  const importStatements = depNames
    .map(
      name =>
        `import * as _${name.replace(/[^a-zA-Z0-9]/g, '_')} from '${name}';`,
    )
    .join('\n');

  const { timeout } = vscode.workspace.getConfiguration('importCost');
  const config = { concurrent: false, maxCallTime: timeout || 20000 };

  const emitter = importCost(
    fileName,
    importStatements,
    Lang.JAVASCRIPT,
    config,
  );

  decorations[fileName] = {};

  emitter.on('calculated', (pkg: PackageInfo) => {
    const line = depLines[pkg.name];
    if (line) {
      decorations[fileName][line] = pkg;
      applyDecorations(fileName);
    }
  });

  emitter.on('done', () => applyDecorations(fileName));
}

function isOverBudget(pkg: PackageInfo): boolean {
  if (!pkg.size) return false;
  const budget = vscode.workspace
    .getConfiguration('importCost')
    .get<number>('budgetKB', 0);
  return budget > 0 && pkg.size / 1024 > budget;
}

function getDecorationColor(pkg: PackageInfo) {
  const configuration = vscode.workspace.getConfiguration('importCost');
  const sizeInKB = (pkg.size || 0) / 1024;
  const color = (dark: string, light: string) => ({
    dark: { after: { color: dark } },
    light: { after: { color: light } },
  });

  if (pkg.error || !pkg.size) {
    return color('#888888', '#999999');
  }

  if (isOverBudget(pkg)) {
    return color(
      configuration.largePackageDarkColor || '#d44e40',
      configuration.largePackageLightColor || '#d44e40',
    );
  }

  if (sizeInKB < (configuration.smallPackageSize || 50)) {
    return color(
      configuration.smallPackageDarkColor || '#7cc36e',
      configuration.smallPackageLightColor || '#7cc36e',
    );
  } else if (sizeInKB < (configuration.mediumPackageSize || 100)) {
    return color(
      configuration.mediumPackageDarkColor || '#7cc36e',
      configuration.mediumPackageLightColor || '#7cc36e',
    );
  } else {
    return color(
      configuration.largePackageDarkColor || '#d44e40',
      configuration.largePackageLightColor || '#d44e40',
    );
  }
}

function buildLabel(pkg: PackageInfo): string {
  if (pkg.error || !pkg.size) {
    return '$(circle-slash) bundle failed';
  }

  const configuration = vscode.workspace.getConfiguration('importCost');
  const size = filesize(pkg.size, { standard: 'jedec' });
  const gzip = filesize(pkg.gzip!, { standard: 'jedec' });
  const brotli = pkg.brotli
    ? filesize(pkg.brotli, { standard: 'jedec' })
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
    label = `$(warning) ${label} — over budget!`;
  }

  return label;
}

function buildHoverMessage(pkg: PackageInfo): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.supportHtml = true;
  md.isTrusted = true;
  md.appendMarkdown(`**${pkg.name}**\n\n`);

  if (pkg.error || !pkg.size) {
    md.appendMarkdown(
      `*Bundle failed — this package may require native binaries, code generation, or has unresolvable dependencies.*\n`,
    );
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

  const size = filesize(pkg.size, { standard: 'jedec' });
  const gzip = filesize(pkg.gzip!, { standard: 'jedec' });
  const gzipRatio = ((pkg.gzip! / pkg.size) * 100).toFixed(0);

  md.appendMarkdown(`| Metric | Value |\n|---|---|\n`);
  md.appendMarkdown(`| Minified | ${size} |\n`);
  md.appendMarkdown(`| Gzipped | ${gzip} (${gzipRatio}% of minified) |\n`);
  if (pkg.brotli) {
    const brotli = filesize(pkg.brotli, { standard: 'jedec' });
    const brotliRatio = ((pkg.brotli / pkg.size!) * 100).toFixed(0);
    md.appendMarkdown(`| Brotli | ${brotli} (${brotliRatio}% of minified) |\n`);
  }

  if (isOverBudget(pkg)) {
    const budget = vscode.workspace
      .getConfiguration('importCost')
      .get<number>('budgetKB', 0);
    md.appendMarkdown(`\n---\n`);
    md.appendMarkdown(
      `$(warning) **Over budget!** This package is ${size} — budget is ${budget} KB.\n`,
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

function applyDecorations(fileName: string): void {
  if (!decorations[fileName]) return;
  const configuration = vscode.workspace.getConfiguration('importCost');
  const arr: vscode.DecorationOptions[] = [];

  for (const [line, pkg] of Object.entries(decorations[fileName])) {
    const dec: vscode.DecorationOptions = {
      renderOptions: {
        ...getDecorationColor(pkg),
        after: {
          contentText: `  ${buildLabel(pkg)}`,
          margin: `0 0 0 ${configuration.margin || 1}rem`,
          fontStyle: configuration.fontStyle || 'normal',
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

  if (activeEditor && activeEditor.document.fileName === fileName) {
    activeEditor.setDecorations(decorationType, arr);
  }
}

export function onEditorChange(editor: vscode.TextEditor): void {
  activeEditor = editor;
  if (editor && isPackageJson(editor.document)) {
    applyDecorations(editor.document.fileName);
  }
}

export function clearPackageJsonDecorations(): void {
  if (activeEditor) {
    activeEditor.setDecorations(decorationType, []);
  }
}

export function hasPackageJsonDecorations(fileName: string): boolean {
  return !!(
    decorations[fileName] && Object.keys(decorations[fileName]).length > 0
  );
}
