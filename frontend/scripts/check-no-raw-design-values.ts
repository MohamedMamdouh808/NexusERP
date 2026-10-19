/**
 * Fails when a raw design value appears outside the token file (T082).
 *
 * The design system is the source of truth for every colour, and tokens.css is the
 * single transcription of it into the interface. A hex colour typed into a
 * component forks that truth: the component no longer tracks the design system, it
 * tracks whoever typed the value, and the next palette change silently misses it.
 * This check makes that fork a build failure instead of a review comment.
 *
 * What it proves, exactly:
 *
 *   - no `#rgb`/`#rrggbb`/`#rrggbbaa` literal outside src/styles/tokens.css
 *   - no `rgb()`, `rgba()`, `hsl()` or `hsla()` call outside src/styles/tokens.css
 *   - no Tailwind arbitrary colour value such as `bg-[#123456]`
 *
 * What it does NOT prove, stated so nobody mistakes a pass for more than it is:
 * raw spacing, radius and shadow numbers are not checked, because layout CSS
 * legitimately needs measures that the token scale does not cover. A raw `13px`
 * padding outside the scale will pass this check.
 *
 * Comments are stripped before matching, so prose that names a colour - this
 * header, for instance - does not trip the check. `tsx` runs this script and it
 * builds no Nest DI container, which is the only thing AGENTS.md forbids `tsx`
 * from doing.
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

/** Relative to each scan root. The one file allowed to name a value. */
export const EXEMPT_FILES = [join('styles', 'tokens.css')];

export const RULES: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  {
    name: 'hex colour literal',
    pattern: /#[0-9a-fA-F]{3,8}\b/g,
  },
  {
    name: 'colour function',
    pattern: /\b(?:rgba?|hsla?)\s*\(/g,
  },
];

/**
 * Matched first, and its matches are removed before the two rules above run: a
 * Tailwind arbitrary value contains a hex, and reporting both would count one
 * mistake twice and bury the useful line - the arbitrary utility - under a
 * duplicate.
 */
export const ARBITRARY_COLOUR_UTILITY = new RegExp(
  String.raw`\b(?:bg|text|border|border-t|border-b|border-l|border-r|fill|stroke|ring|shadow|from|via|to|outline|divide|decoration|accent|caret|placeholder)-\[[^\]]*(?:#|rgba?|hsla?)[^\]]*\]`,
  'g',
);

/** Removes comments so a comment that names a colour is not a violation. */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (whole, prefix: string) => prefix + ' '.repeat(whole.length - prefix.length));
}

export function isExempt(file: string): boolean {
  const normalised = file.split(sep).join('/');
  return EXEMPT_FILES.some((exempt) => normalised.endsWith(exempt.split(sep).join('/')));
}

/** Pure matcher, so the check itself can be tested without touching the disk. */
export function findViolations(files: readonly { file: string; source: string }[]): Violation[] {
  const violations: Violation[] = [];

  for (const { file, source } of files) {
    if (isExempt(file)) continue;

    const stripped = stripComments(source);
    const lines = stripped.split('\n');

    lines.forEach((line, index) => {
      let remaining = line;

      ARBITRARY_COLOUR_UTILITY.lastIndex = 0;
      if (ARBITRARY_COLOUR_UTILITY.test(line)) {
        violations.push({
          file,
          line: index + 1,
          rule: 'Tailwind arbitrary colour value',
          text: line.trim(),
        });
        remaining = line.replace(ARBITRARY_COLOUR_UTILITY, (match) => ' '.repeat(match.length));
      }

      for (const rule of RULES) {
        rule.pattern.lastIndex = 0;
        if (rule.pattern.test(remaining)) {
          violations.push({ file, line: index + 1, rule: rule.name, text: line.trim() });
        }
      }
    });
  }

  return violations;
}

function collectFiles(root: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      found.push(...collectFiles(full));
    } else if (/\.(ts|tsx|css)$/.test(entry.name)) {
      found.push(full);
    }
  }

  return found;
}

function main(roots: string[]): number {
  const scanned = roots.flatMap((root) => {
    const absolute = resolve(root);
    if (!statSync(absolute).isDirectory()) {
      return [{ file: absolute, source: readFileSync(absolute, 'utf8') }];
    }
    return collectFiles(absolute).map((file) => ({ file, source: readFileSync(file, 'utf8') }));
  });

  const violations = findViolations(scanned);

  if (violations.length === 0) {
    console.log(`check-no-raw-design-values: ${scanned.length} files scanned, no raw design values`);
    return 0;
  }

  console.error(
    `check-no-raw-design-values: ${violations.length} raw design value(s) outside the token file.`,
  );
  console.error('Every colour must come from src/styles/tokens.css. Use var(--token) or a utility class.');
  for (const violation of violations) {
    console.error(`  ${violation.file}:${violation.line}  [${violation.rule}]  ${violation.text}`);
  }

  return 1;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const roots = process.argv.slice(2);
  process.exit(main(roots.length > 0 ? roots : ['src']));
}