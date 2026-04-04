export interface PackageInfo {
  fileName: string;
  name: string;
  line: number;
  string: string;
  version?: string | null;
  size?: number;
  gzip?: number;
  error?: Error;
}

export interface SizeResult {
  size: number;
  gzip: number;
}

export interface ImportCostConfig {
  maxCallTime: number;
  concurrent: boolean;
}

export const Lang = {
  TYPESCRIPT: 'typescript',
  JAVASCRIPT: 'javascript',
  VUE: 'vue',
  SVELTE: 'svelte',
} as const;

export type Lang = (typeof Lang)[keyof typeof Lang];
