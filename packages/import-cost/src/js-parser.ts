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

const blank = (text: string) => text.replace(/[^\n]/g, ' ');

function stripComments(source: string): string {
  return source.replace(
    /(["'])(?:\\.|(?!\1)[^\\\n])*\1|`(?:\\.|[^\\`])*`|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    match => (match[0] === '/' ? blank(match) : match),
  );
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
    blank,
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

  const code = stripComments(source);
  const requireRegex = /require\s*\(\s*(?:'([^']+)'|"([^"]+)"|`([^`]+)`)\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = requireRegex.exec(code)) !== null) {
    const name = match[1] || match[2] || match[3];
    if (!name) continue;
    if (tsRequireNames.has(name) || packages.some(p => p.name === name))
      continue;
    packages.push({
      fileName,
      name,
      line: lineNumberAtOffset(code, match.index) + lineOffset,
      string: `require('${name}')`,
    });
  }

  return packages;
}

function isTypeOnlyImport(statement: string): boolean {
  const trimmed = statement.trim();
  if (/^import\s+type\s/.test(trimmed)) return true;
  const named = trimmed.match(/^import\s*\{([^}]*)\}\s*from/);
  if (!named) return false;
  const specifiers = named[1]
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return specifiers.length > 0 && specifiers.every(s => /^type\s/.test(s));
}

function compileImportString(statement: string, packageName: string): string {
  const defaultMatch = statement.match(
    /import\s+([a-zA-Z_$][\w$]*)\s*(?:,|\s+from)/,
  );
  const namespaceMatch = statement.match(/\*\s+as\s+([a-zA-Z_$][\w$]*)/);
  const namedMatch = statement.match(/\{([^}]+)\}/);

  const clause: string[] = [];
  const bindings: string[] = [];

  if (namespaceMatch) {
    clause.push(`* as ${namespaceMatch[1]}`);
    bindings.push(namespaceMatch[1]);
  } else if (defaultMatch) {
    clause.push(defaultMatch[1]);
    bindings.push(defaultMatch[1]);
  }
  const named = (namedMatch?.[1] ?? '')
    .split(',')
    .map(s =>
      s
        .trim()
        .split(/\s+as\s+/)[0]
        .trim(),
    )
    .filter(s => s && !/^type\s/.test(s))
    .sort();
  if (named.length > 0) {
    const local = (n: string) => (n === 'default' ? '__default' : n);
    clause.push(
      `{${named.map(n => (n === 'default' ? 'default as __default' : n)).join(', ')}}`,
    );
    bindings.push(`{${named.map(local).join(', ')}}`);
  }
  if (clause.length === 0) {
    clause.push('* as tmp');
    bindings.push('tmp');
  }

  return `import ${clause.join(', ')} from '${packageName}';\nconsole.log(${bindings.join(', ')});`;
}

function fallbackParse(
  fileName: string,
  source: string,
  lineOffset: number,
  skipNames: Set<string>,
): PackageInfo[] {
  const packages: PackageInfo[] = [];
  const code = stripComments(source);

  const importRegex =
    /import\s+(?!type\s)[\w$*{}\s,]+?\s+from\s+['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = importRegex.exec(code)) !== null) {
    const name = m[1];
    if (!name || skipNames.has(name)) continue;
    if (isTypeOnlyImport(m[0])) continue;
    packages.push({
      fileName,
      name,
      line: lineNumberAtOffset(code, m.index) + lineOffset,
      string: compileImportString(m[0], name),
    });
  }

  const sideEffectRegex = /import\s+['"]([^'"]+)['"]/g;
  while ((m = sideEffectRegex.exec(code)) !== null) {
    const name = m[1];
    if (!name || skipNames.has(name) || packages.some(p => p.name === name))
      continue;
    packages.push({
      fileName,
      name,
      line: lineNumberAtOffset(code, m.index) + lineOffset,
      string: `import * as tmp from '${name}';\nconsole.log(tmp);`,
    });
  }

  const dynamicRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = dynamicRegex.exec(code)) !== null) {
    const name = m[1];
    if (!name || packages.some(p => p.name === name)) continue;
    packages.push({
      fileName,
      name,
      line: lineNumberAtOffset(code, m.index) + lineOffset,
      string: `import('${name}').then(res => console.log(res));`,
    });
  }

  const requireRegex = /require\s*\(\s*(?:'([^']+)'|"([^"]+)"|`([^`]+)`)\s*\)/g;
  while ((m = requireRegex.exec(code)) !== null) {
    const name = m[1] || m[2] || m[3];
    if (!name || skipNames.has(name) || packages.some(p => p.name === name))
      continue;
    packages.push({
      fileName,
      name,
      line: lineNumberAtOffset(code, m.index) + lineOffset,
      string: `require('${name}')`,
    });
  }

  return packages;
}
