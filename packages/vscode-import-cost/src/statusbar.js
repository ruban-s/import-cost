const { window, StatusBarAlignment } = require('vscode');
const { filesize } = require('filesize');

let statusBarItem;
const fileTotals = {};

function init() {
  statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right, 100);
  statusBarItem.command = 'importCost.toggle';
  statusBarItem.show();
  update(null);
}

function setFileCost(fileName, packages) {
  const total = packages.reduce((sum, pkg) => sum + (pkg.size || 0), 0);
  const gzip = packages.reduce((sum, pkg) => sum + (pkg.gzip || 0), 0);
  const count = packages.filter(pkg => pkg.size > 0).length;
  fileTotals[fileName] = { total, gzip, count };
  if (window.activeTextEditor?.document.fileName === fileName) {
    update(fileName);
  }
}

function update(fileName) {
  if (!statusBarItem) return;
  if (!fileName || !fileTotals[fileName]) {
    statusBarItem.text = '$(package) Import Cost';
    statusBarItem.tooltip = 'No imports calculated';
    return;
  }
  const { total, gzip, count } = fileTotals[fileName];
  if (total === 0) {
    statusBarItem.text = '$(package) No imports';
    statusBarItem.tooltip = 'No third-party imports found';
    return;
  }
  const sizeStr = filesize(total, { standard: 'jedec' });
  const gzipStr = filesize(gzip, { standard: 'jedec' });
  statusBarItem.text = `$(package) ${sizeStr}`;
  statusBarItem.tooltip = `Total: ${sizeStr} (gzipped: ${gzipStr}) — ${count} package${count !== 1 ? 's' : ''}`;
}

function onEditorChange(fileName) {
  update(fileName);
}

function dispose() {
  if (statusBarItem) {
    statusBarItem.dispose();
  }
}

module.exports = {
  init,
  setFileCost,
  onEditorChange,
  dispose,
};
