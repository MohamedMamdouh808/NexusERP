import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from '@jest/globals';

/**
 * T031/T057 follow-up: the migration-history guard needs a database, so it cannot live in
 * `npm run lint`.
 *
 * Wiring it into lint made `lint` require a running PostgreSQL, which meant a developer
 * with no database could not check their code at all, and a CI lint job would have to
 * provision one to run a step that has nothing to do with the database. So the guard
 * moved to `npm run check:migrations`, where a database is a fair requirement, and the
 * gate refuses rather than passing quietly when it cannot run.
 *
 * "Refuses rather than passing quietly" is the whole point: the earlier version exited 0
 * when it had not compared anything.
 */

const apiRoot = join(__dirname, '..', '..');
const scripts = (JSON.parse(readFileSync(join(apiRoot, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
}).scripts;

interface RunResult {
  status: number | null;
  output: string;
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv): RunResult {
  const result = spawnSync(command, args, {
    cwd: apiRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env,
  });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

const baseEnv = (): NodeJS.ProcessEnv => {
  const env = { ...process.env };
  delete env.DATABASE_URL;
  return env;
};

describe('lint does not require a database', () => {
  it('does not run the migration-history guard', () => {
    expect(scripts.lint).not.toContain('check:migration-history');
    expect(scripts.lint).not.toContain('check:migrations');
  });

  it('still runs the schema numeric-type check, which reads no database', () => {
    expect(scripts.lint).toContain('check:schema-numeric-types');
  });

  it('succeeds with no DATABASE_URL and no database', () => {
    const result = run('npm.cmd', ['run', 'lint'], baseEnv());

    expect(result.output).not.toContain('DATABASE_URL');
    expect(result.status).toBe(0);
  }, 300_000);
});

describe('check:migrations requires a database and refuses without one', () => {
  it('is a separate command from lint', () => {
    expect(scripts['check:migrations']).toBeDefined();
  });

  it('fails with a message naming DATABASE_URL when it is not set', () => {
    // The guard is invoked directly, NOT through `npm run check:migrations`, because
    // that command runs with-root-env first and the root `.env` supplies DATABASE_URL.
    // Reaching the "not set" branch therefore means no value from any source, which is
    // what a CI runner without an injected database variable actually looks like.
    const result = run('npx.cmd', ['tsx', 'scripts/check-migration-history.ts'], baseEnv());

    expect(result.status).toBe(1);
    expect(result.output).toContain('DATABASE_URL');
    // The message must say what to do, not merely that something is missing.
    expect(result.output).toMatch(/cannot run|not set|missing/i);
    // And it must not have claimed the history was checked.
    expect(result.output).not.toMatch(/consistent/i);
  }, 180_000);

  it('fails when the database is unreachable rather than reporting it as consistent', () => {
    const result = run('npm.cmd', ['run', 'check:migrations'], {
      ...baseEnv(),
      // Port 1 is reserved and nothing listens on it, so the connection cannot succeed
      // without disturbing the database the other tests are using.
      DATABASE_URL:
        'postgresql://nexuserp:nexuserp@127.0.0.1:1/nexuserp?schema=public&connect_timeout=2',
    });

    expect(result.status).toBe(1);
    expect(result.output).toMatch(/could not|cannot|unreachable|connect/i);
    // Critically: it must not claim the history is consistent.
    expect(result.output).not.toMatch(/consistent/i);
  }, 180_000);
});

describe('the integration suite runs the guard before the tests', () => {
  it('check:migrations runs as a pretest for test:integration', () => {
    expect(scripts['pretest:integration']).toContain('check:migrations');
  });

  it('test:integration itself has no duplicate inline invocation', () => {
    expect(scripts['test:integration']).not.toContain('check:migrations');
  });
});