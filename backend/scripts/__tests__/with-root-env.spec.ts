import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from '@jest/globals';

/**
 * with-root-env.mjs sits in front of every command that reads configuration, so its
 * contract matters more than its size:
 *
 *  1. A REAL environment variable wins over the file. CI and the container images inject
 *     DATABASE_URL and friends directly; a developer's local `.env` must not silently
 *     override them, or a green pipeline can be testing the wrong database.
 *  2. It never prints a value. It reads secrets by design, so anything it logged would be
 *     a disclosure channel.
 *  3. A missing `.env` does not fail commands that do not need one. `npm run build` must
 *     keep working on a fresh checkout.
 */

const repoRoot = resolve(__dirname, '..', '..', '..');
const loader = join(repoRoot, 'scripts', 'with-root-env.mjs');

const created: string[] = [];

afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});

interface RunResult {
  status: number | null;
  output: string;
}

/**
 * A probe that prints one environment variable, delimited so an EMPTY value is
 * distinguishable from an absent one.
 *
 * It is a file rather than an inline `node -e` script on purpose: on Windows the loader
 * runs its child through a shell, and shell quoting mangles `??` and embedded quotes in
 * an inline script, producing failures that look like loader bugs and are not.
 */
function probeFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'env-probe-'));
  created.push(dir);
  const file = join(dir, 'probe.mjs');
  writeFileSync(
    file,
    'const name = process.argv[2];\n' +
      'const value = Object.prototype.hasOwnProperty.call(process.env, name)\n' +
      '  ? process.env[name]\n' +
      '  : undefined;\n' +
      'process.stdout.write(value === undefined ? "<ABSENT>" : "[" + value + "]");\n',
    'utf8',
  );
  return file;
}

const PROBE = probeFile();

function scriptFile(name: string, body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'env-child-'));
  created.push(dir);
  const file = join(dir, name);
  writeFileSync(file, body, 'utf8');
  return file;
}

/**
 * Children are invoked as FILES, never as `node -e "..."`. On Windows the loader runs
 * its child through cmd.exe, which passes the quotes through to node, so an inline
 * script can be evaluated as a string literal instead of code - producing an exit code
 * that looks like a loader bug and is not.
 */
const NOOP = scriptFile('noop.mjs', 'process.exit(0);\n');
const EXIT_THREE = scriptFile('exit3.mjs', 'process.exit(3);\n');

function run(
  args: string[],
  env: NodeJS.ProcessEnv,
  script: string = loader,
  cwd: string = repoRoot,
): RunResult {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env,
  });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

/** Prints the named variable through the loader. */
function readThroughLoader(name: string, env: NodeJS.ProcessEnv): RunResult {
  return run(['node', PROBE, name], env);
}

/**
 * A copy of the loader inside a throwaway tree. The script resolves the repository root
 * from its OWN location, so placing it at <tmp>/scripts makes it look for
 * <tmp>/.env - which does not exist. That is the only honest way to exercise the
 * missing-file path without deleting the developer's real `.env`.
 */
function loaderInEmptyTree(): { script: string; cwd: string; root: string } {
  const root = mkdtempSync(join(tmpdir(), 'with-root-env-'));
  created.push(root);
  const scriptsDir = join(root, 'scripts');
  mkdirSync(scriptsDir, { recursive: true });
  const script = join(scriptsDir, 'with-root-env.mjs');
  copyFileSync(loader, script);
  return { script, cwd: root, root };
}

describe('real environment variables take precedence over the file', () => {
  it('passes an injected DATABASE_URL through untouched', () => {
    const injected = 'postgresql://ci:ci@ci-host:5432/ci?schema=public';

    const result = readThroughLoader('DATABASE_URL', { ...process.env, DATABASE_URL: injected });

    expect(result.output).toContain(injected);
    // The repository's own .env points somewhere else; it must not win.
    expect(result.output).not.toContain('127.0.0.1:5432');
  }, 60_000);

  it('treats an empty real variable as a real value rather than replacing it', () => {
    // An empty string is a decision someone made deliberately (an optional secret, a
    // feature switched off). Substituting the file's value would hide that decision.
    const result = readThroughLoader('LOG_LEVEL', { ...process.env, LOG_LEVEL: '' });

    expect(result.output).toContain('[]');
  }, 60_000);
});

