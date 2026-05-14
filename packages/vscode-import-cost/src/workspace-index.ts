import { getPackages, Lang } from 'import-cost-core';
import * as vscode from 'vscode';

export interface ImportRecord {
  fileName: string;
  line: number;
  packageName: string;
}

export interface PackageSharingInfo {
  totalFiles: number;
  isUnique: boolean;
  otherFiles: string[];
}

export function normalizePackageName(name: string): string {
  const parts = name.split('/');
  let pkgName = parts[0] ?? '';
  parts.shift();
  if (pkgName.startsWith('@')) {
    pkgName = `${pkgName}/${parts[0]}`;
    parts.shift();
  }
  return pkgName;
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
const MAX_FILE_SIZE = 100 * 1024; // 100KB — skip likely generated/bundled files
const SCAN_BATCH_SIZE = 50;
const MAX_FILES = 10000;
const WATCHER_DEBOUNCE_MS = 300;

export class WorkspaceImportIndex implements vscode.Disposable {
  private fileIndex = new Map<string, ImportRecord[]>();
  private packageIndex = new Map<string, Map<string, ImportRecord[]>>();
  private watcher: vscode.FileSystemWatcher | null = null;
  private scanning = false;
  private initialized = false;
  private disposed = false;
  private pendingWatcherEvents = new Map<string, 'change' | 'delete'>();
  private watcherDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  private _onDidUpdate = new vscode.EventEmitter<void>();
  readonly onDidUpdate = this._onDidUpdate.event;

  async ensureInitialized(): Promise<void> {
    if (this.initialized || this.scanning) return;
    const folders = vscode.workspace.workspaceFolders;
    if (folders) await this.init(folders);
  }

  async init(
    workspaceFolders: readonly vscode.WorkspaceFolder[],
  ): Promise<void> {
    this.scanning = true;
    this.fileIndex.clear();
    this.packageIndex.clear();

    const pattern = '**/*.{ts,tsx,js,jsx,vue,svelte}';
    const exclude =
      '{**/node_modules/**,**/dist/**,**/build/**,**/coverage/**,**/.next/**,**/.nuxt/**,**/.output/**,**/out/**,**/.cache/**,**/.turbo/**}';

    for (const folder of workspaceFolders) {
      if (this.disposed) return;
      const uris = await vscode.workspace.findFiles(
        new vscode.RelativePattern(folder, pattern),
        exclude,
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

  private async scanFile(fileName: string): Promise<void> {
    if (SKIP_DIRS.test(fileName)) return;
    const lang = langFromPath(fileName);
    if (!lang) return;

    try {
      const stat = await vscode.workspace.fs.stat(vscode.Uri.file(fileName));
      if (stat.size > MAX_FILE_SIZE) return;

      const bytes = await vscode.workspace.fs.readFile(
        vscode.Uri.file(fileName),
      );
      const text = Buffer.from(bytes).toString('utf-8');
      this.indexFile(fileName, text, lang);
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
      const packageName = normalizePackageName(pkg.name);
      records.push({ fileName, line: pkg.line, packageName });

      let fileMap = this.packageIndex.get(packageName);
      if (!fileMap) {
        fileMap = new Map();
        this.packageIndex.set(packageName, fileMap);
      }
      let fileRecords = fileMap.get(fileName);
      if (!fileRecords) {
        fileRecords = [];
        fileMap.set(fileName, fileRecords);
      }
      fileRecords.push({ fileName, line: pkg.line, packageName });
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

  updateFile(fileName: string, text: string, lang: Lang): void {
    this.indexFile(fileName, text, lang);
    this._onDidUpdate.fire();
  }

  removeFile(fileName: string): void {
    this.removeFileFromIndexes(fileName);
    this._onDidUpdate.fire();
  }

  getPackageSharing(packageName: string, forFile: string): PackageSharingInfo {
    const normalized = normalizePackageName(packageName);
    const fileMap = this.packageIndex.get(normalized);
    if (!fileMap) return { totalFiles: 0, isUnique: true, otherFiles: [] };

    const totalFiles = fileMap.size;
    const otherFiles: string[] = [];
    for (const f of fileMap.keys()) {
      if (f !== forFile) otherFiles.push(f);
    }
    return { totalFiles, isUnique: totalFiles <= 1, otherFiles };
  }

  getFileStats(fileName: string): {
    uniquePackages: string[];
    sharedPackages: string[];
  } {
    const records = this.fileIndex.get(fileName);
    if (!records) return { uniquePackages: [], sharedPackages: [] };

    const seen = new Set<string>();
    const uniquePackages: string[] = [];
    const sharedPackages: string[] = [];

    for (const rec of records) {
      if (seen.has(rec.packageName)) continue;
      seen.add(rec.packageName);
      const sharing = this.getPackageSharing(rec.packageName, fileName);
      if (sharing.isUnique) {
        uniquePackages.push(rec.packageName);
      } else {
        sharedPackages.push(rec.packageName);
      }
    }
    return { uniquePackages, sharedPackages };
  }

  getAllPackageNames(): Set<string> {
    return new Set(this.packageIndex.keys());
  }

  getPackageFiles(packageName: string): Map<string, ImportRecord[]> {
    return this.packageIndex.get(packageName) ?? new Map();
  }

  get isReady(): boolean {
    return this.initialized && !this.scanning;
  }

  private setupWatcher(): void {
    this.watcher?.dispose();
    this.watcher = vscode.workspace.createFileSystemWatcher(
      '**/*.{ts,tsx,js,jsx,vue,svelte}',
    );
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
    if (changed) this._onDidUpdate.fire();
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
