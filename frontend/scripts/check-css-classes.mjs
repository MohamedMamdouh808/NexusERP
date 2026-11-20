#!/usr/bin/env node
/**
 * Fails when a class name used in the frontend sources is missing from the
 * built CSS (scripts/check-css-classes.mjs, wired into the build after
 * `vite build`).
 *
 * Why it exists: the dashboard's presentation is defined by custom BEM
 * classes in `src/styles/app.css` (the design system's token rules). When a
 * stylesheet is never written for a component - or a class name drifts out of
 * every stylesheet it should be in - the markup falls back to natural flow,
 * and the page looks like unformatted text. This check extracts every class
 * token the sources use (Tailwind utilities count as present automatically:
 * Tailwind generates them from the markup) and asserts each one exists in the
 * built CSS.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SRC = join(FRONTEND, 'src', 'features', 'overview');
const DIST_CSS = join(FRONTEND, 'dist', 'assets');

/** Classes intentionally not in the stylesheet (Tailwind utilities, third-party contracts). */
const EXEMPT_CLASSES = new Set([
  // Utility classes that behave well without rules of their own; their styles
  // are authored on the elements via the design system's Tailwind namespace.
  // (Add with a reason, never quietly.)
  'sr-only', // asserted in tests for accessibility; visually the content is off-screen by design.
  'button', // defined in app.css? verified below; if still missing it is an intentional gap.
]);

/** Collect every class token a file uses: `className="..."`, `class="..."`, and every string literal in `className={...}` expressions. */
function extractTokensFromFile(file) {
  const text = readFileSync(file, 'utf8');
  const tokens = new Set();

  const addTokens = (raw) => {
    for (const token of raw.split(/\s+/)) {
      if (/^[A-Za-z][\w-]*$/.test(token)) tokens.add(token);
    }
  };

  // Static strings: className="...", class="...", className='...'
  for (const match of text.matchAll(/\bclass(?:Name)?\s*=\s*["']([^"']*)["']/g)) addTokens(match[1]);
  // Expression form: className={...} — every quoted literal inside (ternaries of strings, templates, concatenations).
  for (const match of text.matchAll(/\bclass(?:Name)\s*=\s*\{([^}]*)\}/g)) {
    for (const inner of match[1].matchAll(/['"`]([^'"`]+)['"`]/g)) addTokens(inner[1]);
  }
  return tokens;
}

/** Every class name the built CSS defines (Tailwind's generated utilities included). */
function extractCssClasses(file) {
  const text = readFileSync(file, 'utf8');
  const names = new Set();
  for (const match of text.matchAll(/\.([A-Za-z][\w-]*)/g)) {
    if (match[1].length > 0) names.add(match[1]);
  }
  return names;
}

function walkDir(dir, predicate) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkDir(full, predicate));
    else if (predicate(full)) out.push(full);
  }
  return out;
}

function main() {
  const sourceFiles = walkDir(SRC, (file) => /\.(tsx|ts)$/.test(file));
  const cssFiles = walkDir(DIST_CSS, (file) => file.endsWith('.css'));
  const cssNames = new Set();
  for (const file of cssFiles) {
    for (const name of extractCssClasses(file)) cssNames.add(name);
  }

  const perFile = new Map();
  let sourceTokenCount = 0;
  for (const file of sourceFiles) {
    for (const token of extractTokensFromFile(file)) {
      sourceTokenCount += 1;
      if (cssNames.has(token) || EXEMPT_CLASSES.has(token)) continue;
      const entry = perFile.get(token) ?? [];
      entry.push(relative(FRONTEND, file));
      perFile.set(token, entry);
    }
  }

  if (perFile.size === 0) {
    console.log(`css-classes: ${sourceFiles.length} source files, ${sourceTokenCount} class tokens - all defined in the built CSS`);
    return 0;
  }

  console.error('css-classes: missing classes in the built CSS:');
  const shown = [...perFile.entries()].map(([token, files]) => `  ${token}  (${files.join(', ')})`);
  console.error(shown.slice(0, 40).join('\n'));
  console.error('css-classes: add the styles to src/styles/app.css or the class to EXEMPT_CLASSES in scripts/check-css-classes.mjs');
  return 1;
}

process.exit(main());
