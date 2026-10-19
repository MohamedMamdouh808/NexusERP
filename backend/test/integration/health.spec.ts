import request from 'supertest';
import type { Server } from 'node:http';
import { HEALTH_URL, createTestApp, type TestApp } from '../fixtures/app';

/**
 * FR-032 to FR-035: the health endpoint, against a live database.
 *
 * The fail-closed case (an unreachable database reported as unhealthy rather than as a
 * healthy service) used to be proven here by stopping the database the suite ran against.
 * That mechanism is gone, so the case is no longer covered by this file. Restoring it
 * needs a database the suite can take offline, which the managed staging provider does
 * not offer.
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

