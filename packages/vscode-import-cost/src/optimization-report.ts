import { randomBytes } from 'crypto';
import type { PackageInfo } from 'import-cost-core';
import { ALTERNATIVES, packageName } from 'import-cost-core';
import * as vscode from 'vscode';
import { detectDuplicates } from './duplicate-detector';
import type { WorkspaceImportIndex } from './workspace-index';

interface OptimizationItem {
  type: 'alternative' | 'duplicate' | 'wildcard';
  packageName: string;
  suggestion: string;
  reason: string;
  estimatedSavingsKB: number;
  files: { path: string; line: number }[];
}

interface OptimizationReport {
  totalPackages: number;
  indexedFiles: number;
  measuredFiles: number;
  totalSavingsKB: number;
  items: OptimizationItem[];
}

function generateReport(
  index: WorkspaceImportIndex,
  getAllDecorations: () => Map<string, Record<number, PackageInfo>>,
): OptimizationReport {
  const allPackages = index.getAllPackageNames();
  const items: OptimizationItem[] = [];
  const decorations = getAllDecorations();

  const rootImportSizes = new Map<string, number>();
  let measuredFiles = 0;
  for (const fileDecos of decorations.values()) {
    let measured = false;
    for (const pkg of Object.values(fileDecos)) {
      if (!pkg.size || pkg.size <= 0) continue;
      measured = true;
      if (pkg.name !== packageName(pkg.name)) continue;
      rootImportSizes.set(
        pkg.name,
        Math.max(rootImportSizes.get(pkg.name) ?? 0, pkg.size),
      );
    }
    if (measured) measuredFiles++;
  }

  for (const pkgName of allPackages) {
    const alt = ALTERNATIVES[pkgName];
    if (!alt) continue;
    const files: { path: string; line: number }[] = [];
    for (const [f, recs] of index.getPackageFiles(pkgName)) {
      for (const rec of recs) {
        if (rec.importPath === pkgName) files.push({ path: f, line: rec.line });
      }
    }
    if (files.length === 0) continue;
    const size = rootImportSizes.get(pkgName);
    items.push({
      type: 'alternative',
      packageName: pkgName,
      suggestion: `Replace with ${alt.to}`,
      reason: alt.reason,
      estimatedSavingsKB: size ? (size * 0.9) / 1024 : 0,
      files,
    });
  }

  const duplicates = detectDuplicates(index);
  for (const group of duplicates) {
    const allFiles: { path: string; line: number }[] = [];
    for (const pkg of group.packages) {
      const idxFiles = index.getPackageFiles(pkg);
      for (const [f, recs] of idxFiles) {
        for (const rec of recs) {
          allFiles.push({ path: f, line: rec.line });
        }
      }
    }
    items.push({
      type: 'duplicate',
      packageName: group.packages.join(' + '),
      suggestion: `Standardize on one ${group.category}`,
      reason: `Project uses multiple ${group.category} packages: ${group.packages.join(', ')}`,
      estimatedSavingsKB: 0,
      files: allFiles,
    });
  }

  const wildcards = new Map<
    string,
    { size: number; files: { path: string; line: number }[] }
  >();
  for (const [fileName, fileDecos] of decorations) {
    for (const pkg of Object.values(fileDecos)) {
      if (!pkg.size || pkg.size / 1024 < 50) continue;
      if (!pkg.string?.startsWith('import * as ')) continue;
      const entry = wildcards.get(pkg.name) ?? { size: 0, files: [] };
      entry.size = Math.max(entry.size, pkg.size);
      entry.files.push({ path: fileName, line: pkg.line });
      wildcards.set(pkg.name, entry);
    }
  }
  for (const [name, { size, files }] of wildcards) {
    items.push({
      type: 'wildcard',
      packageName: name,
      suggestion: 'Convert to named imports',
      reason: `import * pulls the entire package — named imports may reduce size`,
      estimatedSavingsKB: (size * 0.5) / 1024,
      files,
    });
  }

  items.sort((a, b) => b.estimatedSavingsKB - a.estimatedSavingsKB);

  const savingsByPackage = new Map<string, number>();
  for (const item of items) {
    if (item.type === 'duplicate') continue;
    const key = packageName(item.packageName);
    savingsByPackage.set(
      key,
      Math.max(savingsByPackage.get(key) ?? 0, item.estimatedSavingsKB),
    );
  }

  return {
    totalPackages: allPackages.size,
    indexedFiles: index.fileCount,
    measuredFiles,
    totalSavingsKB: [...savingsByPackage.values()].reduce((a, b) => a + b, 0),
    items,
  };
}

let currentPanel: vscode.WebviewPanel | null = null;

export function showOptimizationReport(
  index: WorkspaceImportIndex,
  getAllDecorations: () => Map<string, Record<number, PackageInfo>>,
): void {
  if (currentPanel) {
    currentPanel.reveal();
    currentPanel.webview.html = buildHtml(
      generateReport(index, getAllDecorations),
    );
    return;
  }

  currentPanel = vscode.window.createWebviewPanel(
    'importCostReport',
    'Import Cost — Optimization Report',
    vscode.ViewColumn.One,
    { enableScripts: true, localResourceRoots: [] },
  );

  const report = generateReport(index, getAllDecorations);
  currentPanel.webview.html = buildHtml(report);

  currentPanel.webview.onDidReceiveMessage(async msg => {
    if (msg.command === 'openFile') {
      const doc = await vscode.workspace.openTextDocument(msg.file);
      const editor = await vscode.window.showTextDocument(doc);
      const line = Math.max(0, (msg.line || 1) - 1);
      const range = new vscode.Range(line, 0, line, 0);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      editor.selection = new vscode.Selection(range.start, range.start);
    }
  });

  currentPanel.onDidDispose(() => {
    currentPanel = null;
  });
}

