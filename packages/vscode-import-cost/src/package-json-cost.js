const { window, workspace, Range, Position } = require('vscode');
const { importCost, Lang } = require('import-cost');
const { filesize } = require('filesize');

const decorationType = window.createTextEditorDecorationType({});
const decorations = {};
let activeEditor = null;

function isPackageJson(document) {
  return document?.fileName?.endsWith('package.json');
}

function processPackageJson(document) {
  if (!isPackageJson(document)) return;

  const fileName = document.fileName;
  const text = document.getText();
  const lines = text.split('\n');

  let pkgJson;
  try {
    pkgJson = JSON.parse(text);
  } catch {
    return;
  }

  const allDeps = {
    ...(pkgJson.dependencies || {}),
    ...(pkgJson.devDependencies || {}),
  };

  const depNames = Object.keys(allDeps);
  if (depNames.length === 0) return;

  // Build import statements for all deps and find their lines
  const depLines = {};
  for (const name of depNames) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(`"${name}"`)) {
        depLines[name] = i + 1; // 1-based
        break;
      }
    }
  }

  // Create a fake JS file with all imports to calculate sizes
  const importStatements = depNames
    .map(name => `import * as _${name.replace(/[^a-zA-Z0-9]/g, '_')} from '${name}';`)
    .join('\n');

  const { timeout } = workspace.getConfiguration('importCost');
  const config = { concurrent: false, maxCallTime: timeout || 20000 };

  const emitter = importCost(fileName, importStatements, Lang.JAVASCRIPT, config);

  decorations[fileName] = {};

  emitter.on('calculated', pkg => {
    const line = depLines[pkg.name];
    if (line && pkg.size > 0) {
      decorations[fileName][line] = pkg;
      applyDecorations(fileName);
    }
  });

  emitter.on('done', () => applyDecorations(fileName));
}

function getDecorationColor(size) {
  const configuration = workspace.getConfiguration('importCost');
  const sizeInKB = size / 1024;
  const color = (dark, light) => ({
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

function applyDecorations(fileName) {
  if (!decorations[fileName]) return;
  const configuration = workspace.getConfiguration('importCost');
  const arr = [];

  for (const [line, pkg] of Object.entries(decorations[fileName])) {
    const size = filesize(pkg.size, { standard: 'jedec' });
    const gzip = filesize(pkg.gzip, { standard: 'jedec' });

    let text;
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
        ...getDecorationColor(pkg.size),
        after: {
          contentText: `  ${text}`,
          margin: `0 0 0 ${configuration.margin || 1}rem`,
          fontStyle: configuration.fontStyle || 'normal',
        },
      },
      range: new Range(
        new Position(line - 1, 1024),
        new Position(line - 1, 1024),
      ),
    });
  }

  if (activeEditor && activeEditor.document.fileName === fileName) {
    activeEditor.setDecorations(decorationType, arr);
  }
}

function onEditorChange(editor) {
  activeEditor = editor;
  if (editor && isPackageJson(editor.document)) {
    applyDecorations(editor.document.fileName);
  }
}

function clearPackageJsonDecorations() {
  if (activeEditor) {
    activeEditor.setDecorations(decorationType, []);
  }
}

function hasPackageJsonDecorations(fileName) {
  return decorations[fileName] && Object.keys(decorations[fileName]).length > 0;
}

module.exports = {
  isPackageJson,
  processPackageJson,
  onEditorChange,
  clearPackageJsonDecorations,
  hasPackageJsonDecorations,
};
