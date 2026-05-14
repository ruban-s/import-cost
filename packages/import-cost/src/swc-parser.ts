import { initSync, parse as parseImports } from 'es-module-lexer';
import type { Lang, PackageInfo } from './types';

let initialized = false;

function ensureLexer(): void {
  if (!initialized) {
    initSync();
    initialized = true;
  }
}

function lineNumberAtOffset(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
}

export function getPackages(
  fileName: string,
  source: string,
  language: Lang,
  lineOffset = 0,
): PackageInfo[] {
  ensureLexer();
  const packages: PackageInfo[] = [];

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
        line: lineNumberAtOffset(source, tsMatch.index) + lineOffset,
        string: `require('${name}')`,
      });
    }
  }

  const cleanSource = source.replace(
    /import\s+\w+\s*=\s*require\s*\([^)]+\)\s*;?/g,
    '',
  );

  let imports: ReturnType<typeof parseImports>[0];
  try {
    [imports] = parseImports(cleanSource);
  } catch (e) {
    if (source.includes('<')) {
      return [
        ...packages,
        ...fallbackParse(fileName, source, lineOffset, tsRequireNames),
      ];
    }
    throw e;
  }
  for (const imp of imports) {
    const name = imp.n;
    if (!name) continue;

    if (imp.d === -1) {
      const statement = cleanSource.substring(imp.ss, imp.se);
      if (isTypeOnlyImport(statement)) continue;

      packages.push({
        fileName,
        name,
        line: lineNumberAtOffset(cleanSource, imp.ss) + lineOffset,
        string: compileImportString(statement, name),
      });
    } else if (imp.d >= 0) {
      packages.push({
        fileName,
        name,
        line: lineNumberAtOffset(cleanSource, imp.d) + lineOffset,
        string: `import('${name}').then(res => console.log(res));`,
      });
    }
  }

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
      line: lineNumberAtOffset(source, match.index) + lineOffset,
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

function fallbackParse(
  fileName: string,
  source: string,
  lineOffset: number,
  skipNames: Set<string>,
): PackageInfo[] {
  const packages: PackageInfo[] = [];

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
      line: lineNumberAtOffset(source, m.index) + lineOffset,
      string: compileImportString(statement, name),
    });
  }

  const sideEffectRegex = /import\s+['"]([^'"]+)['"]/g;
  while ((m = sideEffectRegex.exec(source)) !== null) {
    const name = m[1];
    if (!name || skipNames.has(name) || packages.some(p => p.name === name))
      continue;
    packages.push({
      fileName,
      name,
      line: lineNumberAtOffset(source, m.index) + lineOffset,
      string: `import * as tmp from '${name}';\nconsole.log(tmp);`,
    });
  }

  const dynamicRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = dynamicRegex.exec(source)) !== null) {
    const name = m[1];
    if (!name || packages.some(p => p.name === name)) continue;
    packages.push({
      fileName,
      name,
      line: lineNumberAtOffset(source, m.index) + lineOffset,
      string: `import('${name}').then(res => console.log(res));`,
    });
  }

  const requireRegex = /require\s*\(\s*(?:'([^']+)'|"([^"]+)"|`([^`]+)`)\s*\)/g;
  while ((m = requireRegex.exec(source)) !== null) {
    const name = m[1] || m[2] || m[3];
    if (!name || skipNames.has(name) || packages.some(p => p.name === name))
      continue;
    packages.push({
      fileName,
      name,
      line: lineNumberAtOffset(source, m.index) + lineOffset,
      string: `require('${name}')`,
    });
  }

  return packages;
}
