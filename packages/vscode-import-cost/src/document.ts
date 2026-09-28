import { loadIgnoreFile } from 'import-cost-core';
import * as path from 'path';
import * as vscode from 'vscode';

export function documentPath(
  document: vscode.TextDocument,
): string | undefined {
  if (document.uri.scheme === 'file') return document.fileName;
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!document.isUntitled || !folder) return undefined;
  return path.join(folder.uri.fsPath, path.basename(document.fileName));
}

export function ignorePatternsFor(document: vscode.TextDocument): string[] {
  const folder =
    vscode.workspace.getWorkspaceFolder(document.uri) ??
    vscode.workspace.workspaceFolders?.[0];
  return [
    ...vscode.workspace
      .getConfiguration('importCost')
      .get<string[]>('ignoredPackages', []),
    ...(folder ? loadIgnoreFile(folder.uri.fsPath) : []),
  ];
}
