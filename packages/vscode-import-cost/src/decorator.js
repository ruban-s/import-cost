const { workspace, window, Range, Position } = require('vscode');
const { filesize: fileSize } = require('filesize');
const logger = require('./logger');

const decorations = {};
const decorationType = window.createTextEditorDecorationType({});
let activeEditor = window.activeTextEditor;

function setDecorations(fileName, packages) {
  decorations[fileName] = {};
  packages.forEach(packageInfo => decorate(fileName, packageInfo));
  flushDecorationsDebounced(fileName);
}

function decorate(fileName, packageInfo) {
  const { line } = packageInfo;
  decorations[fileName][line] = packageInfo;
}

function calculated(fileName, packageInfo) {
  if (packageInfo.error) {
    logger.log(
      `Error Calculated: ${JSON.stringify({ ...packageInfo, error: true })}`,
    );
    if (Array.isArray(packageInfo.error)) {
      packageInfo.error.forEach(err => {
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

function getDecorationMessage(packageInfo) {
  const configuration = workspace.getConfiguration('importCost');
  const text = s => ({
    after: {
      contentText: s,
      margin: `0 0 0 ${configuration.margin}rem`,
      fontStyle: configuration.fontStyle,
    },
  });
  if (!packageInfo) {
    return text('Calculating...');
  }
  const size = fileSize(packageInfo.size, { standard: 'jedec' });
  const gzip = fileSize(packageInfo.gzip, { standard: 'jedec' });
  if (configuration.bundleSizeDecoration === 'minified') {
    return text(`${size}`);
  } else if (configuration.bundleSizeDecoration === 'gzipped') {
    return text(`${gzip}`);
  } else if (configuration.bundleSizeDecoration === 'compressed') {
    return text(`${gzip}`);
  } else {
    return text(`${size} (gzipped: ${gzip})`);
  }
}

function getDecorationColor(packageInfo) {
  const configuration = workspace.getConfiguration('importCost');
  const color = (old, dark, light) => ({
    dark: { after: { color: old || dark } },
    light: { after: { color: old || light } },
  });
  const size =
    (configuration.bundleSizeColoring === 'minified'
      ? packageInfo?.size
      : packageInfo?.gzip) || 0;
  const sizeInKB = size / 1024;
  if (sizeInKB < configuration.smallPackageSize) {
    return color(
      configuration.smallPackageColor,
      configuration.smallPackageDarkColor,
      configuration.smallPackageLightColor,
    );
  } else if (sizeInKB < configuration.mediumPackageSize) {
    return color(
      configuration.mediumPackageColor,
      configuration.mediumPackageDarkColor,
      configuration.mediumPackageLightColor,
    );
  } else {
    return color(
      configuration.largePackageColor,
      configuration.largePackageDarkColor,
      configuration.largePackageLightColor,
    );
  }
}

function decoration(line, packageInfo) {
  return {
    renderOptions: {
      ...getDecorationColor(packageInfo),
      ...getDecorationMessage(packageInfo),
    },
    range: new Range(
      new Position(line - 1, 1024),
      new Position(line - 1, 1024),
    ),
  };
}

function buildDecorationArray(fileName) {
  if (!decorations[fileName]) return [];
  const arr = [];
  const { showCalculatingDecoration } =
    workspace.getConfiguration('importCost');
  Object.entries(decorations[fileName]).forEach(([line, packageInfo]) => {
    if (packageInfo.size === undefined && showCalculatingDecoration) {
      arr.push(decoration(line, undefined));
    } else if (packageInfo.size > 0) {
      arr.push(decoration(line, packageInfo));
    }
  });
  return arr;
}

let decorationsDebounce;
function flushDecorationsDebounced(fileName) {
  clearTimeout(decorationsDebounce);
  decorationsDebounce = setTimeout(() => applyDecorations(fileName), 10);
}

function applyDecorations(fileName) {
  const arr = buildDecorationArray(fileName);
  if (activeEditor && activeEditor.document.fileName === fileName) {
    activeEditor.setDecorations(decorationType, arr);
  }
  // Also apply to any other visible editors showing this file (e.g. split view)
  window.visibleTextEditors
    .filter(
      editor =>
        editor !== activeEditor &&
        editor.document.fileName === fileName,
    )
    .forEach(editor => {
      editor.setDecorations(decorationType, arr);
    });
}

function onDidChangeActiveEditor(editor) {
  activeEditor = editor;
  if (editor) {
    const fileName = editor.document.fileName;
    const arr = buildDecorationArray(fileName);
    editor.setDecorations(decorationType, arr);
  }
}

function clearDecorations() {
  window.visibleTextEditors.forEach(textEditor => {
    textEditor.setDecorations(decorationType, []);
  });
}

function hasDecorations(fileName) {
  return decorations[fileName] && Object.keys(decorations[fileName]).length > 0;
}

module.exports = {
  setDecorations,
  calculated,
  clearDecorations,
  onDidChangeActiveEditor,
  hasDecorations,
};
