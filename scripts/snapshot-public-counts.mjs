#!/usr/bin/env node
/**
 * snapshot-public-counts.mjs
 *
 * Task 0 proof helper (feature 006): prints a stable `table<TAB>count` line per
 * base table in the PUBLIC schema, so row counts can be compared before and
 * after a full integration test run.
 *
 * The integration suite is supposed to run exclusively against the
 * `nexuserp_test` schema; if this snapshot is identical before and after a run,
 * no test data leaked into the shared public schema.
 *
 * Read-only: one count(*) query per table. Never prints DATABASE_URL or any
 * password. Refuses to run against anything but the public schema.
 *
 * Usage: node scripts/snapshot-public-counts.mjs
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..');
const envPath = join(repoRoot, '.env');

function loadDatabaseUrl() {
  let url = process.env.DATABASE_URL;
  if (!url && existsSync(envPath)) {
    const contents = readFileSync(envPath, 'utf8');
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.startsWith('DATABASE_URL=')) {
        url = trimmed.slice('DATABASE_URL='.length).replace(/^"|"$/g, '');
        break;
      }
    }
  }
  if (!url) {
    throw new Error('DATABASE_URL is not set. Set it in .env or the environment.');
  }
  return url;
}

/**
 * Forces the `schema=public` search path: whatever the URL says, this script
 * must count the shared public schema or its output is meaningless.
 */
function toPublicSchema(url) {
  const base = url.split('?')[0];
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
  const params = new URLSearchParams(query);
  const schema = params.get('schema');
  if (schema !== null && schema !== 'public') {
    throw new Error(`Refusing: URL is scoped to a non-public schema ("${schema}").`);
  }
  params.set('schema', 'public');
  return `${base}?${params.toString()}`;
}

const prisma = new PrismaClient({
  datasources: { db: { url: toPublicSchema(loadDatabaseUrl()) } },
});

try {
  const tables = await prisma.$queryRawUnsafe(
    `SELECT c.relname AS name
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relispartition = false
      ORDER BY c.relname`,
  );
  for (const { name } of tables) {
    const rows = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS c FROM "public"."${name}"`);
    console.log(`${name}\t${rows[0]?.c ?? 0}`);
  }
} finally {
  await prisma.$disconnect();
}
