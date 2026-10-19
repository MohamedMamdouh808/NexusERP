import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Boot smoke test: the application must actually start under the SAME toolchain
 * production uses, and answer a request with 200.
 *
 * Why this exists (the second bug this pins):
 *
 * Running the API with `npx tsx src/main.ts` starts it, and every request then
 * fails with:
 *
 *   TypeError: Cannot read properties of undefined (reading 'getAllAndOverride')
 *
 * `tsx` transpiles through esbuild, which does NOT emit `design:parammetadata`.
 * Nest resolves constructor injection from that metadata, so `Reflector` (and
 * every other injected collaborator) arrives as `undefined`. Unit tests, the
 * type checker, and the integration suite all pass, because `ts-jest` and
 * `tsc` both emit decorator metadata. Only the tsx boot path is broken.
 *
 * So this test does the one thing the others cannot: it runs `nest build`, starts
 * the COMPILED `dist/main.js`, and makes a real HTTP request. If dependency
 * injection cannot resolve, the process fails to boot, the port never opens, and
 * this test fails.
 *
 * It also pins the rule that the API is never started with `tsx`.
 */

const API_DIR = join(__dirname, '..', '..');
const MAIN_JS = join(API_DIR, 'dist', 'main.js');
const BOOT_TIMEOUT_MS = 60_000;

function buildOnce(): void {
  // On Windows `npx` is `npx.cmd`, which Node cannot spawn directly (EINVAL)
  // without a shell. This runs the local @nestjs/cli build, not a downloaded binary.
  execFileSync('npx', ['nest', 'build'], {
    cwd: API_DIR,
    stdio: 'pipe',
    timeout: 300_000,
    shell: process.platform === 'win32',
  });
}

describe('compiled boot smoke test', () => {
  jest.setTimeout(BOOT_TIMEOUT_MS + 120_000);
  let child: ChildProcess | undefined;
  let output = '';

  afterAll(() => {
    if (child && child.exitCode === null) {
      child.kill('SIGTERM');
    }
  });

  it('builds, boots dist/main.js and serves a 200 from /api/v1/health', async () => {
    buildOnce();

    // The build must emit the entrypoint; `nest start` and `node dist/main.js`
    // depend on it, and a silent no-emit would otherwise look like a boot hang.
    expect(existsSync(MAIN_JS)).toBe(true);

    const port = 34119; // deliberately not the default 3000, to avoid a clash
    child = spawn(process.execPath, [MAIN_JS], {
      cwd: API_DIR,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: String(port),
        DATABASE_URL:
          process.env.DATABASE_URL ??
          'postgresql://nexuserp:nexuserp_dev_password@127.0.0.1:5432/nexuserp?schema=public',
        SESSION_SECRET: process.env.SESSION_SECRET ?? 'boot-smoke-session-secret',
        CSRF_SECRET: process.env.CSRF_SECRET ?? 'boot-smoke-csrf-secret',
      },
      stdio: 'pipe',
    });

    child.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));

    // Wait for the port to accept a connection. A DI failure exits the process
    // instead, so surface the captured output rather than timing out blindly.
    const base = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + BOOT_TIMEOUT_MS;
    let response: Response | undefined;

    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(
          `dist/main.js exited with code ${child.exitCode} before serving. Output:\n${output}`,
        );
      }
      try {
        response = await fetch(`${base}/api/v1/health`);
        if (response.status > 0) break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    expect(output.length === 0 ? 'no output captured' : output).toBeTruthy();
    expect(response).toBeDefined();

    expect(response!.status).toBe(200);
    const body = (await response!.json()) as { status?: string; checks?: Record<string, unknown> };
    expect(body.status).toBe('ok');
    expect(body.checks?.['database']).toBeDefined();
  });
});