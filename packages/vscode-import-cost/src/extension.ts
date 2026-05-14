import type { EventEmitter } from 'events';
import type { PackageInfo } from 'import-cost-core';
import {
  cleanup,
  clearSizeCache,
  importCost,
  isIgnored,
  Lang,
  loadIgnoreFile,
} from 'import-cost-core';
import * as vscode from 'vscode';
import { ImportCostCodeActionProvider } from './code-actions';
import {
  calculated,
  clearDecorations,
  clearDecorationsForFile,
  hasDecorations,
  onDidChangeActiveEditor,
  setDecorations,
} from './decorator';
import * as diagnostics from './diagnostics';
import logger from './logger';
import {
  clearPackageJsonDecorations,
  hasPackageJsonDecorations,
  isPackageJson,
  onEditorChange as onPackageJsonEditorChange,
  processPackageJson,
} from './package-json-cost';
import * as statusbar from './statusbar';

const SUPPORTED_LANGUAGES = [
  'javascript',
  'javascriptreact',
  'typescript',
  'typescriptreact',
  'vue',
  'svelte',
];

let isActive = true;
const emitters: Record<string, EventEmitter> = {};
const processTimers: Record<string, ReturnType<typeof setTimeout>> = {};
const previousImports: Record<string, Set<string>> = {};

function scheduleProcessActiveFile(document: vscode.TextDocument): void {
  const { fileName } = document;
  clearTimeout(processTimers[fileName]);
  processTimers[fileName] = setTimeout(() => {
    delete processTimers[fileName];
    processActiveFile(document);
  }, 150);
}

function cleanupFile(fileName: string): void {
  emitters[fileName]?.removeAllListeners();
  delete emitters[fileName];
  clearTimeout(processTimers[fileName]);
  delete processTimers[fileName];
  delete previousImports[fileName];
  clearDecorationsForFile(fileName);
  diagnostics.clearDiagnosticsForFile(fileName);
  statusbar.clearFileCost(fileName);
}

export function activate(context: vscode.ExtensionContext) {
  try {
    logger.log('starting...');
    statusbar.init();

    const selector = SUPPORTED_LANGUAGES.map(lang => ({ language: lang }));
    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(
        selector,
        new ImportCostCodeActionProvider(),
        {
          providedCodeActionKinds:
            ImportCostCodeActionProvider.providedCodeActionKinds,
        },
      ),
      vscode.commands.registerCommand(
        'importCost.showAlternative',
        (name: string, alt: string, reason: string) => {
          vscode.window.showInformationMessage(
            `Consider replacing "${name}" with ${alt}. ${reason}`,
          );
        },
      ),
      vscode.workspace.onDidChangeTextDocument(ev => {
        if (isPackageJson(ev.document)) {
          processPackageJson(ev.document);
        } else {
          scheduleProcessActiveFile(ev.document);
        }
      }),
      vscode.workspace.onDidCloseTextDocument(document => {
        cleanupFile(document.fileName);
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
            processActiveFile(editor.document);
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
    const doc = vscode.window.activeTextEditor?.document;
    if (isPackageJson(doc)) {
      processPackageJson(doc!);
    } else {
      processActiveFile(doc);
    }
  } catch (e) {
    logger.log(`wrapping error: ${e}`);
  }
  return { logger };
}

export function deactivate(): void {
  for (const fileName of Object.keys(emitters)) {
    cleanupFile(fileName);
  }
  cleanup();
  logger.dispose();
  clearDecorations();
  clearPackageJsonDecorations();
  diagnostics.clearDiagnostics();
  diagnostics.dispose();
  statusbar.dispose();
}

async function processActiveFile(
  document?: vscode.TextDocument,
): Promise<void> {
  if (isActive && document && language(document)) {
    const { fileName } = document;
    emitters[fileName]?.removeAllListeners();

    const configuration = vscode.workspace.getConfiguration('importCost');
    const config = {
      concurrent: true,
      maxCallTime: configuration.timeout,
      debounceDelay: 0,
    };
    const settingsIgnored: string[] = configuration.ignoredPackages || [];
    const workspaceRoot =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const fileIgnored = workspaceRoot ? loadIgnoreFile(workspaceRoot) : [];
    const ignorePatterns = [...settingsIgnored, ...fileIgnored];
    const text = document.getText();
    const emitter = importCost(fileName, text, language(document)!, config);
    emitter.on('error', (e: Error) => logger.log(`importCost error: ${e}`));
    emitter.on('start', (packages: PackageInfo[]) => {
      const filtered = filterIgnored(packages, ignorePatterns);
      const currentNames = new Set(filtered.map(p => `${p.name}@${p.line}`));
      const prev = previousImports[fileName];

      if (prev) {
        const unchanged = filtered.filter(p => prev.has(`${p.name}@${p.line}`));
        setDecorations(fileName, filtered, unchanged);
      } else {
        setDecorations(fileName, filtered);
      }
      previousImports[fileName] = currentNames;
    });
    emitter.on('calculated', (packageInfo: PackageInfo) => {
      if (!isIgnored(packageInfo.name, ignorePatterns)) {
        calculated(fileName, packageInfo);
      }
    });
    emitter.on('done', (packages: PackageInfo[]) => {
      const filtered = filterIgnored(packages, ignorePatterns);
      setDecorations(fileName, filtered);
      statusbar.setFileCost(fileName, filtered);
      diagnostics.updateDiagnostics(fileName, filtered);
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
  patterns: string[],
): PackageInfo[] {
  if (patterns.length === 0) return packages;
  return packages.filter(p => !isIgnored(p.name, patterns));
}
