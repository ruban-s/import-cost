import { ALTERNATIVES } from 'import-cost-core';
import * as vscode from 'vscode';
import { getDecorationsForFile } from './decorator';
import { documentPath } from './document';

export class ImportCostCodeActionProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
  ): vscode.CodeAction[] {
    const fileName = documentPath(document);
    const decorations = fileName && getDecorationsForFile(fileName);
    if (!decorations) return [];

    const pkg = decorations[range.start.line + 1];
    if (!pkg?.size) return [];

    const alt = ALTERNATIVES[pkg.name];
    if (!alt) return [];

    const action = new vscode.CodeAction(
      `Consider replacing with ${alt.to}`,
      vscode.CodeActionKind.QuickFix,
    );
    action.isPreferred = false;
    action.diagnostics = [];
    action.command = {
      command: 'importCost.showAlternative',
      title: 'Show alternative',
      arguments: [pkg.name, alt.to, alt.reason],
    };
    return [action];
  }
}
