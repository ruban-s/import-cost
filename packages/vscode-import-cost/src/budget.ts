import type { PackageInfo } from 'import-cost-core';
import * as vscode from 'vscode';

export type BudgetMetric = 'minified' | 'gzip' | 'brotli';

export function budgetSettings(): { limitKB: number; metric: BudgetMetric } {
  const configuration = vscode.workspace.getConfiguration('importCost');
  return {
    limitKB: configuration.get<number>('budgetKB', 0),
    metric: configuration.get<BudgetMetric>('budgetMetric', 'minified'),
  };
}

export function budgetedSize(pkg: PackageInfo, metric: BudgetMetric): number {
  if (metric === 'gzip') return pkg.gzip ?? 0;
  if (metric === 'brotli') return pkg.brotli ?? 0;
  return pkg.size ?? 0;
}

export function isOverBudget(pkg: PackageInfo | undefined): boolean {
  const { limitKB, metric } = budgetSettings();
  return !!pkg && limitKB > 0 && budgetedSize(pkg, metric) / 1024 > limitKB;
}

export function budgetDescription(): string {
  const { limitKB, metric } = budgetSettings();
  return metric === 'minified' ? `${limitKB} KB` : `${limitKB} KB ${metric}`;
}
