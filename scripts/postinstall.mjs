#!/usr/bin/env node
/**
 * Generate the Prisma client after a clean install (T-hardening, A1).
 *
 * Why this exists:
 *
 * `npm ci` replaces the whole of `node_modules`, including the generated client in
 * `node_modules/.prisma/client`. Nothing in the dependency tree regenerates it, so a
 * clean clone ends up with every Prisma model typed as `any`. The type checker then
 * reports errors that do not exist in the code — measured on this repository: eight
 * phantom `TS7006` (implicit any) and `TS2347` (untyped call) failures in
 * `prisma/seed.ts` and the integration fixtures. `prisma generate` clears all eight
 * without touching a single source file.
 *
 * Because the failure mode is "the type checker is wrong", not "the build is broken",
 * it is easy to spend an afternoon editing correct code. Generating automatically on
 * install removes the trap.
 *
 * Why it can silently skip:
 *
 * Both Dockerfiles copy the workspace manifests and the lockfile first and run `npm ci`
 * before the sources, so the dependency layer stays cached. This hook therefore runs in
 * the image with no schema on disk. It must not fail there. The Dockerfile runs
 * `prisma generate` explicitly once the sources are copied, so the client is still
 * present in the build stage.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const SCHEMA = join('database', 'prisma', 'schema.prisma');

if (!existsSync(SCHEMA)) {
  console.log(
    'postinstall: database/prisma/schema.prisma is not present yet, so prisma generate is ' +
      'skipped. This is expected when installing manifests before sources, as the Dockerfiles do.',
  );
  process.exit(0);
}

// On Windows `npx` is `npx.cmd`, which Node cannot spawn directly without a shell.
const result = spawnSync('npx', ['prisma', 'generate', '--schema', SCHEMA], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) {
  console.error(`postinstall: could not run prisma generate: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
