#!/usr/bin/env node
/**
 * Measures the database round-trip floor (Feature 019, FR-002).
 *
 * Every endpoint pays this floor once per sequential query, so it is reported
 * separately from endpoint latency: an endpoint that takes 300 ms with 8 queries is
 * a different problem from one that takes 300 ms with 1.
 *
 * The script runs `SELECT 1` 100 times (after a few warm-up round trips) against the
 * isolated test schema and reports median and p95. It refuses any other schema: a
 * measurement run must never point at public or production data, and `SELECT 1` is
 * not a reason to make an exception.
 *
 * The connection string is never printed.
 *
 * Usage:
 *   node scripts/measure-network-floor.mjs [--iterations=100] [--json]
 */

import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEST_SCHEMA = 'nexuserp_test';

function loadEnvFile() {
  const envPath = join(repoRoot, '.env');
  if (!existsSync(envPath)) return {};
  const result = {};
  for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    const withoutExport = line.startsWith('export ') ? line.slice(7).trim() : line;
    const separator = withoutExport.indexOf('=');
    if (separator <= 0) continue;
    const key = withoutExport.slice(0, separator).trim();
    let value = withoutExport.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

/** The `schema` query parameter of the URL, or undefined when absent. */
export function schemaOf(databaseUrl) {
  const match = /[?&]schema=([^&]*)/.exec(databaseUrl);
  return match ? decodeURIComponent(match[1]) : undefined;
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

function median(sorted) {
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

const args = process.argv.slice(2);
const iterationsArgument = args.find((arg) => arg.startsWith('--iterations='));
const iterations = iterationsArgument
  ? Number(iterationsArgument.slice('--iterations='.length))
  : 100;
const asJson = args.includes('--json');

const environment = { ...loadEnvFile(), ...process.env };
const databaseUrl = environment.DATABASE_URL;

if (!databaseUrl) {
  console.error('[measure-network-floor] DATABASE_URL is not set.');
  process.exit(2);
}

if (!Number.isInteger(iterations) || iterations < 10) {
  console.error('[measure-network-floor] --iterations must be an integer >= 10.');
  process.exit(2);
}

const schema = schemaOf(databaseUrl);
if (schema !== TEST_SCHEMA) {
  console.error(
    `[measure-network-floor] refusing to run: DATABASE_URL must target the isolated schema ` +
      `"${TEST_SCHEMA}" (found "${schema ?? 'no schema parameter'}"). ` +
      'Reset it with: node scripts/reset-test-schema.mjs --migrate',
  );
  process.exit(2);
}

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

try {
  const schemaRow = await prisma.$queryRawUnsafe('SELECT current_schema()::text AS s');
  const connectedSchema = schemaRow[0]?.s;
  if (connectedSchema !== TEST_SCHEMA) {
    console.error(
      `[measure-network-floor] refusing to run: connected to schema "${connectedSchema}", ` +
        `expected "${TEST_SCHEMA}".`,
    );
    process.exit(2);
  }

  // Warm-up round trips are excluded from the statistics: the first query pays
  // connection and statement-cache setup that every later request does not.
  for (let index = 0; index < 5; index += 1) {
    await prisma.$queryRawUnsafe('SELECT 1');
  }

  const samples = [];
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = process.hrtime.bigint();
    await prisma.$queryRawUnsafe('SELECT 1');
    samples.push(Number(process.hrtime.bigint() - startedAt) / 1_000_000);
  }

  samples.sort((left, right) => left - right);
  const result = {
    schema: TEST_SCHEMA,
    iterations,
    medianMs: Number(median(samples).toFixed(3)),
    p95Ms: Number(percentile(samples, 0.95).toFixed(3)),
    minMs: Number(samples[0].toFixed(3)),
    maxMs: Number(samples[samples.length - 1].toFixed(3)),
  };

  if (asJson) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`[measure-network-floor] schema: ${TEST_SCHEMA}`);
    console.log(`[measure-network-floor] iterations: ${iterations}`);
    console.log(`[measure-network-floor] median: ${result.medianMs} ms`);
    console.log(`[measure-network-floor] p95: ${result.p95Ms} ms`);
    console.log(`[measure-network-floor] min/max: ${result.minMs} / ${result.maxMs} ms`);
  }
} catch (error) {
  console.error(
    `[measure-network-floor] failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
} finally {
  await prisma.$disconnect().catch(() => {});
}
