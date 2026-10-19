import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

/**
 * T114: a failed migration must be a FAILED CONTAINER, not a half-migrated service that
 * then serves traffic.
 *
 * The entrypoint runs `npx prisma migrate deploy` under `set -e` and only then
 * `exec node dist/main.js`. If `set -e` were missing, or the migration failure were
 * swallowed, the container would start and serve requests against a database whose schema
 * does not match the code - the worst possible outcome, because it looks healthy.
 *
 * This is a real container test: it builds the API image, starts its own throwaway
 * PostgreSQL, injects a broken migration, runs the container, and asserts BOTH that the
 * process exited non-zero and that nothing listened on the mapped port. The second
 * assertion is the one that matters: a non-zero exit alone could be the entrypoint
 * crashing for an unrelated reason.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const DOCKER =
  'C:\\Users\\toshiba\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe';

const IMAGE_TAG = 'nexuserp-api:entrypoint-probe';
const DB_NAME = 'nexuserp-entrypoint-probe-db';
const DB_PORT = 15432;
const APP_PORT = 19100;

function docker(args: string[]): string {
  const result = spawnSync(DOCKER, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(`docker ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`);
  }
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

describe('entrypoint fails fast on a bad migration (T114, T033)', () => {
  const workDir = mkdtempSync(join(tmpdir(), 'entrypoint-probe-'));

  beforeAll(async () => {
    // A throwaway database, so this test never touches the shared one. Removed first so
    // a leftover from an interrupted run cannot make `docker run` fail on the name.
    docker(['rm', '-f', DB_NAME]);
    docker([
      'run', '-d', '--name', DB_NAME,
      '-e', 'POSTGRES_USER=probe',
      '-e', 'POSTGRES_PASSWORD=probe',
      '-e', 'POSTGRES_DB=probe',
      '-p', `${DB_PORT}:5432`,
      'postgres:17-alpine',
    ]);

    // Wait for it to accept connections. Postgres 17-alpine runs initdb on first start,
    // which measured 21s here; the budget is generous and the failure names the last
    // pg_isready output rather than just timing out.
    const deadline = Date.now() + 120_000;
    let last = '';
    for (;;) {
      const ready = spawnSync(DOCKER, [
        'exec', DB_NAME, 'pg_isready', '-h', 'localhost', '-U', 'probe', '-d', 'probe',
      ], { encoding: 'utf8', shell: process.platform === 'win32' });
      last = `${ready.stdout ?? ''}${ready.stderr ?? ''}`.trim();
      if (ready.status === 0) break;
      if (Date.now() > deadline) {
        throw new Error(`probe database did not become ready; last pg_isready: ${last}`);
      }
      await new Promise((r) => setTimeout(r, 2_000));
    }

    // A migrations directory containing ONLY a migration whose SQL cannot apply.
    // Replacing the directory rather than adding to it makes the failure the first thing
    // `migrate deploy` does, which keeps the test fast and unambiguous.
    const broken = join(workDir, 'prisma', 'migrations', '00000000000001_broken');
    mkdirSync(broken, { recursive: true });
    writeFileSync(join(broken, 'migration.sql'), 'THIS IS NOT VALID SQL;\n', 'utf8');

    docker(['build', '-f', 'docker/backend.Dockerfile', '-t', IMAGE_TAG, '.']);
  }, 600_000);

  afterAll(() => {
    docker(['rm', '-f', DB_NAME]);
    docker(['rmi', '-f', IMAGE_TAG]);
    rmSync(workDir, { recursive: true, force: true });
  });

  it('exits non-zero and never opens a listener when the migration cannot apply', () => {
    const result = spawnSync(DOCKER, [
      'run', '--rm',
      '--name', 'nexuserp-entrypoint-probe-run',
      '-p', `${APP_PORT}:3000`,
      '-e', `DATABASE_URL=postgresql://probe:probe@127.0.0.1:${DB_PORT}/probe?schema=public`,
      '-v', `${join(workDir, 'prisma', 'migrations')}:/app/database/prisma/migrations`,
      IMAGE_TAG,
    ], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
    });

    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

    // A failed migration must fail the container.
    expect(result.status).not.toBe(0);
    // And it must not have started the server, which is what "failed fast" means.
    expect(output).not.toMatch(/Service listening/i);
  });

  it('does not leave a listener on the mapped port', () => {
    // The container above has exited by now. If it had started the server despite the
    // failed migration, something would still be listening here.
    const probe = spawnSync('curl.exe', [
      '-s', '-o', 'NUL', '-w', '%{http_code}',
      '--max-time', '5',
      `http://127.0.0.1:${APP_PORT}/api/v1/health`,
    ], { encoding: 'utf8', shell: process.platform === 'win32' });

    // curl exit 7 = connection refused. Any HTTP response would mean the server started.
    expect(probe.status).toBe(7);
  });

  it('still boots normally when the migrations apply cleanly', async () => {
    // The negative case above proves it refuses; this proves the same image is not simply
    // broken. With the real migrations directory it must listen and answer.
    const result = spawnSync(DOCKER, [
      'run', '-d',
      '--name', 'nexuserp-entrypoint-probe-ok',
      '-p', `${APP_PORT}:3000`,
      '-e', `DATABASE_URL=postgresql://probe:probe@127.0.0.1:${DB_PORT}/probe?schema=public`,
      IMAGE_TAG,
    ], { encoding: 'utf8', shell: process.platform === 'win32' });

    expect(result.status).toBe(0);

    try {
      const deadline = Date.now() + 90_000;
      let healthy = false;
      for (;;) {
        const probe = spawnSync('curl.exe', [
          '-s', '--max-time', '5', `http://127.0.0.1:${APP_PORT}/api/v1/health`,
        ], { encoding: 'utf8', shell: process.platform === 'win32' });

        if (probe.status === 0 && (probe.stdout ?? '').includes('"status":"ok"')) {
          healthy = true;
          break;
        }
        if (Date.now() > deadline) break;
        await new Promise((r) => setTimeout(r, 2_000));
      }

      expect(healthy).toBe(true);
    } finally {
      docker(['rm', '-f', 'nexuserp-entrypoint-probe-ok']);
    }
  }, 180_000);
});