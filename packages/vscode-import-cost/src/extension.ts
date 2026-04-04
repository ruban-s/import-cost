import type { EventEmitter } from 'events';
import type { PackageInfo } from 'import-cost';
import { cleanup, clearSizeCache, importCost, Lang } from 'import-cost';
import * as vscode from 'vscode';
import {
  calculated,
  clearDecorations,
  hasDecorations,
  onDidChangeActiveEditor,
  setDecorations,
} from './decorator';
import logger from './logger';
import {
  clearPackageJsonDecorations,
  hasPackageJsonDecorations,
  isPackageJson,
  onEditorChange as onPackageJsonEditorChange,
  processPackageJson,
} from './package-json-cost';
import * as statusbar from './statusbar';

let isActive = true;
const emitters: Record<string, EventEmitter> = {};

export function activate(context: vscode.ExtensionContext) {
  try {
    logger.log('starting...');
    statusbar.init();

    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument(ev => {
        if (isPackageJson(ev.document)) {
          processPackageJson(ev.document);
        } else {
          processActiveFile(ev.document);
        }
      }),
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (!editor?.document) return;
        if (isPackageJson(editor.document)) {
          onPackageJsonEditorChange(editor);
          statusbar.onEditorChange(null);
          if (!hasPackageJsonDecorations(editor.document.fileName)) {
            processPackageJson(editor.document);
          }
        } else {
          onDidChangeActiveEditor(editor);
          statusbar.onEditorChange(editor.document.fileName);
          if (!hasDecorations(editor.document.fileName)) {
            setTimeout(() => processActiveFile(editor.document), 100);
          }
        }
      }),
      vscode.commands.registerCommand('importCost.toggle', () => {
        isActive = !isActive;
        if (isActive) {
          const doc = vscode.window.activeTextEditor?.document;
          if (isPackageJson(doc)) {
            processPackageJson(doc!);
          } else {
            processActiveFile(doc);
          }
        } else {
          deactivate();
        }
      }),
      vscode.commands.registerCommand('importCost.clearCache', async () => {
        await clearSizeCache();
        clearDecorations();
        clearPackageJsonDecorations();
        vscode.window.showInformationMessage(
          'Import Cost: Cache cleared. Sizes will be recalculated.',
        );
        const doc = vscode.window.activeTextEditor?.document;
        if (doc) {
          if (isPackageJson(doc)) {
            processPackageJson(doc);
          } else {
            processActiveFile(doc);
          }
        }
      }),
    );
    setTimeout(() => {
      const doc = vscode.window.activeTextEditor?.document;
      if (isPackageJson(doc)) {
        processPackageJson(doc!);
      } else {
        processActiveFile(doc);
      }
    }, 200);
  } catch (e) {
    logger.log(`wrapping error: ${e}`);
  }
  return { logger };
}

export function deactivate(): void {
  cleanup();
  logger.dispose();
  clearDecorations();
  clearPackageJsonDecorations();
  statusbar.dispose();
}

async function processActiveFile(
  document?: vscode.TextDocument,
): Promise<void> {
  if (isActive && document && language(document)) {
    const { fileName } = document;
    emitters[fileName]?.removeAllListeners();

    const configuration = vscode.workspace.getConfiguration('importCost');
    const config = { concurrent: false, maxCallTime: configuration.timeout };
    const ignored: string[] = configuration.ignoredPackages || [];
    const text = document.getText();
    const emitter = importCost(fileName, text, language(document)!, config);
    emitter.on('error', (e: Error) => logger.log(`importCost error: ${e}`));
    emitter.on('start', (packages: PackageInfo[]) => {
      setDecorations(fileName, filterIgnored(packages, ignored));
    });
    emitter.on('calculated', (packageInfo: PackageInfo) => {
      if (!ignored.includes(packageInfo.name)) {
        calculated(fileName, packageInfo);
      }
    });
    emitter.on('done', (packages: PackageInfo[]) => {
      const filtered = filterIgnored(packages, ignored);
      setDecorations(fileName, filtered);
      statusbar.setFileCost(fileName, filtered);
    });
    emitter.on('log', (log: string) => logger.log(log));
    emitters[fileName] = emitter;
  }
}

type LangValue = (typeof Lang)[keyof typeof Lang];

function language({
  fileName,
  languageId,
}: vscode.TextDocument): LangValue | undefined {
  if (languageId === 'Log') {
    return;
  }
  const configuration = vscode.workspace.getConfiguration('importCost');
  const typescriptRegex = new RegExp(
    configuration.typescriptExtensions.join('|'),
  );
  const javascriptRegex = new RegExp(
    configuration.javascriptExtensions.join('|'),
  );
  const vueRegex = new RegExp(configuration.vueExtensions.join('|'));
  const svelteRegex = new RegExp(configuration.svelteExtensions.join('|'));
  if (languageId === 'svelte' || svelteRegex.test(fileName)) {
    return Lang.SVELTE;
  } else if (languageId === 'vue' || vueRegex.test(fileName)) {
    return Lang.VUE;
  } else if (
    languageId === 'typescript' ||
    languageId === 'typescriptreact' ||
    typescriptRegex.test(fileName)
  ) {
    return Lang.TYPESCRIPT;
  } else if (
    languageId === 'javascript' ||
    languageId === 'javascriptreact' ||
    javascriptRegex.test(fileName)
  ) {
    return Lang.JAVASCRIPT;
  } else {
    return undefined;
  }
}

function filterIgnored(
  packages: PackageInfo[],
  ignored: string[],
): PackageInfo[] {
  return packages.filter(p => !ignored.includes(p.name));
}
