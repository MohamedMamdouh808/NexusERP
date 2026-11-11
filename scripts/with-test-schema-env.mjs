#!/usr/bin/env node
/**
 * Run a command with DATABASE_URL pointed at the isolated `nexuserp_test` schema.
 *
 * Integration tests must never touch the public schema (Task 0). Every helper that
 * connects - the test fixture client AND the application's own PrismaService, which
 * reads DATABASE_URL from the environment - must therefore see a URL that states
 * `?schema=nexuserp_test`. Root `.env` normally carries `schema=public` (or none at
 * all) because it configures the real application, not the tests.
 *
 * This wrapper loads root `.env` (same contract as with-root-env.mjs: values already
 * present in the environment win), rewrites the `schema` query parameter of
 * DATABASE_URL to `nexuserp_test`, caps the client pool (`connection_limit`) so a
 * booted app plus the test fixture stay under the Supabase pooler's session limit,
 * and runs the requested command. The rewritten URL is never printed: it still
 * contains the password.
 *
 * Example:
 *   node scripts/with-test-schema-env.mjs npx prisma migrate deploy
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// `scripts` -> repository root.
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

const environment = { ...process.env };

if (existsSync(envPath)) {
  const fromFile = parseEnvFile(readFileSync(envPath, 'utf8'));
  for (const [key, value] of Object.entries(fromFile)) {
    if (environment[key] === undefined) {
      environment[key] = value;
    }
  }
} else {
  console.warn(`[with-test-schema-env] ${envPath} not found. Set the variables in the environment.`);
}

const rawUrl = environment.DATABASE_URL;
if (!rawUrl) {
  console.error('[with-test-schema-env] DATABASE_URL is not set.');
  process.exit(2);
}

const TEST_SCHEMA = 'nexuserp_test';

// Same rewrite contract as database/scripts/db-url.ts `replaceSchema`: when a schema
// parameter already exists the match INCLUDES its `?`/`&`, so the replacement must
// preserve that leading character or the schema gets glued onto the database name
// (`postgresschema=x`) and Prisma reports the database as missing.
// The pooler allows only a small number of client sessions per database, and
// the dev server beside the test run is holding some of them. The test pools
// are capped so the run fits beside it instead of being refused with "the
// server has closed the connection".
const TEST_CONNECTION_LIMIT = 3; // app PrismaService + test fixture client under the pooler cap

let url = rawUrl;
const existing = url.match(/[?&]schema=[^&]*/);
if (existing) {
  url = url.replace(existing[0], `${existing[0][0]}schema=${TEST_SCHEMA}`);
} else {
  url = `${url}${url.includes('?') ? '&' : '?'}schema=${TEST_SCHEMA}`;
}
if (!url.includes('connection_limit=')) {
  url = `${url}&connection_limit=${TEST_CONNECTION_LIMIT}`;
}

environment.DATABASE_URL = url; // never logged or printed from here on

const [command, ...args] = process.argv.slice(2);
if (command === undefined) {
  console.error('Usage: with-test-schema-env.mjs <command> [args...]');
  process.exit(2);
}

const child = spawn(command, args, {
  stdio: 'inherit',
  env: environment,
  shell: process.platform === 'win32',
});

child.on('error', (error) => {
  console.error(`[with-test-schema-env] could not run ${command}: ${error.message}`);
  process.exit(127);
});

child.on('exit', (code, signal) => {
  if (signal !== null && signal !== undefined) {
    process.exit(1);
  }
  process.exit(code ?? 0);
});
