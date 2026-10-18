#!/usr/bin/env node
/**
 * Run a command with the repository-root `.env` loaded into the environment.
 *
 * Why this exists:
 *
 * The documented setup (quickstart.md, README.md) is `cp .env.example .env` at the
 * REPOSITORY ROOT, then `npm run db:migrate`. That command runs Prisma with its
 * working directory at `apps/api`, and Prisma loads `.env` only from its schema
 * directory (`apps/api/prisma/.env`) and its working directory (`apps/api/.env`) —
 * it never walks up to the repository root. So a developer who followed the quickstart
 * exactly got "environment variable DATABASE_URL is missing", and the fix the docs
 * suggested (`cp .env.example .env`) did nothing, because it kept writing the file to
 * the place Prisma was not looking.
 *
 * This wrapper loads the root `.env` into `process.env` and then runs the requested
 * command with the same environment, so the documented command and the documented
 * location finally agree. Values already present in the environment win, which keeps
 * CI and the Docker builds — where variables are injected rather than read from a file
 * — working unchanged.
 *
 * It is a thin wrapper on purpose: it does not parse Prisma's output or interpret
 * exit codes, it simply hands the process through and propagates the exit code.
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// `apps/api/scripts` -> `apps/api` -> `apps` -> repository root.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const envPath = join(repoRoot, '.env');

/**
 * Minimal `.env` reader. Deliberately small and dependency-free: it handles the
 * `KEY=value`, `export KEY=value`, and quoted forms that a committed `.env.example`
 * can contain, and ignores comments and blank lines. It does NOT attempt to be a
 * full dotenv implementation — it exists so the Prisma CLI sees DATABASE_URL.
 */
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

    // Strip matching surrounding quotes; keep a value like "a b" intact.
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
    // Never override a variable that is already set: CI and the images inject their
    // own values and must not be overruled by a developer's local file.
    if (environment[key] === undefined) {
      environment[key] = value;
    }
  }
} else {
  console.warn(
    `[with-root-env] ${envPath} not found. Copy .env.example to .env, or set the variables in the environment.`,
  );
}

const [command, ...args] = process.argv.slice(2);

if (command === undefined) {
  console.error('Usage: with-root-env.mjs <command> [args...]');
  process.exit(2);
}

// On Windows a bare command may be a `.cmd`/`.bat` shim, which spawn cannot execute
// directly; `shell: true` lets the platform resolve it.
const child = spawn(command, args, {
  stdio: 'inherit',
  env: environment,
  shell: process.platform === 'win32',
});

child.on('error', (error) => {
  console.error(`[with-root-env] could not run ${command}: ${error.message}`);
  process.exit(127);
});

child.on('exit', (code, signal) => {
  if (signal !== null && signal !== undefined) {
    process.exit(1);
  }
  process.exit(code ?? 0);
});