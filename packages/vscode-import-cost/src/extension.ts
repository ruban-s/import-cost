import type { EventEmitter } from 'events';
import type { PackageInfo } from 'import-cost-core';
import {
  cleanup,
  clearSizeCache,
  importCost,
  Lang,
  setCacheDir,
} from 'import-cost-core';
import * as vscode from 'vscode';
import { ImportCostCodeActionProvider } from './code-actions';
import {
  calculated,
  clearDecorations,
  clearDecorationsForFile,
  getAllDecorations,
  getDecorationsForFile,
  hasDecorations,
  onDidChangeActiveEditor,
  refreshDecorationsForFile,
  setDecorations,
  setWorkspaceIndex as setDecoratorIndex,
} from './decorator';
import * as diagnostics from './diagnostics';
import { documentPath, ignorePatternsFor } from './document';
import {
  clearDuplicateDiagnostics,
  disposeDuplicates,
  updateDuplicateDiagnostics,
} from './duplicate-detector';
import logger from './logger';
import { showOptimizationReport } from './optimization-report';
import {
  clearPackageJsonDecorations,
  forgetPackageJson,
  hasPackageJsonDecorations,
  isPackageJson,
  onEditorChange as onPackageJsonEditorChange,
  processPackageJson,
  setPackageJsonEnabled,
} from './package-json-cost';
import * as statusbar from './statusbar';
import { WorkspaceImportIndex } from './workspace-index';

const SUPPORTED_LANGUAGES = [
  'javascript',
  'javascriptreact',
  'typescript',
  'typescriptreact',
  'vue',
  'svelte',
];

let isActive = true;
let workspaceIndex: WorkspaceImportIndex | null = null;
const emitters: Record<string, EventEmitter> = {};
const processTimers: Record<string, ReturnType<typeof setTimeout>> = {};
const previousImports: Record<string, Set<string>> = {};

function detach(emitter?: EventEmitter): void {
  emitter?.removeAllListeners();
  emitter?.on('error', (e: Error) => logger.log(`importCost error: ${e}`));
}

function scheduleProcessActiveFile(document: vscode.TextDocument): void {
  const fileName = documentPath(document);
  if (!fileName) return;
  clearTimeout(processTimers[fileName]);
  processTimers[fileName] = setTimeout(() => {
    delete processTimers[fileName];
    processActiveFile(document);
  }, 150);
}

function cleanupFile(document: vscode.TextDocument): void {
  const fileName = documentPath(document);
  if (!fileName) return;
  detach(emitters[fileName]);
  delete emitters[fileName];
  clearTimeout(processTimers[fileName]);
  delete processTimers[fileName];
  delete previousImports[fileName];
  clearDecorationsForFile(fileName);
  forgetPackageJson(fileName);
  diagnostics.clearDiagnosticsForFile(document.uri);
  statusbar.clearFileCost(fileName);
}

function processDocument(document?: vscode.TextDocument): void {
  if (!isActive || !document) return;
  if (isPackageJson(document)) {
    processPackageJson(document);
  } else {
    processActiveFile(document);
  }
}

function refreshDuplicates(): void {
  if (isActive && workspaceIndex?.isReady) {
    updateDuplicateDiagnostics(workspaceIndex);
  }
}

function setActive(on: boolean): void {
  isActive = on;
  statusbar.setEnabled(on);
  setPackageJsonEnabled(on);
  if (on) {
    refreshDuplicates();
    for (const editor of vscode.window.visibleTextEditors) {
      processDocument(editor.document);
    }
    return;
  }
  Object.values(emitters).forEach(detach);
  clearDecorations();
  diagnostics.clearDiagnostics();
  clearDuplicateDiagnostics();
}

