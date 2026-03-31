const { parseSync } = require('@swc/core');
const { Lang } = require('./langs.js');

function getPackages(fileName, source, language, lineOffset = 0) {
  const packages = [];
  const ast = parse(source, language);

  function getLine(span) {
    return source.substring(0, span.start - 1).split('\n').length + lineOffset;
  }

  for (const node of ast.body) {
    if (node.type === 'ImportDeclaration' && !node.typeOnly) {
      packages.push({
        fileName,
        name: node.source.value,
        line: getLine(node.span),
        string: compileImportString(node),
      });
    }
  }

  walkNode(ast, node => {
    if (node.type !== 'CallExpression') return;
    if (node.callee.type === 'Identifier' && node.callee.value === 'require') {
      packages.push({
        fileName,
        name: getPackageName(node),
        line: getLine(node.span),
        string: compileRequireString(node),
      });
    } else if (node.callee.type === 'Import') {
      packages.push({
        fileName,
        name: getPackageName(node),
        line: getLine(node.span),
        string: compileImportExpressionString(node),
      });
    }
  });

  return packages;
}

function parse(source, language) {
  const syntax = language === Lang.TYPESCRIPT ? 'typescript' : 'ecmascript';
  const opts =
    syntax === 'typescript'
      ? { syntax, tsx: true, decorators: true }
      : { syntax, jsx: true, decorators: true };
  return parseSync(source, opts);
}

function walkNode(node, visitor) {
  if (!node || typeof node !== 'object') return;
  visitor(node);
  for (const key of Object.keys(node)) {
    const val = node[key];
    if (Array.isArray(val)) {
      val.forEach(child => walkNode(child, visitor));
    } else if (val && typeof val === 'object' && val.type) {
      walkNode(val, visitor);
    }
  }
}

function compileImportString(node) {
  let importSpecifiers;
  let importString;

  if (node.specifiers && node.specifiers.length > 0) {
    importString = []
      .concat(node.specifiers)
      .sort((s1, s2) => {
        if (s1.type === 'ImportSpecifier' && s2.type === 'ImportSpecifier') {
          const n1 = s1.imported ? s1.imported.value : s1.local.value;
          const n2 = s2.imported ? s2.imported.value : s2.local.value;
          return n1 < n2 ? -1 : 1;
        }
        return 0;
      })
      .map((specifier, i) => {
        if (specifier.type === 'ImportNamespaceSpecifier') {
          return `* as ${specifier.local.value}`;
        } else if (specifier.type === 'ImportDefaultSpecifier') {
          return specifier.local.value;
        } else if (specifier.type === 'ImportSpecifier') {
          const name = specifier.imported
            ? specifier.imported.value
            : specifier.local.value;
          if (!importSpecifiers) {
            importSpecifiers = '{';
          }
          importSpecifiers += name;
          if (
            node.specifiers[i + 1] &&
            node.specifiers[i + 1].type === 'ImportSpecifier'
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
      .filter(x => x)
      .join(', ');
  } else {
    importString = '* as tmp';
  }

  return `import ${importString} from '${
    node.source.value
  }';\nconsole.log(${importString.replace('* as ', '')});`;
}

function compileRequireString(node) {
  return `require('${getPackageName(node)}')`;
}

function compileImportExpressionString(node) {
  return `import('${getPackageName(node)}').then(res => console.log(res));`;
}

function getPackageName(node) {
  const arg = node.arguments[0].expression;
  return arg.type === 'TemplateLiteral' ? arg.quasis[0].raw : arg.value;
}

module.exports = {
  getPackages,
};
