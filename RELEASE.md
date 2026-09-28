# Release Checklist

## Pre-release

```sh
# 1. Ensure clean working tree
git status

# 2. Run the full test suite (core, extension, coc build)
npm test -w import-cost-core
npm run typecheck -w fast-import-cost
npm test -w fast-import-cost
npm run build -w coc-import-cost-fast

# 3. Lint
npm run lint
```

## Version Bump

```sh
# Bump all packages to new version (replace X.Y.Z)
VERSION=5.8.0

# Core library
npm version $VERSION -w import-cost-core --no-git-tag-version

# VS Code extension
npm version $VERSION -w fast-import-cost --no-git-tag-version

# coc.nvim (follows its own versioning; keep its import-cost-core range at ^$VERSION)
# npm version 3.7.0 -w coc-import-cost-fast --no-git-tag-version

# Commit version bump
git add packages/*/package.json package-lock.json
git commit -m "chore: bump to $VERSION"
git tag "v$VERSION"
```

## Build & Package

```sh
# Build core library
npm run build -w import-cost-core

# Build one VSIX per platform (fetches each @esbuild/<platform> binary; fails if any is missing)
cd packages/vscode-import-cost
npm run build:platform
# Output: fast-import-cost-<platform>-$VERSION.vsix for each platform
cd ../..
```

Never publish a VSIX built with plain `vsce package`: it only contains the esbuild binary of the machine that built it, so every other platform silently falls back to estimated sizes.

## Publish

### npm (core first: coc depends on it)

```sh
cd packages/import-cost
npm publish
cd ../..

cd packages/coc-import-cost
npm publish
cd ../..
```

### VS Code Marketplace

```sh
cd packages/vscode-import-cost
for f in fast-import-cost-*-$VERSION.vsix; do npx @vscode/vsce publish --packagePath "$f"; done
cd ../..
```

### GitHub

```sh
git push origin main --tags

gh release create "v$VERSION" \
  packages/vscode-import-cost/fast-import-cost-*-$VERSION.vsix \
  --title "v$VERSION" \
  --generate-notes
```

## Post-release

- [ ] Verify npm: `npm info import-cost-core version`
- [ ] Verify coc install: `npm install coc-import-cost-fast` in a scratch dir resolves `import-cost-core` from npm
- [ ] Verify VS Code Marketplace: `npx @vscode/vsce show ruban-s.fast-import-cost` lists every platform target
- [ ] Update CHANGELOG.md with release date
