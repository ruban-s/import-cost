import { filesize } from 'filesize';
import type { PackageInfo } from 'import-cost';
import { importCost, Lang } from 'import-cost';
import * as vscode from 'vscode';

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

  const depNames = Object.keys(allDeps);
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
    if (line && (pkg.size || 0) > 0) {
      decorations[fileName][line] = pkg;
      applyDecorations(fileName);
    }
  });

  emitter.on('done', () => applyDecorations(fileName));
}

function getDecorationColor(size: number) {
  const configuration = vscode.workspace.getConfiguration('importCost');
  const sizeInKB = size / 1024;
  const color = (dark: string, light: string) => ({
    dark: { after: { color: dark } },
    light: { after: { color: light } },
  });
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

function applyDecorations(fileName: string): void {
  if (!decorations[fileName]) return;
  const configuration = vscode.workspace.getConfiguration('importCost');
  const arr: vscode.DecorationOptions[] = [];

  for (const [line, pkg] of Object.entries(decorations[fileName])) {
    const size = filesize(pkg.size!, { standard: 'jedec' });
    const gzip = filesize(pkg.gzip!, { standard: 'jedec' });

    let text: string;
    if (configuration.bundleSizeDecoration === 'minified') {
      text = `${size}`;
    } else if (
      configuration.bundleSizeDecoration === 'compressed' ||
      configuration.bundleSizeDecoration === 'gzipped'
    ) {
      text = `${gzip}`;
    } else {
      text = `${size} (gzipped: ${gzip})`;
    }

    arr.push({
      renderOptions: {
        ...getDecorationColor(pkg.size!),
        after: {
          contentText: `  ${text}`,
          margin: `0 0 0 ${configuration.margin || 1}rem`,
          fontStyle: configuration.fontStyle || 'normal',
        },
      },
      range: new vscode.Range(
        new vscode.Position(Number(line) - 1, 1024),
        new vscode.Position(Number(line) - 1, 1024),
      ),
    });
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
