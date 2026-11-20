#!/usr/bin/env node
/**
 * Per-route JavaScript bundle budget (Feature 019, FR-015 / contracts/budgets.md).
 *
 * Reads the built `frontend/dist/assets/*.js` files and fails when the total or one
 * route chunk exceeds its budget. Sizes are measured, never estimated, and the check
 * is deterministic: the same build always produces the same verdict.
 *
 * Route chunk names follow Vite's naming: a lazy route imports
 * `features/<name>/**` and Vite emits a chunk whose file name contains that feature
 * name. A route without a dedicated chunk is covered by the total and per-chunk
 * budgets, so a regression cannot hide by staying in the entry bundle.
 *
 * Usage:
 *   node frontend/scripts/check-bundle-budget.mjs
 *   node frontend/scripts/check-bundle-budget.mjs --json
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDirectory, '..', '..');
const assetsDirectory = join(repoRoot, 'frontend', 'dist', 'assets');

/** Budgets in KiB. Keep headroom for a small refactor; tighten only with a measurement. */
export const BUNDLE_BUDGETS_KB = Object.freeze({
  /** Everything the browser downloads as JavaScript for a first visit. */
  total: 2_500,
  /** One chunk (the entry chunk is a chunk too). */
  perChunk: 1_800,
  /** Named route chunks, matched as a substring of the emitted file name. */
  routes: Object.freeze({
    reports: 900,
    dashboard: 650,
    overview: 650,
    invoicing: 650,
    sales: 650,
    purchasing: 650,
    inventory: 650,
    contacts: 500,
    products: 500,
    settings: 500,
    audit: 500,
  }),
});

/** Returns every `.js` file in the assets directory with its byte size. */
export function readBundleFiles(directory = assetsDirectory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith('.js'))
    .map((name) => ({
      name,
      bytes: statSync(join(directory, name)).size,
    }))
    .sort((left, right) => right.bytes - left.bytes);
}

/**
 * Applies the budgets. `budgets` is injectable so the test can prove the failure path
 * without building a 2.5 MB fixture.
 */
export function evaluateBundleBudgets(files, budgets = BUNDLE_BUDGETS_KB) {
  const violations = [];
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);

  if (totalBytes > budgets.total * 1024) {
    violations.push({
      scope: 'total',
      actualKb: Number((totalBytes / 1024).toFixed(1)),
      budgetKb: budgets.total,
    });
  }

  for (const file of files) {
    const actualKb = Number((file.bytes / 1024).toFixed(1));
    if (file.bytes > budgets.perChunk * 1024) {
      violations.push({
        scope: `chunk:${file.name}`,
        actualKb,
        budgetKb: budgets.perChunk,
      });
    }

    for (const [route, budgetKb] of Object.entries(budgets.routes)) {
      if (file.name.includes(route) && file.bytes > budgetKb * 1024) {
        violations.push({
          scope: `route:${route}`,
          chunk: file.name,
          actualKb,
          budgetKb,
        });
      }
    }
  }

  return { files, totalBytes, violations };
}

function main() {
  const asJson = process.argv.includes('--json');

  if (!existsSync(assetsDirectory)) {
    // The check is wired immediately after `vite build`, where the directory must
    // exist. A direct `check:guards` on a clean clone has no build to inspect, and
    // failing there would punish the wrong action; say so instead of guessing.
    console.warn(
      '[check-bundle-budget] skipped: frontend/dist/assets does not exist. ' +
        'Run the frontend build to enforce the budgets.',
    );
    process.exit(0);
  }

  const result = evaluateBundleBudgets(readBundleFiles());

  if (asJson) {
    console.log(
      JSON.stringify({
        totalKb: Number((result.totalBytes / 1024).toFixed(1)),
        files: result.files.map((file) => ({
          name: file.name,
          kb: Number((file.bytes / 1024).toFixed(1)),
        })),
        violations: result.violations,
      }),
    );
  } else {
    console.log(
      `[check-bundle-budget] ${result.files.length} JavaScript file(s), ` +
        `${(result.totalBytes / 1024).toFixed(1)} KiB total ` +
        `(budget ${BUNDLE_BUDGETS_KB.total} KiB)`,
    );
    for (const file of result.files.slice(0, 10)) {
      console.log(`  ${(file.bytes / 1024).toFixed(1).padStart(8)} KiB  ${file.name}`);
    }
    for (const violation of result.violations) {
      console.error(
        `[check-bundle-budget] FAIL ${violation.scope}: ${violation.actualKb} KiB ` +
          `exceeds ${violation.budgetKb} KiB` +
          (violation.chunk ? ` (${violation.chunk})` : ''),
      );
    }
    if (result.violations.length === 0) {
      console.log('[check-bundle-budget] all bundle budgets pass');
    }
  }

  process.exit(result.violations.length === 0 ? 0 : 1);
}

const executedDirectly =
  process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (executedDirectly) {
  main();
}
