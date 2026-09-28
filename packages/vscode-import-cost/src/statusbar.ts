import { filesize } from 'filesize';
import type { PackageInfo } from 'import-cost-core';
import * as vscode from 'vscode';
import { isOverBudget } from './budget';
import { documentPath } from './document';
import type { WorkspaceImportIndex } from './workspace-index';

let statusBarItem: vscode.StatusBarItem;
let workspaceIndex: WorkspaceImportIndex | null = null;
let enabled = true;

export function setWorkspaceIndex(index: WorkspaceImportIndex | null): void {
  workspaceIndex = index;
}

const fileTotals: Record<
  string,
  {
    total: number;
    gzip: number;
    brotli: number;
    count: number;
    overBudget: number;
    uniqueTotal: number;
    uniqueGzip: number;
    uniqueCount: number;
  }
> = {};

function activeFileName(): string | null {
  const document = vscode.window.activeTextEditor?.document;
  return (document && documentPath(document)) ?? null;
}

export function init(): void {
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.command = 'importCost.optimizationReport';
  update(null);
}

export function setEnabled(on: boolean): void {
  enabled = on;
  update(activeFileName());
}

export function setFileCost(fileName: string, packages: PackageInfo[]): void {
  const total = packages.reduce((sum, pkg) => sum + (pkg.size || 0), 0);
  const gzip = packages.reduce((sum, pkg) => sum + (pkg.gzip || 0), 0);
  const brotli = packages.reduce((sum, pkg) => sum + (pkg.brotli || 0), 0);
  const count = packages.filter(pkg => (pkg.size || 0) > 0).length;
  const overBudget = packages.filter(isOverBudget).length;

  let uniqueTotal = total;
  let uniqueGzip = gzip;
  let uniqueCount = count;

  const idx = workspaceIndex;
  if (idx?.isReady) {
    const uniquePkgs = packages.filter(
      pkg =>
        (pkg.size || 0) > 0 &&
        idx.getPackageSharing(pkg.name, fileName).isUnique,
    );
    uniqueTotal = uniquePkgs.reduce((sum, pkg) => sum + (pkg.size || 0), 0);
    uniqueGzip = uniquePkgs.reduce((sum, pkg) => sum + (pkg.gzip || 0), 0);
    uniqueCount = uniquePkgs.length;
  }

  fileTotals[fileName] = {
    total,
    gzip,
    brotli,
    count,
    overBudget,
    uniqueTotal,
    uniqueGzip,
    uniqueCount,
  };
  if (activeFileName() === fileName) {
    update(fileName);
  }
}

function update(fileName: string | null): void {
  if (!statusBarItem) return;
  if (!enabled || !fileName || !fileTotals[fileName]) {
    statusBarItem.hide();
    return;
  }
  statusBarItem.show();
  const { total, gzip, brotli, count, overBudget, uniqueTotal, uniqueCount } =
    fileTotals[fileName];
  if (total === 0) {
    statusBarItem.text = '$(package) No imports';
    statusBarItem.tooltip = 'No third-party imports found';
    return;
  }
  const sizeStr = filesize(total, { standard: 'jedec' });
  const gzipStr = filesize(gzip, { standard: 'jedec' });
  const brotliStr = brotli ? filesize(brotli, { standard: 'jedec' }) : null;
  const icon = overBudget > 0 ? '$(warning)' : '$(package)';

  if (uniqueTotal < total) {
    const uniqueStr = filesize(uniqueTotal, { standard: 'jedec' });
    statusBarItem.text = `${icon} Σ ${sizeStr} (${uniqueStr} unique)`;
  } else {
    statusBarItem.text = `${icon} Σ ${sizeStr}`;
  }

  let tip = `Total: ${sizeStr} (gzip: ${gzipStr}`;
  if (brotliStr) tip += `, brotli: ${brotliStr}`;
  tip += `) — ${count} import${count !== 1 ? 's' : ''}`;
  if (overBudget > 0) {
    tip += `\n⚠ ${overBudget} import${overBudget !== 1 ? 's' : ''} over budget`;
  }
  if (uniqueTotal < total) {
    const sharedCount = count - uniqueCount;
    tip += `\n📦 ${uniqueCount} unique, ${sharedCount} shared with other files in this package`;
  }
  tip += '\nClick for the optimization report';
  statusBarItem.tooltip = tip;
}

export function clearFileCost(fileName: string): void {
  delete fileTotals[fileName];
}

export function onEditorChange(fileName: string | null): void {
  update(fileName);
}

export function dispose(): void {
  if (statusBarItem) {
    statusBarItem.dispose();
  }
}
