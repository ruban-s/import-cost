import { getPackages, Lang, packageName, pkgDir } from 'import-cost-core';
import * as path from 'path';
import * as vscode from 'vscode';

export interface ImportRecord {
  fileName: string;
  line: number;
  packageName: string;
  importPath: string;
}

export interface PackageSharingInfo {
  totalFiles: number;
  isUnique: boolean;
  otherFiles: string[];
}

function langFromPath(fileName: string): Lang | undefined {
  const config = vscode.workspace.getConfiguration('importCost');
  const test = (exts: string[]) => new RegExp(exts.join('|')).test(fileName);
  if (test(config.svelteExtensions)) return Lang.SVELTE;
  if (test(config.vueExtensions)) return Lang.VUE;
  if (test(config.typescriptExtensions)) return Lang.TYPESCRIPT;
  if (test(config.javascriptExtensions)) return Lang.JAVASCRIPT;
  return undefined;
}

const SKIP_DIRS =
  /[\\/](?:node_modules|dist|build|coverage|\.next|\.nuxt|\.output|out|\.cache|\.turbo|__pycache__)[\\/]/;
const NOT_BUNDLED =
  /[\\/]__tests__[\\/]|\.(?:test|spec|stories|story)\.[cm]?[jt]sx?$|\.config\.[cm]?[jt]s$/;
const SOURCE_GLOB = '**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs,vue,svelte}';
const EXCLUDE_GLOB =
  '{**/node_modules/**,**/dist/**,**/build/**,**/coverage/**,**/.next/**,**/.nuxt/**,**/.output/**,**/out/**,**/.cache/**,**/.turbo/**}';
const MAX_FILE_SIZE = 100 * 1024; // 100KB — skip likely generated/bundled files
const SCAN_BATCH_SIZE = 50;
const MAX_FILES = 10000;
const WATCHER_DEBOUNCE_MS = 300;

export class WorkspaceImportIndex implements vscode.Disposable {
  private fileIndex = new Map<string, ImportRecord[]>();
  private packageIndex = new Map<string, Map<string, ImportRecord[]>>();
  private packageRoots = new Map<string, string | null>();
  private rootLookups = new Map<string, Promise<void>>();
  private watcher: vscode.FileSystemWatcher | null = null;
  private scanning = false;
  private initialized = false;
  private disposed = false;
  private initPromise: Promise<void> | null = null;
  private pendingWatcherEvents = new Map<string, 'change' | 'delete'>();
  private watcherDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  private _onDidUpdate = new vscode.EventEmitter<void>();
  readonly onDidUpdate = this._onDidUpdate.event;

  ensureInitialized(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    const folders = vscode.workspace.workspaceFolders;
    return folders ? this.init(folders) : Promise.resolve();
  }

  init(workspaceFolders: readonly vscode.WorkspaceFolder[]): Promise<void> {
    const scan = () => this.scan(workspaceFolders);
    this.initPromise = (this.initPromise ?? Promise.resolve()).then(scan, scan);
    return this.initPromise;
  }

