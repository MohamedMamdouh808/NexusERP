#!/usr/bin/env node
/**
 * Drops and recreates the isolated `nexuserp_test` schema for integration tests.
 *
 * The test schema is disposable: every suite truncates its reference tables and the
 * snapshot/restore design assumes tests start from a migrated, empty state. When a
 * debugging session has left tables, no tables, or a stale `_prisma_migrations` in
 * the test schema, the fastest correct route back is drop + recreate + `migrate deploy`
 * (run separately, e.g. `node scripts/with-test-schema-env.mjs npx prisma migrate deploy`).
 *
 * With `--migrate` the script does the whole job in one step: it drops the schema,
 * recreates it empty, and then applies the CURRENT migrations to it. That is what the
 * integration run does before its first suite, so a stale function or table from an
 * earlier debugging session cannot survive into a run and change what the tests
 * measure.
 *
 * Touches ONLY the test schema. The `public` schema is never read, written, or dropped
 * by this script - that is the whole point of the isolated-schema design (Task 0).
 * The URL is never printed: it contains the password.
 *
 * Usage:
 *   node scripts/reset-test-schema.mjs            # drop + recreate, empty
 *   node scripts/reset-test-schema.mjs --migrate  # drop + recreate + apply migrations
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(repoRoot, '.env');

function parseEnvFile(contents) {
  const result = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    const withoutExport = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
    const separator = withoutExport.indexOf('=');
    if (separator <= 0) continue;
    const key = withoutExport.slice(0, separator).trim();
    let value = withoutExport.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

const TEST_SCHEMA = 'nexuserp_test';

const environment = { ...process.env };
if (existsSync(envPath)) {
  const fromFile = parseEnvFile(readFileSync(envPath, 'utf8'));
  for (const [key, value] of Object.entries(fromFile)) {
    if (environment[key] === undefined) environment[key] = value;
  }
}

const url = environment.DATABASE_URL;
if (!url) {
  console.error('[reset-test-schema] DATABASE_URL is not set.');
  process.exit(2);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

try {
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
  await prisma.$executeRawUnsafe(`CREATE SCHEMA ${TEST_SCHEMA}`);
  const tables = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS c FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
    TEST_SCHEMA,
  );
  console.log(`[reset-test-schema] dropped and recreated schema ${TEST_SCHEMA}; ${tables[0].c} tables (expect 0).`);

  if (!process.argv.includes('--migrate')) {
    console.log('[reset-test-schema] next: node scripts/with-test-schema-env.mjs npx prisma migrate deploy');
    process.exit(0);
  }

  // Apply the CURRENT migrations to the empty schema. The wrapper points
  // DATABASE_URL at the test schema, so this cannot reach any other schema, and
  // the URL is never printed.
  console.log('[reset-test-schema] applying the current migrations to the test schema...');
  const migrate = spawnSync(
    process.execPath,
    [
      join(repoRoot, 'scripts', 'with-test-schema-env.mjs'),
      'npx',
      'prisma',
      'migrate',
      'deploy',
      '--schema',
      join(repoRoot, 'database', 'prisma', 'schema.prisma'),
    ],
    { stdio: 'inherit', cwd: join(repoRoot, 'database') },
  );

  if (migrate.status !== 0) {
    console.error('[reset-test-schema] the migrations did not apply; the test schema is empty.');
    process.exit(migrate.status ?? 1);
  }

  const applied = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS c FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
    TEST_SCHEMA,
  );
  console.log(`[reset-test-schema] test schema rebuilt from the current migrations (${applied[0].c} tables).`);
  process.exit(0);
} catch (error) {
  console.error(`[reset-test-schema] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
} finally {
  try {
    await prisma.$disconnect();
  } catch {
    // exit code already decided
  }
}
