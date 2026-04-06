import { initSync, parse as parseImports } from 'es-module-lexer';
import type { Lang, PackageInfo } from './types';

let initialized = false;

function ensureLexer(): void {
  if (!initialized) {
    initSync();
    initialized = true;
  }
}

export function getPackages(
  fileName: string,
  source: string,
  language: Lang,
  lineOffset = 0,
): PackageInfo[] {
  ensureLexer();
  const lines = source.split('\n');
  const packages: PackageInfo[] = [];

  // Handle TS `import X = require('Y')` syntax before es-module-lexer
  // (es-module-lexer can't parse this syntax)
  const tsImportRequireRegex =
    /import\s+(\w+)\s*=\s*require\s*\(\s*(?:'([^']+)'|"([^"]+)")\s*\)/g;
  let tsMatch: RegExpExecArray | null;
  const tsRequireNames = new Set<string>();
  while ((tsMatch = tsImportRequireRegex.exec(source)) !== null) {
    const name = tsMatch[2] || tsMatch[3];
    if (name) {
      tsRequireNames.add(name);
      packages.push({
        fileName,
        name,
        line: findRequireLine(lines, name, lineOffset),
        string: `require('${name}')`,
      });
    }
  }

  // Strip TS import-equals lines so es-module-lexer can parse the rest
  const cleanSource = source.replace(
    /import\s+\w+\s*=\s*require\s*\([^)]+\)\s*;?/g,
    '',
  );

  // Parse static imports and dynamic import() using es-module-lexer
  // Falls back to regex for files es-module-lexer can't parse (e.g. JSX fragments)
  let imports: ReturnType<typeof parseImports>[0];
  try {
    [imports] = parseImports(cleanSource);
  } catch (e) {
    // If source contains JSX (<), use regex fallback; otherwise rethrow
    if (source.includes('<')) {
      return [
        ...packages,
        ...fallbackParse(fileName, source, lines, lineOffset, tsRequireNames),
      ];
    }
    throw e;
  }
  for (const imp of imports) {
    const name = imp.n;
    if (!name) continue;

    if (imp.d === -1) {
      // Static import — check if it's a type-only import
      const statement = cleanSource.substring(imp.ss, imp.se);
      if (isTypeOnlyImport(statement)) continue;

      packages.push({
        fileName,
        name,
        line: findImportLine(lines, name, lineOffset),
        string: compileImportString(statement, name),
      });
    } else if (imp.d >= 0) {
      // Dynamic import()
      packages.push({
        fileName,
        name,
        line: findDynamicImportLine(lines, name, lineOffset),
        string: `import('${name}').then(res => console.log(res));`,
      });
    }
  }

  // Parse require() calls (es-module-lexer doesn't handle CJS)
  const requireRegex = /require\s*\(\s*(?:'([^']+)'|"([^"]+)"|`([^`]+)`)\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = requireRegex.exec(source)) !== null) {
    const name = match[1] || match[2] || match[3];
    if (!name) continue;
    if (tsRequireNames.has(name) || packages.some(p => p.name === name))
      continue;
    packages.push({
      fileName,
      name,
      line: findRequireLine(lines, name, lineOffset),
      string: `require('${name}')`,
    });
  }

  return packages;
}

function isTypeOnlyImport(statement: string): boolean {
  return /^import\s+type\s/.test(statement.trim());
}

