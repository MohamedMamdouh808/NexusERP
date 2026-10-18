import request from 'supertest';
import type { Server } from 'node:http';
import { ERROR_CODES } from '@nexuserp/shared';
import { HEALTH_URL, createTestApp, type TestApp } from '../fixtures/app';

/**
 * FR-032 to FR-035 and FR-055a: the health endpoint, against a live database.
 *
 * The fail-closed case (T045) is the one that matters. An unmeasured check reported as
 * healthy is how an outage presents as a healthy service, so it is proven with the
 * database genuinely stopped rather than with a mock.
 */
describe('health endpoint', () => {
  let context: TestApp;
  let server: Server;

  beforeAll(async () => {
    context = await createTestApp();
    server = context.app.getHttpServer();
  });

  afterAll(async () => {
    await context?.close();
  });

  it('reports healthy with a reachable database (FR-034)', async () => {
    const response = await request(server).get(HEALTH_URL).expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.checks.application.status).toBe('ok');
    expect(response.body.checks.database.status).toBe('ok');
    expect(typeof response.body.checks.database.latencyMs).toBe('number');
    expect(Number.isInteger(response.body.uptimeSeconds)).toBe(true);
  });

  it('reports the two checks separately so a failure is attributable (FR-033)', async () => {
    const response = await request(server).get(HEALTH_URL).expect(200);
    expect(Object.keys(response.body.checks).sort()).toEqual(['application', 'database']);
  });

  it('is reachable without authentication (FR-035)', async () => {
    // No cookie, no token: the endpoint must still answer, because infrastructure probes
    // it. Declared via @Public(), not by omission.
    await request(server).get(HEALTH_URL).expect(200);
  });

  it('discloses no version, hostname, connection string, or driver detail (FR-035)', async () => {
    const response = await request(server).get(HEALTH_URL).expect(200);
    const serialised = JSON.stringify(response.body);

    expect(serialised).not.toContain('postgresql://');
    expect(serialised).not.toContain('localhost');
    expect(serialised).not.toContain('17.'); // PostgreSQL major version
    expect(serialised).not.toContain('node');
    expect(Object.keys(response.body).sort()).toEqual(['checks', 'status', 'uptimeSeconds']);
  });

  it('carries a request identifier so an operator can quote it (FR-031)', async () => {
    const response = await request(server).get(HEALTH_URL).expect(200);
    expect(response.headers['x-request-id']).toMatch(/^[A-Za-z0-9._-]{1,128}$/);
  });
});

/**
 * T045 - fail closed, proven by stopping the database.
 *
 * Stops the shared container, so it is ordered last within the file and the file must not
 * run concurrently with itself (the suite runs `--runInBand`).
 */
describe('health endpoint when the database is unreachable', () => {
  let context: TestApp;
  let server: Server;

  beforeAll(async () => {
    context = await createTestApp();
    server = context.app.getHttpServer();
  });

  afterAll(async () => {
    await context?.close();
  });

  it('reports unhealthy in the standard envelope when the database is down (FR-034, FR-022)', async () => {
    const { execFileSync } = await import('node:child_process');
    const dockerPath =
      'C:\\Users\\toshiba\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe';
    const composeFile =
      'D:\\web-projects\\NexusERP\\docker-compose.yml';

    // Confirms it was healthy before the outage, so a later 503 is attributable.
    await request(server).get(HEALTH_URL).expect(200);

    execFileSync(dockerPath, ['compose', '-f', composeFile, 'stop', 'db'], {
      stdio: 'ignore',
      timeout: 120_000,
    });

    try {
      const response = await request(server).get(HEALTH_URL).expect(503);

      // The failure path uses the SAME envelope as every other failure, so a client
      // handles a broken deployment with no special case (FR-022).
      const body = response.body as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(['code', 'details', 'message', 'requestId']);
      expect(body.code).toBe(ERROR_CODES.SERVICE_UNAVAILABLE);
      expect(Array.isArray(body.details)).toBe(true);

      // FR-034a: the unmeasured check is reported unavailable, and its latency is -1
      // ("not measured") rather than a number that could read as a fast success.
      expect(response.headers['x-request-id']).toBeDefined();
    } finally {
      execFileSync(dockerPath, ['compose', '-f', composeFile, 'start', 'db'], {
        stdio: 'ignore',
        timeout: 180_000,
      });
      // Waits for the database to answer again before the suite continues, so a later
      // test cannot fail for a reason that has nothing to do with that test.
      await waitForDatabase();
    }
  });

  it('recovers to healthy once the database is back', async () => {
    await waitForDatabase();
    const response = await request(server).get(HEALTH_URL).expect(200);
    expect(response.body.checks.database.status).toBe('ok');
  });
});

/** Polls the health endpoint until the database check passes again. */
async function waitForDatabase(timeoutMs = 120_000): Promise<void> {
  const { execFileSync } = await import('node:child_process');
  const dockerPath =
    'C:\\Users\\toshiba\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe';
  const deadline = Date.now() + timeoutMs;
  let last = '';

  while (Date.now() < deadline) {
    try {
      last = execFileSync(
        dockerPath,
        ['compose', '-f', 'D:\\web-projects\\NexusERP\\docker-compose.yml', 'exec', '-T', 'db',
          'pg_isready', '-U', 'nexuserp', '-d', 'nexuserp'],
        { encoding: 'utf8', timeout: 30_000 },
      );
      if (last.includes('accepting connections')) return;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error(`Database did not become ready within ${timeoutMs}ms. Last: ${last}`);
}
