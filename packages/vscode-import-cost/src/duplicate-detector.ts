import * as vscode from 'vscode';
import type { WorkspaceImportIndex } from './workspace-index';

export interface DuplicateGroup {
  category: string;
  packages: string[];
}

const CAPABILITY_GROUPS: Record<string, string[]> = {
  'date library': [
    'moment',
    'moment-timezone',
    'dayjs',
    'date-fns',
    'luxon',
    'tempo-date',
  ],
  'HTTP client': [
    'axios',
    'ky',
    'got',
    'node-fetch',
    'superagent',
    'request',
    'undici',
  ],
  'utility library': ['lodash', 'lodash-es', 'underscore', 'ramda', 'remeda'],
  'CSS-in-JS': [
    'styled-components',
    '@emotion/react',
    '@emotion/styled',
    'linaria',
    '@stitches/react',
  ],
  'state management': [
    'redux',
    '@reduxjs/toolkit',
    'mobx',
    'zustand',
    'jotai',
    'recoil',
    'valtio',
  ],
  'form library': ['formik', 'react-hook-form', '@tanstack/react-form'],
  validation: ['zod', 'yup', 'joi', 'superstruct', 'valibot', 'io-ts'],
  'classname utility': ['classnames', 'clsx', 'class-names'],
  animation: [
    'framer-motion',
    'react-spring',
    '@react-spring/web',
    'gsap',
    'motion',
  ],
  'query/fetching': [
    '@tanstack/react-query',
    'swr',
    '@apollo/client',
    'apollo-client',
  ],
};

const COMPANIONS: Record<string, string> = {
  'moment-timezone': 'moment',
  '@emotion/styled': '@emotion/react',
  '@reduxjs/toolkit': 'redux',
  motion: 'framer-motion',
  '@react-spring/web': 'react-spring',
};

const pkgToCategory = new Map<string, string>();
for (const [category, packages] of Object.entries(CAPABILITY_GROUPS)) {
  for (const pkg of packages) {
    pkgToCategory.set(pkg, category);
  }
}

const collection = vscode.languages.createDiagnosticCollection(
  'importCostDuplicates',
);

export function detectDuplicates(
  index: WorkspaceImportIndex,
): DuplicateGroup[] {
  const allPackages = index.getAllPackageNames();
  const found = new Map<string, string[]>();

  for (const pkg of allPackages) {
    const category = pkgToCategory.get(pkg);
    if (!category) continue;
    let list = found.get(category);
    if (!list) {
      list = [];
      found.set(category, list);
    }
    list.push(pkg);
  }

  const duplicates: DuplicateGroup[] = [];
  for (const [category, packages] of found) {
    const families = new Set(packages.map(p => COMPANIONS[p] ?? p));
    if (families.size < 2) continue;
    duplicates.push({ category, packages });
  }
  return duplicates;
}

export function updateDuplicateDiagnostics(index: WorkspaceImportIndex): void {
  collection.clear();
  if (
    !vscode.workspace
      .getConfiguration('importCost')
      .get('duplicateDetection', true)
  ) {
    return;
  }
  const duplicates = detectDuplicates(index);
  if (duplicates.length === 0) return;

  const fileDiagnostics = new Map<string, vscode.Diagnostic[]>();

  for (const group of duplicates) {
    const otherPkgs = (pkg: string) =>
      group.packages
        .filter(p => (COMPANIONS[p] ?? p) !== (COMPANIONS[pkg] ?? pkg))
        .join(', ');

    for (const pkg of group.packages) {
      const fileMap = index.getPackageFiles(pkg);
      for (const [file, records] of fileMap) {
        const line = Math.min(...records.map(rec => rec.line)) - 1;
        const range = new vscode.Range(line, 0, line, 1000);
        const diagnostic = new vscode.Diagnostic(
          range,
          `Duplicate ${group.category}: "${pkg}" — project also uses ${otherPkgs(pkg)}`,
          vscode.DiagnosticSeverity.Information,
        );
        diagnostic.source = 'Import Cost';
        diagnostic.code = 'duplicate-capability';

        let list = fileDiagnostics.get(file);
        if (!list) {
          list = [];
          fileDiagnostics.set(file, list);
        }
        list.push(diagnostic);
      }
    }
  }

  for (const [file, diags] of fileDiagnostics) {
    collection.set(vscode.Uri.file(file), diags);
  }
}

export function clearDuplicateDiagnostics(): void {
  collection.clear();
}

export function disposeDuplicates(): void {
  collection.dispose();
}
