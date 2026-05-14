export interface PackageInfo {
  fileName: string;
  name: string;
  line: number;
  string: string;
  version?: string | null;
  size?: number;
  gzip?: number;
  brotli?: number;
  estimated?: boolean;
  sideEffects?: boolean | string[];
  error?: Error;
}

export interface SizeResult {
  size: number;
  gzip: number;
  brotli: number;
  estimated?: boolean;
}

export interface ImportCostConfig {
  maxCallTime: number;
  concurrent: boolean;
  debounceDelay?: number;
  cacheDir?: string;
}

export const Lang = {
  TYPESCRIPT: 'typescript',
  JAVASCRIPT: 'javascript',
  VUE: 'vue',
  SVELTE: 'svelte',
} as const;

export type Lang = (typeof Lang)[keyof typeof Lang];
