declare module '*.mjs' {
  export function evaluateBundleBudgets(
    files: { name: string; bytes: number }[],
    budgets?: unknown,
  ): { files: { name: string; bytes: number }[]; totalBytes: number; violations: any[] };
  export const BUNDLE_BUDGETS_KB: unknown;
  export function readBundleFiles(directory?: string): { name: string; bytes: number }[];
}
