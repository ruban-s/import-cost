# Release Checklist

## Pre-release

```sh
# 1. Ensure clean working tree
git status

# 2. Run full test suite
npm test -w import-cost-core

# 3. Typecheck extension
cd packages/vscode-import-cost && npm run typecheck && cd ../..

# 4. Lint
npx @biomejs/biome check packages/
```

## Version Bump

```sh
# Bump all packages to new version (replace X.Y.Z)
VERSION=5.7.0

# Core library
npm version $VERSION -w import-cost-core --no-git-tag-version

# VS Code extension
npm version $VERSION -w fast-import-cost --no-git-tag-version

# coc.nvim (follows its own versioning)
# npm version 3.6.0 -w coc-import-cost-fast --no-git-tag-version

# Commit version bump
git add packages/*/package.json
git commit -m "chore: bump to $VERSION"
git tag "v$VERSION"
```

## Build & Package

```sh
# Build core library
npm run build -w import-cost-core

# Build VS Code extension (universal VSIX)
cd packages/vscode-import-cost
npm run build
# Output: fast-import-cost-$VERSION.vsix
cd ../..

# Build platform-specific VSIX (optional, ~5x smaller per platform)
cd packages/vscode-import-cost
npm run build:platform
# Output: fast-import-cost-$VERSION@<platform>.vsix for each platform
cd ../..
```

## Publish

### npm (core library)

```sh
cd packages/import-cost
npm publish
cd ../..
```

### VS Code Marketplace

```sh
cd packages/vscode-import-cost
npx @vscode/vsce publish
cd ../..
```

### coc.nvim (npm)

```sh
cd packages/coc-import-cost
npm publish
cd ../..
```

### GitHub

```sh
git push origin master --tags

# Create GitHub release
gh release create "v$VERSION" \
  packages/vscode-import-cost/fast-import-cost-*.vsix \
  --title "v$VERSION" \
  --notes-file CHANGELOG.md
```

## Post-release

- [ ] Verify npm: `npm info import-cost-core version`
- [ ] Verify VS Code Marketplace: search "Import Cost Fast" in extensions
- [ ] Verify VSIX installs: `code --install-extension fast-import-cost-$VERSION.vsix`
- [ ] Update CHANGELOG.md with release date
