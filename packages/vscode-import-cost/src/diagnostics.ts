import type { PackageInfo } from 'fast-import-cost';
import { filesize } from 'filesize';
import * as vscode from 'vscode';

const collection = vscode.languages.createDiagnosticCollection('importCost');

export function updateDiagnostics(
  fileName: string,
  packages: PackageInfo[],
): void {
  const configuration = vscode.workspace.getConfiguration('importCost');
  const budget = configuration.get<number>('budgetKB', 0);
  if (budget <= 0) {
    collection.delete(vscode.Uri.file(fileName));
    return;
  }

  const diagnostics: vscode.Diagnostic[] = [];
  for (const pkg of packages) {
    if (!pkg.size || pkg.size / 1024 <= budget) continue;

    const line = pkg.line - 1;
    const range = new vscode.Range(line, 0, line, 1000);
    const size = filesize(pkg.size, { standard: 'jedec' });
    const diagnostic = new vscode.Diagnostic(
      range,
      `Import "${pkg.name}" is ${size} — exceeds budget of ${budget} KB`,
      vscode.DiagnosticSeverity.Warning,
    );
    diagnostic.source = 'Import Cost';
    diagnostic.code = 'over-budget';
    diagnostics.push(diagnostic);
  }

  collection.set(vscode.Uri.file(fileName), diagnostics);
}

export function clearDiagnostics(): void {
  collection.clear();
}

export function dispose(): void {
  collection.dispose();
}