  private async scan(
    workspaceFolders: readonly vscode.WorkspaceFolder[],
  ): Promise<void> {
    this.scanning = true;
    this.fileIndex.clear();
    this.packageIndex.clear();

    for (const folder of workspaceFolders) {
      if (this.disposed) return;
      const uris = await vscode.workspace.findFiles(
        new vscode.RelativePattern(folder, SOURCE_GLOB),
        EXCLUDE_GLOB,
        MAX_FILES,
      );

      for (let i = 0; i < uris.length; i += SCAN_BATCH_SIZE) {
        if (this.disposed) return;
        const batch = uris.slice(i, i + SCAN_BATCH_SIZE);
        await Promise.all(batch.map(uri => this.scanFile(uri.fsPath)));
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    this.setupWatcher();
    this.scanning = false;
    this.initialized = true;
    this._onDidUpdate.fire();
  }

  private resolveRoot(fileName: string): Promise<void> {
    const dir = path.dirname(fileName);
    let lookup = this.rootLookups.get(dir);
    if (!lookup) {
      lookup = pkgDir(dir).then(root => {
        this.packageRoots.set(dir, root ?? null);
      });
      this.rootLookups.set(dir, lookup);
    }
    return lookup;
  }

  private rootOf(fileName: string): string | null | undefined {
    return this.packageRoots.get(path.dirname(fileName));
  }

  private async scanFile(fileName: string): Promise<void> {
    if (SKIP_DIRS.test(fileName) || NOT_BUNDLED.test(fileName)) return;
    const lang = langFromPath(fileName);
    if (!lang) return;

    try {
      const stat = await vscode.workspace.fs.stat(vscode.Uri.file(fileName));
      if (stat.size > MAX_FILE_SIZE) return;

      const bytes = await vscode.workspace.fs.readFile(
        vscode.Uri.file(fileName),
      );
      await this.resolveRoot(fileName);
      this.indexFile(fileName, Buffer.from(bytes).toString('utf-8'), lang);
    } catch {
      // file unreadable — skip
    }
  }

  private indexFile(fileName: string, text: string, lang: Lang): void {
    this.removeFileFromIndexes(fileName);

    let packages: { name: string; line: number }[];
    try {
      packages = getPackages(fileName, text, lang);
    } catch {
      return;
    }

    const records: ImportRecord[] = [];
    for (const pkg of packages) {
      if (pkg.name.startsWith('.')) continue;
      const record: ImportRecord = {
        fileName,
        line: pkg.line,
        packageName: packageName(pkg.name),
        importPath: pkg.name,
      };
      records.push(record);

      let fileMap = this.packageIndex.get(record.packageName);
      if (!fileMap) {
        fileMap = new Map();
        this.packageIndex.set(record.packageName, fileMap);
      }
      let fileRecords = fileMap.get(fileName);
      if (!fileRecords) {
        fileRecords = [];
        fileMap.set(fileName, fileRecords);
      }
      fileRecords.push(record);
    }

    this.fileIndex.set(fileName, records);
  }

  private removeFileFromIndexes(fileName: string): void {
    const existing = this.fileIndex.get(fileName);
    if (!existing) return;

    const seen = new Set<string>();
    for (const rec of existing) {
      if (seen.has(rec.packageName)) continue;
      seen.add(rec.packageName);
      const fileMap = this.packageIndex.get(rec.packageName);
      if (fileMap) {
        fileMap.delete(fileName);
        if (fileMap.size === 0) this.packageIndex.delete(rec.packageName);
      }
    }
    this.fileIndex.delete(fileName);
  }

  async updateFile(fileName: string, text: string, lang: Lang): Promise<void> {
    await this.resolveRoot(fileName);
    if (this.disposed || SKIP_DIRS.test(fileName) || NOT_BUNDLED.test(fileName))
      return;
    this.indexFile(fileName, text, lang);
    this._onDidUpdate.fire();
  }

  removeFile(fileName: string): void {
    this.removeFileFromIndexes(fileName);
    this._onDidUpdate.fire();
  }

  getPackageSharing(importPath: string, forFile: string): PackageSharingInfo {
    const fileMap = this.packageIndex.get(packageName(importPath));
    if (!fileMap) return { totalFiles: 1, isUnique: true, otherFiles: [] };

    const root = this.rootOf(forFile);
    const otherFiles: string[] = [];
    for (const f of fileMap.keys()) {
      if (f === forFile) continue;
      if (root !== undefined && this.rootOf(f) !== root) continue;
      otherFiles.push(f);
    }
    return {
      totalFiles: otherFiles.length + 1,
      isUnique: otherFiles.length === 0,
      otherFiles,
    };
  }

  getAllPackageNames(): Set<string> {
    return new Set(this.packageIndex.keys());
  }

  getPackageFiles(packageName: string): Map<string, ImportRecord[]> {
    return this.packageIndex.get(packageName) ?? new Map();
  }

  get fileCount(): number {
    return this.fileIndex.size;
  }

  get isReady(): boolean {
    return this.initialized && !this.scanning;
  }

  private setupWatcher(): void {
    this.watcher?.dispose();
    this.watcher = vscode.workspace.createFileSystemWatcher(SOURCE_GLOB);
    const enqueue = (uri: vscode.Uri, type: 'change' | 'delete') => {
      if (SKIP_DIRS.test(uri.fsPath)) return;
      this.pendingWatcherEvents.set(uri.fsPath, type);
      if (this.watcherDebounceTimer) clearTimeout(this.watcherDebounceTimer);
      this.watcherDebounceTimer = setTimeout(
        () => this.flushWatcherEvents(),
        WATCHER_DEBOUNCE_MS,
      );
    };
    this.watcher.onDidChange(uri => enqueue(uri, 'change'));
    this.watcher.onDidCreate(uri => enqueue(uri, 'change'));
    this.watcher.onDidDelete(uri => enqueue(uri, 'delete'));
  }

  private async flushWatcherEvents(): Promise<void> {
    const events = new Map(this.pendingWatcherEvents);
    this.pendingWatcherEvents.clear();
    this.watcherDebounceTimer = null;

    let changed = false;
    for (const [filePath, type] of events) {
      if (type === 'delete') {
        this.removeFileFromIndexes(filePath);
        changed = true;
      } else {
        await this.scanFile(filePath);
        changed = true;
      }
    }
    if (changed && !this.disposed) this._onDidUpdate.fire();
  }

  dispose(): void {
    this.disposed = true;
    if (this.watcherDebounceTimer) clearTimeout(this.watcherDebounceTimer);
    this.watcher?.dispose();
    this._onDidUpdate.dispose();
    this.fileIndex.clear();
    this.packageIndex.clear();
  }
}
