#!/usr/bin/env node
/**
 * Host guard for `db:reset`.
 *
 * `prisma migrate reset --force` drops every table in the target database. It must
 * never run against a managed or production database (Supabase, staging, production).
 * This guard refuses unless the DATABASE_URL host is localhost or 127.0.0.1.
 *
 * The package.json `db:reset` script chains this guard with `prisma migrate reset
 * --force` via `&&`, so prisma only runs when the guard exits 0.
 *
 * Usage: `tsx scripts/db-reset-guard.ts` (exits 0 if the host is allowed, 1 if not).
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(__dirname, '..', '..');
const envPath = join(repoRoot, '.env');

function parseEnvFile(contents: string): Record<string, string> {
  const result: Record<string, string> = {};

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
}

const databaseUrl = environment.DATABASE_URL;

if (!databaseUrl) {
  console.error(
    'db:reset: refused — DATABASE_URL is not set. ' +
      'Copy .env.example to .env and set DATABASE_URL, then re-run.',
  );
  process.exit(1);
}

// Extract the host from postgresql://user:password@host:port/database
let host: string | null = null;
const match = databaseUrl.match(/^postgres(?:ql)?:\/\/[^@]+@([^:/:]+)(?::\d+)?\//);
if (match) {
  host = match[1] ?? null;
}

const allowedHosts = ['localhost', '127.0.0.1'];

if (host === null || !allowedHosts.includes(host)) {
  // Mask the password in the diagnostic: show only host and database name.
  const masked = databaseUrl.replace(/postgres(?:ql)?:\/\/([^:]+):[^@]+@/, 'postgresql://$1:[redacted]@');
  console.error(
    `db:reset: refused — DATABASE_URL host "${host ?? '(unknown)'}" is not localhost or 127.0.0.1. ` +
      `Resolved URL (password masked): ${masked}`,
  );
  process.exit(1);
}

console.log(`db:reset: host "${host}" is allowed.`);
