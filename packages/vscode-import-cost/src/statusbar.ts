import type { PackageInfo } from 'fast-import-cost';
import { filesize } from 'filesize';
import * as vscode from 'vscode';

let statusBarItem: vscode.StatusBarItem;
const fileTotals: Record<
  string,
  {
    total: number;
    gzip: number;
    brotli: number;
    count: number;
    overBudget: number;
  }
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
  const brotli = packages.reduce((sum, pkg) => sum + (pkg.brotli || 0), 0);
  const count = packages.filter(pkg => (pkg.size || 0) > 0).length;
  const budget = vscode.workspace
    .getConfiguration('importCost')
    .get<number>('budgetKB', 0);
  const overBudget =
    budget > 0
      ? packages.filter(pkg => (pkg.size || 0) / 1024 > budget).length
      : 0;
  fileTotals[fileName] = { total, gzip, brotli, count, overBudget };
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
  const { total, gzip, brotli, count, overBudget } = fileTotals[fileName];
  if (total === 0) {
    statusBarItem.text = '$(package) No imports';
    statusBarItem.tooltip = 'No third-party imports found';
    return;
  }
  const sizeStr = filesize(total, { standard: 'jedec' });
  const gzipStr = filesize(gzip, { standard: 'jedec' });
  const brotliStr = brotli ? filesize(brotli, { standard: 'jedec' }) : null;
  const icon = overBudget > 0 ? '$(warning)' : '$(package)';
  statusBarItem.text = `${icon} Σ ${sizeStr}`;
  let tip = `Total: ${sizeStr} (gzip: ${gzipStr}`;
  if (brotliStr) tip += `, brotli: ${brotliStr}`;
  tip += `) — ${count} import${count !== 1 ? 's' : ''}`;
  if (overBudget > 0) {
    tip += `\n⚠ ${overBudget} import${overBudget !== 1 ? 's' : ''} over budget`;
  }
  statusBarItem.tooltip = tip;
}

export function onEditorChange(fileName: string | null): void {
  update(fileName);
}

export function dispose(): void {
  if (statusBarItem) {
    statusBarItem.dispose();
  }
}
