import { parseSync } from '@swc/core';
import type { PackageInfo } from './types';
import { Lang } from './types';

interface SwcNode {
  type: string;
  body?: SwcNode[];
  source?: { value: string };
  specifiers?: SwcNode[];
  local?: { value: string };
  imported?: { value: string };
  callee?: SwcNode;
  value?: string;
  arguments?: SwcNode[];
  expression?: SwcNode;
  quasis?: Array<{ raw: string }>;
  typeOnly?: boolean;
  [key: string]: unknown;
}

export function getPackages(
  fileName: string,
  source: string,
  language: Lang,
  lineOffset = 0,
): PackageInfo[] {
  const packages: PackageInfo[] = [];
  const ast = parse(source, language) as unknown as SwcNode;
  const lines = source.split('\n');

  for (const node of ast.body!) {
    if (node.type === 'ImportDeclaration' && !node.typeOnly) {
      packages.push({
        fileName,
        name: node.source!.value,
        line: findImportLine(lines, node.source!.value, lineOffset),
        string: compileImportString(node),
      });
    }
  }

  walkNode(ast, node => {
    if (node.type !== 'CallExpression') return;
    if (node.callee?.type === 'Identifier' && node.callee.value === 'require') {
      const name = getPackageName(node);
      packages.push({
        fileName,
        name,
        line: findRequireLine(lines, name, lineOffset),
        string: compileRequireString(node),
      });
    } else if (node.callee?.type === 'Import') {
      const name = getPackageName(node);
      packages.push({
        fileName,
        name,
        line: findDynamicImportLine(lines, name, lineOffset),
        string: compileImportExpressionString(node),
      });
    }
  });

  return packages;
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

function parse(source: string, language: Lang) {
  const syntax = language === Lang.TYPESCRIPT ? 'typescript' : 'ecmascript';
  const opts =
    syntax === 'typescript'
      ? ({ syntax, tsx: true, decorators: true } as const)
      : ({ syntax, jsx: true, decorators: true } as const);
  return parseSync(source, opts);
}

function walkNode(node: SwcNode, visitor: (node: SwcNode) => void): void {
  if (!node || typeof node !== 'object') return;
  visitor(node);
  for (const key of Object.keys(node)) {
    const val = node[key] as unknown;
    if (Array.isArray(val)) {
      for (const child of val) walkNode(child, visitor);
    } else if (val && typeof val === 'object' && (val as SwcNode).type) {
      walkNode(val as SwcNode, visitor);
    }
  }
}

function compileImportString(node: SwcNode): string {
  let importSpecifiers: string | undefined;
  let importString: string;

  if (node.specifiers && node.specifiers.length > 0) {
    importString = []
      .concat(node.specifiers as never[])
      .sort((s1: SwcNode, s2: SwcNode) => {
        if (s1.type === 'ImportSpecifier' && s2.type === 'ImportSpecifier') {
          const n1 = s1.imported ? s1.imported.value : s1.local!.value;
          const n2 = s2.imported ? s2.imported.value : s2.local!.value;
          return n1 < n2 ? -1 : 1;
        }
        return 0;
      })
      .map((specifier: SwcNode, i: number) => {
        if (specifier.type === 'ImportNamespaceSpecifier') {
          return `* as ${specifier.local!.value}`;
        } else if (specifier.type === 'ImportDefaultSpecifier') {
          return specifier.local!.value;
        } else if (specifier.type === 'ImportSpecifier') {
          const name = specifier.imported
            ? specifier.imported.value
            : specifier.local!.value;
          if (!importSpecifiers) {
            importSpecifiers = '{';
          }
          importSpecifiers += name;
          if (
            node.specifiers![i + 1] &&
            node.specifiers![i + 1].type === 'ImportSpecifier'
          ) {
            importSpecifiers += ', ';
            return undefined;
          } else {
            const result = `${importSpecifiers}}`;
            importSpecifiers = undefined;
            return result;
          }
        }
        return undefined;
      })
      .filter((x: unknown) => x)
      .join(', ');
  } else {
    importString = '* as tmp';
  }

  return `import ${importString} from '${
    node.source!.value
  }';\nconsole.log(${importString.replace('* as ', '')});`;
}

function compileRequireString(node: SwcNode): string {
  return `require('${getPackageName(node)}')`;
}

function compileImportExpressionString(node: SwcNode): string {
  return `import('${getPackageName(node)}').then(res => console.log(res));`;
}

function getPackageName(node: SwcNode): string {
  const arg = node.arguments![0].expression!;
  return arg.type === 'TemplateLiteral' ? arg.quasis![0].raw : arg.value!;
}
