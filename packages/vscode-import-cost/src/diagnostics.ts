import { filesize } from 'filesize';
import type { PackageInfo } from 'import-cost-core';
import * as vscode from 'vscode';
import {
  budgetDescription,
  budgetedSize,
  budgetSettings,
  isOverBudget,
} from './budget';

const collection = vscode.languages.createDiagnosticCollection('importCost');

export function updateDiagnostics(
  uri: vscode.Uri,
  packages: PackageInfo[],
): void {
  const { limitKB, metric } = budgetSettings();
  if (limitKB <= 0) {
    collection.delete(uri);
    return;
  }

  const diagnostics: vscode.Diagnostic[] = [];
  for (const pkg of packages) {
    if (!isOverBudget(pkg)) continue;

    const line = pkg.line - 1;
    const range = new vscode.Range(line, 0, line, 1000);
    const size = filesize(budgetedSize(pkg, metric), { standard: 'jedec' });
    const diagnostic = new vscode.Diagnostic(
      range,
      `Import "${pkg.name}" is ${size}${metric === 'minified' ? '' : ` ${metric}`} — exceeds budget of ${budgetDescription()}`,
      vscode.DiagnosticSeverity.Warning,
    );
    diagnostic.source = 'Import Cost';
    diagnostic.code = 'over-budget';
    diagnostics.push(diagnostic);
  }

  collection.set(uri, diagnostics);
}

export function clearDiagnostics(): void {
  collection.clear();
}

export function clearDiagnosticsForFile(uri: vscode.Uri): void {
  collection.delete(uri);
}

export function dispose(): void {
  collection.dispose();
}