export async function activate(context: vscode.ExtensionContext) {
  try {
    logger.log('starting...');
    statusbar.init();

    try {
      await vscode.workspace.fs.createDirectory(context.globalStorageUri);
      setCacheDir(context.globalStorageUri.fsPath);
    } catch (e) {
      logger.log(`cache dir unavailable, using tmp: ${e}`);
    }

    const configuration = vscode.workspace.getConfiguration('importCost');
    if (configuration.get('workspaceAwareness', true)) {
      workspaceIndex = new WorkspaceImportIndex();
      setDecoratorIndex(workspaceIndex);
      statusbar.setWorkspaceIndex(workspaceIndex);
      context.subscriptions.push(workspaceIndex);

      workspaceIndex.onDidUpdate(() => {
        if (!isActive) return;
        const doc = vscode.window.activeTextEditor?.document;
        const fileName = doc && documentPath(doc);
        if (
          doc &&
          fileName &&
          !isPackageJson(doc) &&
          hasDecorations(fileName)
        ) {
          refreshDecorationsForFile(fileName);
          const decs = getDecorationsForFile(fileName);
          if (decs) {
            const pkgs = Object.values(decs).filter(p => (p.size || 0) > 0);
            statusbar.setFileCost(fileName, pkgs);
          }
        }
        refreshDuplicates();
      });

      if (vscode.workspace.workspaceFolders) {
        workspaceIndex.init(vscode.workspace.workspaceFolders);
      }
    }

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
        if (!isActive) return;
        if (isPackageJson(ev.document)) {
          processPackageJson(ev.document);
        } else {
          scheduleProcessActiveFile(ev.document);
        }
      }),
      vscode.workspace.onDidCloseTextDocument(cleanupFile),
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        if (workspaceIndex && vscode.workspace.workspaceFolders) {
          workspaceIndex.init(vscode.workspace.workspaceFolders);
        }
      }),
      vscode.workspace.onDidChangeConfiguration(ev => {
        if (ev.affectsConfiguration('importCost.duplicateDetection')) {
          clearDuplicateDiagnostics();
          refreshDuplicates();
        }
      }),
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (!editor?.document) return;
        const fileName = documentPath(editor.document);
        if (!isActive || !fileName) {
          statusbar.onEditorChange(null);
          return;
        }
        if (isPackageJson(editor.document)) {
          onPackageJsonEditorChange(editor);
          statusbar.onEditorChange(null);
          if (!hasPackageJsonDecorations(fileName)) {
            processPackageJson(editor.document);
          }
        } else {
          onDidChangeActiveEditor(editor);
          statusbar.onEditorChange(fileName);
          if (!hasDecorations(fileName)) {
            processActiveFile(editor.document);
          }
        }
      }),
      vscode.commands.registerCommand('importCost.toggle', () =>
        setActive(!isActive),
      ),
      vscode.commands.registerCommand('importCost.optimizationReport', () => {
        const idx = workspaceIndex;
        if (idx) {
          idx.ensureInitialized().then(() => {
            showOptimizationReport(idx, getAllDecorations);
          });
        } else {
          vscode.window.showInformationMessage(
            'Import Cost: Enable workspaceAwareness to use the optimization report.',
          );
        }
      }),
      vscode.commands.registerCommand('importCost.clearCache', async () => {
        await clearSizeCache();
        clearDecorations();
        clearPackageJsonDecorations();
        vscode.window.showInformationMessage(
          'Import Cost: Cache cleared. Sizes will be recalculated.',
        );
        processDocument(vscode.window.activeTextEditor?.document);
      }),
    );
    processDocument(vscode.window.activeTextEditor?.document);
  } catch (e) {
    logger.log(`wrapping error: ${e}`);
  }
  return { logger };
}

export function deactivate(): void {
  Object.values(emitters).forEach(detach);
  void cleanup();
  logger.dispose();
  clearDecorations();
  clearPackageJsonDecorations();
  diagnostics.dispose();
  disposeDuplicates();
  statusbar.dispose();
  workspaceIndex?.dispose();
  workspaceIndex = null;
  setDecoratorIndex(null);
  statusbar.setWorkspaceIndex(null);
}

function processActiveFile(document: vscode.TextDocument): void {
  const fileName = documentPath(document);
  const lang = language(document);
  if (!isActive || !fileName || !lang) return;

  detach(emitters[fileName]);

  const configuration = vscode.workspace.getConfiguration('importCost');
  const text = document.getText();
  const emitter = importCost(fileName, text, lang, {
    maxCallTime: configuration.get<number>('timeout', 20000),
    ignore: ignorePatternsFor(document),
  });
  const on = <T>(event: string, listener: (value: T) => void) =>
    emitter.on(event, (value: T) => {
      if (isActive) listener(value);
    });
  emitter.on('error', (e: Error) => logger.log(`importCost error: ${e}`));
  emitter.on('log', (log: string) => logger.log(log));
  on<PackageInfo[]>('start', packages => {
    const currentNames = new Set(packages.map(p => `${p.name}@${p.line}`));
    const prev = previousImports[fileName];

    if (prev) {
      const unchanged = packages.filter(p => prev.has(`${p.name}@${p.line}`));
      setDecorations(fileName, packages, unchanged);
    } else {
      setDecorations(fileName, packages);
    }
    previousImports[fileName] = currentNames;
  });
  on<PackageInfo>('calculated', packageInfo =>
    calculated(fileName, packageInfo),
  );
  on<PackageInfo[]>('done', packages => {
    setDecorations(fileName, packages);
    statusbar.setFileCost(fileName, packages);
    diagnostics.updateDiagnostics(document.uri, packages);
    void workspaceIndex?.updateFile(fileName, text, lang);
  });
  emitters[fileName] = emitter;
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