function buildHtml(report: OptimizationReport): string {
  const rel = (p: string) => vscode.workspace.asRelativePath(p);
  const nonce = randomBytes(16).toString('base64');
  const totalSavings = report.totalSavingsKB;

  const itemsHtml = report.items
    .map(item => {
      const icon =
        item.type === 'alternative'
          ? '💡'
          : item.type === 'duplicate'
            ? '⚠️'
            : '🔧';
      const savings =
        item.estimatedSavingsKB > 0
          ? `<span class="savings" title="Estimated saving">~${Math.round(item.estimatedSavingsKB)} KB</span>`
          : '';
      const filesHtml = item.files
        .slice(0, 5)
        .map(
          f =>
            `<a href="#" class="file-link" data-file="${escapeAttr(f.path)}" data-line="${f.line}">${escapeHtml(rel(f.path))}:${f.line}</a>`,
        )
        .join('');
      const moreFiles =
        item.files.length > 5
          ? `<span class="more">+${item.files.length - 5} more</span>`
          : '';

      return `
      <div class="item ${item.type}">
        <div class="item-header">
          <span class="icon">${icon}</span>
          <span class="package">${escapeHtml(item.packageName)}</span>
          ${savings}
        </div>
        <div class="suggestion">${escapeHtml(item.suggestion)}</div>
        <div class="reason">${escapeHtml(item.reason)}</div>
        <div class="files">${filesHtml}${moreFiles}</div>
      </div>`;
    })
    .join('');

  const noItems =
    report.items.length === 0
      ? '<div class="empty">No optimization suggestions found. Your imports look good!</div>'
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 20px;
    margin: 0;
  }
  h1 {
    font-size: 1.4em;
    font-weight: 600;
    margin: 0 0 16px 0;
    color: var(--vscode-foreground);
  }
  .summary {
    display: flex;
    gap: 12px;
    margin-bottom: 24px;
  }
  .stat {
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    padding: 8px 16px;
    border-radius: 6px;
    text-align: center;
    min-width: 80px;
  }
  .stat-value {
    font-size: 1.4em;
    font-weight: 700;
    display: block;
  }
  .stat-label {
    font-size: 0.85em;
    opacity: 0.8;
  }
  .item {
    background: var(--vscode-editor-inactiveSelectionBackground);
    border-radius: 6px;
    padding: 12px 16px;
    margin-bottom: 10px;
    border-left: 3px solid transparent;
  }
  .item.alternative { border-left-color: var(--vscode-charts-yellow); }
  .item.duplicate { border-left-color: var(--vscode-charts-orange); }
  .item.wildcard { border-left-color: var(--vscode-charts-blue); }
  .item-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }
  .icon { font-size: 1.1em; }
  .package {
    font-weight: 600;
    font-family: var(--vscode-editor-font-family);
  }
  .savings {
    margin-left: auto;
    font-weight: 700;
    color: var(--vscode-charts-green);
    font-family: var(--vscode-editor-font-family);
  }
  .suggestion {
    font-weight: 500;
    margin-bottom: 2px;
  }
  .reason {
    opacity: 0.75;
    font-size: 0.9em;
    margin-bottom: 6px;
  }
  .files {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .file-link {
    color: var(--vscode-textLink-foreground);
    text-decoration: none;
    font-family: var(--vscode-editor-font-family);
    font-size: 0.85em;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 3px;
    background: var(--vscode-textBlockQuote-background);
  }
  .file-link:hover {
    text-decoration: underline;
    background: var(--vscode-list-hoverBackground);
  }
  .more {
    font-size: 0.85em;
    opacity: 0.6;
    padding: 2px 6px;
  }
  .empty {
    text-align: center;
    padding: 40px;
    opacity: 0.6;
    font-size: 1.1em;
  }
  .section-title {
    font-size: 0.85em;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.6;
    margin: 20px 0 10px 0;
    font-weight: 600;
  }
</style>
</head>
<body>
  <h1>Import Cost — Optimization Report</h1>
  <div class="summary">
    <div class="stat">
      <span class="stat-value">${report.totalPackages}</span>
      <span class="stat-label">packages</span>
    </div>
    <div class="stat">
      <span class="stat-value">${report.indexedFiles}</span>
      <span class="stat-label">files indexed</span>
    </div>
    <div class="stat">
      <span class="stat-value">${report.measuredFiles}</span>
      <span class="stat-label">files with measured sizes</span>
    </div>
    <div class="stat">
      <span class="stat-value">${report.items.length}</span>
      <span class="stat-label">suggestions</span>
    </div>
    ${totalSavings > 0 ? `<div class="stat"><span class="stat-value">~${Math.round(totalSavings)} KB</span><span class="stat-label">estimated potential savings</span></div>` : ''}
  </div>
  ${report.items.length > 0 ? '<div class="section-title">Suggestions</div>' : ''}
  ${itemsHtml}
  ${noItems}
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.addEventListener('click', (e) => {
      const link = e.target.closest('.file-link');
      if (link) {
        e.preventDefault();
        vscode.postMessage({
          command: 'openFile',
          file: link.dataset.file,
          line: parseInt(link.dataset.line, 10)
        });
      }
    });
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
