import type { PackageInfo } from 'import-cost-core';
import * as vscode from 'vscode';
import { ALTERNATIVES } from './alternatives';
import { getDecorationsForFile } from './decorator';

export class ImportCostCodeActionProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
    vscode.CodeActionKind.Refactor,
  ];

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
  ): vscode.CodeAction[] {
    const decorations = getDecorationsForFile(document.fileName);
    if (!decorations) return [];

    const line = range.start.line + 1; // decorations are 1-based
    const pkg = decorations[line];
    if (!pkg || !pkg.size) return [];

    const actions: vscode.CodeAction[] = [];

    // Code action: convert wildcard import to named import
    if (pkg.string?.startsWith('import * as ') && pkg.size / 1024 > 50) {
      const lineText = document.lineAt(range.start.line).text;
      const wildcardMatch = lineText.match(
        /import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/,
      );
      if (wildcardMatch) {
        const [fullMatch, alias] = wildcardMatch;
        const action = new vscode.CodeAction(
          `Convert to named import (${fileKB(pkg)} — try reducing)`,
          vscode.CodeActionKind.RefactorRewrite,
        );
        action.edit = new vscode.WorkspaceEdit();
        const lineRange = document.lineAt(range.start.line).range;
        const newImport = fullMatch.replace(
          `* as ${alias}`,
          `{ /* pick what you need */ }`,
        );
        action.edit.replace(document.uri, lineRange, newImport);
        action.isPreferred = false;
        actions.push(action);
      }
    }

    // Code action: suggest lighter alternative
    const alt = ALTERNATIVES[pkg.name];
    if (alt) {
      const action = new vscode.CodeAction(
        `Consider replacing with ${alt.to}`,
        vscode.CodeActionKind.QuickFix,
      );
      action.isPreferred = false;
      action.diagnostics = [];
      // Don't auto-edit — just show it as a suggestion with a tooltip
      action.command = {
        command: 'importCost.showAlternative',
        title: 'Show alternative',
        arguments: [pkg.name, alt.to, alt.reason],
      };
      actions.push(action);
    }

    // Code action: over budget warning
    const budget = vscode.workspace
      .getConfiguration('importCost')
      .get<number>('budgetKB', 0);
    if (budget > 0 && pkg.size / 1024 > budget) {
      const action = new vscode.CodeAction(
        `Import exceeds budget (${fileKB(pkg)} > ${budget} KB)`,
        vscode.CodeActionKind.QuickFix,
      );
      action.isPreferred = false;
      action.diagnostics = [];
      actions.push(action);
    }

    return actions;
  }
}

function fileKB(pkg: PackageInfo): string {
  return `${(pkg.size! / 1024).toFixed(1)} KB`;
}
