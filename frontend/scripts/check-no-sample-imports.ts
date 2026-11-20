/**
 * Fails when a production code path imports a sample/mock data source (FR-045, FR-047).
 *
 * Every figure in the product must trace to the organization's own records. A
 * production import of the sample service, the "not connected" banner, the sample
 * module switchboard or a mock folder reintroduces sample data behind the real
 * clients. The development gallery keeps its own fixtures and is allowed; so are
 * test files, which may stub anything.
 *
 * Comments and strings are stripped before matching, so prose that names these
 * modules does not trip the check. `tsx` runs this script; it builds no Nest DI
 * container.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Violation {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
  readonly text: string;
}

/** Production paths that are allowed to mention sample/mock sources. */
export function isExempt(file: string): boolean {
  const normalized = file.split(sep).join('/');
  return (
    normalized.startsWith('dev/gallery/') ||
    normalized.includes('/dev/gallery/') ||
    normalized.includes('/test/') ||
    normalized.includes('/__tests__/') ||
    normalized.endsWith('.spec.ts') ||
    normalized.endsWith('.spec.tsx')
  );
}

/** Import/identifier patterns that must not appear in production code. */
export const RULES: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  { name: 'sample service import', pattern: /sample-catalog-service/g },
  { name: 'sample banner import', pattern: /sample-data-banner/g },
  { name: 'sample module switchboard import', pattern: /real-modules/g },
  { name: 'mock folder import', pattern: /(?:from|import)\s*['"][^'"]*(?:\/mocks\/)/g },
  { name: 'sample service identifier', pattern: /\bsampleCatalogService\b/g },
  { name: 'sample banner identifier', pattern: /\bSampleDataBanner\b/g },
];

/** Removes comments before matching so prose that names these modules is not a violation. */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (whole, prefix: string) => prefix + ' '.repeat(whole.length - prefix.length));
}

/** Pure matcher over a list of { path, contents } files. */
export function findViolations(
  files: readonly { readonly path: string; readonly contents: string }[],
): Violation[] {
  const out: Violation[] = [];
  for (const file of files) {
    if (isExempt(file.path)) continue;
    const clean = stripComments(file.contents);
    const lines = clean.split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const rule of RULES) {
        rule.pattern.lastIndex = 0;
        if (rule.pattern.test(line)) {
          out.push({
            file: file.path,
            line: index + 1,
            rule: rule.name,
            text: file.contents.split(/\r?\n/)[index]?.trim() ?? '',
          });
        }
      }
    });
  }
  return out;
}

function collect(dir: string, root: string): { path: string; contents: string }[] {
  const files: { path: string; contents: string }[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collect(full, root));
    } else if (/\.tsx?$/.test(entry.name)) {
      files.push({ path: full.slice(root.length + 1), contents: readFileSync(full, 'utf8') });
    }
  }
  return files;
}

export function main(): number {
  const here = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
  const src = join(here, 'src');
  if (!statSync(src, { throwIfNoEntry: false })?.isDirectory()) {
    console.error('check:no-sample-imports: src directory not found');
    return 2;
  }
  const violations = findViolations(collect(src, here));
  if (violations.length > 0) {
    for (const v of violations) {
      console.error(`${v.file}:${v.line} [${v.rule}] ${v.text}`);
    }
    console.error(`check:no-sample-imports: ${violations.length} production sample/mock reference(s).`);
    return 1;
  }
  console.log('check:no-sample-imports: no production sample/mock imports.');
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]).endsWith('check-no-sample-imports.ts')) {
  process.exit(main());
}
