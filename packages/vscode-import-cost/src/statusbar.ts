import type { PackageInfo } from 'fast-import-cost';
import { filesize } from 'filesize';
import * as vscode from 'vscode';

let statusBarItem: vscode.StatusBarItem;
const fileTotals: Record<
  string,
  { total: number; gzip: number; count: number }
> = {};

export function init(): void {
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.command = 'importCost.clearCache';
  statusBarItem.show();
  update(null);
}

export function setFileCost(fileName: string, packages: PackageInfo[]): void {
  const total = packages.reduce((sum, pkg) => sum + (pkg.size || 0), 0);
  const gzip = packages.reduce((sum, pkg) => sum + (pkg.gzip || 0), 0);
  const count = packages.filter(pkg => (pkg.size || 0) > 0).length;
  fileTotals[fileName] = { total, gzip, count };
  if (vscode.window.activeTextEditor?.document.fileName === fileName) {
    update(fileName);
  }
}

function update(fileName: string | null): void {
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

export function onEditorChange(fileName: string | null): void {
  update(fileName);
}

export function dispose(): void {
  if (statusBarItem) {
    statusBarItem.dispose();
  }
}
