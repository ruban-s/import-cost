const { window, workspace, commands } = require('vscode');
const { importCost, cleanup, Lang } = require('import-cost');
const {
  calculated,
  setDecorations,
  clearDecorations,
  onDidChangeActiveEditor,
} = require('./decorator');
const logger = require('./logger');

let isActive = true;
const emitters = {};
const processedFiles = new Set();

function activate(context) {
  try {
    logger.log('starting...');
    context.subscriptions.push(
      workspace.onDidChangeTextDocument(ev => {
        processedFiles.delete(ev.document.fileName);
        processActiveFile(ev.document);
      }),
      window.onDidChangeActiveTextEditor(editor => {
        // Update the decorator's active editor reference and re-apply cached decorations
        onDidChangeActiveEditor(editor);
        if (editor?.document && !processedFiles.has(editor.document.fileName)) {
          processActiveFile(editor.document);
        }
      }),
      commands.registerCommand('importCost.toggle', () => {
        isActive = !isActive;
        if (isActive) {
          processActiveFile(window.activeTextEditor?.document);
        } else {
          deactivate();
        }
      }),
    );
    processActiveFile(window.activeTextEditor?.document);
  } catch (e) {
    logger.log(`wrapping error: ${e}`);
  }
  return { logger };
}

function deactivate() {
  cleanup();
  logger.dispose();
  clearDecorations();
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
      processedFiles.add(fileName);
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
