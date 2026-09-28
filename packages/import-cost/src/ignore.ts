import * as fs from 'fs';
import * as path from 'path';

/**
 * Match a package name against a glob-like pattern.
 * Supports: exact match, `*` wildcard, `@scope/*` scoped patterns.
 */
function matchPattern(name: string, pattern: string): boolean {
  if (pattern === name) return true;
  // Convert glob pattern to regex: * -> [^/]*, ** -> .*
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<<DOUBLESTAR>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<DOUBLESTAR>>/g, '.*');
  return new RegExp(`^${escaped}$`).test(name);
}

export function isIgnored(name: string, patterns: string[]): boolean {
  return patterns.some(p => matchPattern(name, p));
}

export function loadIgnoreFile(dir: string): string[] {
  const filePath = path.join(dir, '.importcostignore');
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
  } catch {
    return [];
  }
}

export function findIgnoreFile(startDir: string): string[] {
  for (let dir = path.resolve(startDir); ; dir = path.dirname(dir)) {
    const patterns = loadIgnoreFile(dir);
    if (patterns.length > 0) return patterns;
    if (dir === path.dirname(dir)) return [];
  }
}
