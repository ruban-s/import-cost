const { window, workspace, commands } = require('vscode');
const { importCost, cleanup, clearSizeCache, Lang } = require('import-cost');
const {
  calculated,
  setDecorations,
  clearDecorations,
  onDidChangeActiveEditor,
  hasDecorations,
} = require('./decorator');
const {
  isPackageJson,
  processPackageJson,
  onEditorChange: onPackageJsonEditorChange,
  clearPackageJsonDecorations,
  hasPackageJsonDecorations,
} = require('./package-json-cost');
const statusbar = require('./statusbar');
const logger = require('./logger');

let isActive = true;
const emitters = {};

function activate(context) {
  try {
    logger.log('starting...');
    statusbar.init();

    context.subscriptions.push(
      workspace.onDidChangeTextDocument(ev => {
        if (isPackageJson(ev.document)) {
          processPackageJson(ev.document);
        } else {
          processActiveFile(ev.document);
        }
      }),
      window.onDidChangeActiveTextEditor(editor => {
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
      commands.registerCommand('importCost.toggle', () => {
        isActive = !isActive;
        if (isActive) {
          const doc = window.activeTextEditor?.document;
          if (isPackageJson(doc)) {
            processPackageJson(doc);
          } else {
            processActiveFile(doc);
          }
        } else {
          deactivate();
        }
      }),
      commands.registerCommand('importCost.clearCache', async () => {
        await clearSizeCache();
        clearDecorations();
        clearPackageJsonDecorations();
        window.showInformationMessage('Import Cost: Cache cleared. Sizes will be recalculated.');
        const doc = window.activeTextEditor?.document;
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
      const doc = window.activeTextEditor?.document;
      if (isPackageJson(doc)) {
        processPackageJson(doc);
      } else {
        processActiveFile(doc);
      }
    }, 200);
  } catch (e) {
    logger.log(`wrapping error: ${e}`);
  }
  return { logger };
}

function deactivate() {
  cleanup();
  logger.dispose();
  clearDecorations();
  clearPackageJsonDecorations();
  statusbar.dispose();
}

async function processActiveFile(document) {
  if (isActive && document && language(document)) {
    const { fileName } = document;
    emitters[fileName]?.removeAllListeners();

    const { timeout } = workspace.getConfiguration('importCost');
    const config = { concurrent: false, maxCallTime: timeout };
    const text = document.getText();
    const emitter = importCost(fileName, text, language(document), config);
    emitter.on('error', e => logger.log(`importCost error: ${e}`));
    emitter.on('start', packages => setDecorations(fileName, packages));
    emitter.on('calculated', packageInfo => calculated(fileName, packageInfo));
    emitter.on('done', packages => {
      setDecorations(fileName, packages);
      statusbar.setFileCost(fileName, packages);
    });
    emitter.on('log', log => logger.log(log));
    emitters[fileName] = emitter;
  }
}

function language({ fileName, languageId }) {
  if (languageId === 'Log') {
    return;
  }
  const configuration = workspace.getConfiguration('importCost');
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

module.exports = {
  activate,
  deactivate,
};