describe('the loader never prints a value', () => {
  it('emits no variable value of its own while loading the file', () => {
    // The child here prints nothing, so anything in the output came from the loader.
    // Using the probe here would be wrong: the probe exists precisely to print a value,
    // so finding DATABASE_URL in its output says nothing about the loader.
    const result = run(['node', NOOP], { ...process.env });

    for (const key of ['DATABASE_URL', 'SESSION_SECRET', 'CSRF_SECRET'] as const) {
      const value = process.env[key];
      if (value !== undefined && value.length > 0) {
        expect(result.output).not.toContain(value);
      }
    }

    // The password specifically, in case a future change logs the URL but redacts it.
    const credentials = (process.env.DATABASE_URL ?? '').replace(/^[^:]+:\/\/[^@]*@/, '');
    if (credentials.length > 0) {
      expect(result.output).not.toContain(credentials);
    }

    expect(result.status).toBe(0);
  }, 60_000);

  it('does not print values from the file either', () => {
    const { script, cwd, root } = loaderInEmptyTree();
    writeFileSync(
      join(root, '.env'),
      'A_SECRET_ONLY_IN_THE_FILE=do-not-print-me-anywhere\n',
      'utf8',
    );

    const result = run(['node', NOOP], { ...process.env }, script, cwd);

    expect(result.output).not.toContain('do-not-print-me-anywhere');
    expect(result.status).toBe(0);
  }, 60_000);
});

describe('a missing .env does not fail commands that do not need one', () => {
  it('runs the command successfully and reports the file is absent', () => {
    const { script, cwd } = loaderInEmptyTree();

    const result = run(['node', PROBE, 'PATH'], { ...process.env }, script, cwd);

    expect(result.status).toBe(0);
    expect(result.output).toContain('.env');
    // PATH is inherited, so the child ran.
    expect(result.output).not.toContain('<ABSENT>');
  }, 60_000);

  it('does not mask a command failure', () => {
    const { script, cwd } = loaderInEmptyTree();

    const result = run(['node', EXIT_THREE], { ...process.env }, script, cwd);
    expect(result.status).toBe(3);
  }, 60_000);

  it('reports a command that does not exist as a non-zero exit', () => {
    const { script, cwd } = loaderInEmptyTree();

    const result = run(['definitely-not-a-real-command-xyz'], { ...process.env }, script, cwd);
    expect(result.status).not.toBe(0);
  }, 60_000);
});

describe('the loader reads the file it is supposed to read', () => {
  it('supplies a variable that is absent from the environment', () => {
    const { script, cwd, root } = loaderInEmptyTree();
    writeFileSync(join(root, '.env'), 'WITH_ROOT_ENV_PROBE=from-the-file\n', 'utf8');

    const env = { ...process.env } as Record<string, string | undefined>;
    delete env.WITH_ROOT_ENV_PROBE;
    const result = run(['node', PROBE, 'WITH_ROOT_ENV_PROBE'], env, script, cwd);

    expect(result.output).toContain('from-the-file');
  }, 60_000);

  it('lets the file lose to a real variable even in the same tree', () => {
    const { script, cwd, root } = loaderInEmptyTree();
    writeFileSync(join(root, '.env'), 'WITH_ROOT_ENV_PROBE=from-the-file\n', 'utf8');

    const result = run(['node', PROBE, 'WITH_ROOT_ENV_PROBE'], {
      ...process.env,
      WITH_ROOT_ENV_PROBE: 'from-the-environment',
    }, script, cwd);

    expect(result.output).toContain('from-the-environment');
    expect(result.output).not.toContain('from-the-file');
  }, 60_000);
});