function compileImportString(statement: string, packageName: string): string {
  const defaultMatch = statement.match(
    /import\s+([a-zA-Z_$][\w$]*)\s*(?:,|\s+from)/,
  );
  const namespaceMatch = statement.match(/\*\s+as\s+([a-zA-Z_$][\w$]*)/);
  const namedMatch = statement.match(/\{([^}]+)\}/);

  const parts: string[] = [];

  if (defaultMatch && !namespaceMatch) {
    parts.push(defaultMatch[1]);
  }
  if (namespaceMatch) {
    parts.push(`* as ${namespaceMatch[1]}`);
  }
  if (namedMatch) {
    // Extract original names (before 'as' alias), sort them
    const specifiers = namedMatch[1]
      .split(',')
      .map(s =>
        s
          .trim()
          .split(/\s+as\s+/)[0]
          .trim(),
      )
      .filter(Boolean)
      .sort();
    parts.push(`{${specifiers.join(', ')}}`);
  }

  const importString = parts.length > 0 ? parts.join(', ') : '* as tmp';

  return `import ${importString} from '${packageName}';\nconsole.log(${importString.replace('* as ', '')});`;
}

function findImportLine(
  lines: string[],
  packageName: string,
  lineOffset: number,
): number {
  for (let i = 0; i < lines.length; i++) {
    if (
      lines[i].includes(`from '${packageName}'`) ||
      lines[i].includes(`from "${packageName}"`)
    ) {
      return i + 1 + lineOffset;
    }
  }
  return 1 + lineOffset;
}

function findRequireLine(
  lines: string[],
  packageName: string,
  lineOffset: number,
): number {
  for (let i = 0; i < lines.length; i++) {
    if (
      lines[i].includes(`require('${packageName}')`) ||
      lines[i].includes(`require("${packageName}")`) ||
      lines[i].includes(`require(\`${packageName}\`)`)
    ) {
      return i + 1 + lineOffset;
    }
  }
  return 1 + lineOffset;
}

function findDynamicImportLine(
  lines: string[],
  packageName: string,
  lineOffset: number,
): number {
  for (let i = 0; i < lines.length; i++) {
    if (
      lines[i].includes(`import('${packageName}')`) ||
      lines[i].includes(`import("${packageName}")`)
    ) {
      return i + 1 + lineOffset;
    }
  }
  return 1 + lineOffset;
}

function fallbackParse(
  fileName: string,
  source: string,
  lines: string[],
  lineOffset: number,
  skipNames: Set<string>,
): PackageInfo[] {
  const packages: PackageInfo[] = [];

  // Static imports via regex
  const importRegex =
    /import\s+(?!type\s)(?:([^'"{}*\n]+?)\s+from\s+|(\*\s+as\s+\w+)\s+from\s+|\{([^}]+)\}\s+from\s+)['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = importRegex.exec(source)) !== null) {
    const name = m[4];
    if (!name || skipNames.has(name)) continue;
    const statement = m[0];
    packages.push({
      fileName,
      name,
      line: findImportLine(lines, name, lineOffset),
      string: compileImportString(statement, name),
    });
  }

  // Side-effect imports: import 'module'
  const sideEffectRegex = /import\s+['"]([^'"]+)['"]/g;
  while ((m = sideEffectRegex.exec(source)) !== null) {
    const name = m[1];
    if (!name || skipNames.has(name) || packages.some(p => p.name === name))
      continue;
    packages.push({
      fileName,
      name,
      line: findImportLine(lines, name, lineOffset),
      string: `import * as tmp from '${name}';\nconsole.log(tmp);`,
    });
  }

  // Dynamic imports
  const dynamicRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = dynamicRegex.exec(source)) !== null) {
    const name = m[1];
    if (!name || packages.some(p => p.name === name)) continue;
    packages.push({
      fileName,
      name,
      line: findDynamicImportLine(lines, name, lineOffset),
      string: `import('${name}').then(res => console.log(res));`,
    });
  }

  // require() calls
  const requireRegex = /require\s*\(\s*(?:'([^']+)'|"([^"]+)"|`([^`]+)`)\s*\)/g;
  while ((m = requireRegex.exec(source)) !== null) {
    const name = m[1] || m[2] || m[3];
    if (!name || skipNames.has(name) || packages.some(p => p.name === name))
      continue;
    packages.push({
      fileName,
      name,
      line: findRequireLine(lines, name, lineOffset),
      string: `require('${name}')`,
    });
  }

  return packages;
}
