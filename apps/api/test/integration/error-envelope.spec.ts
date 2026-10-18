import request from 'supertest';
import type { Server } from 'node:http';
import { ERROR_CODES } from '@nexuserp/shared';
import { HEALTH_URL, createTestApp, type TestApp } from '../fixtures/app';

/**
 * FR-028 to FR-031, FR-021 to FR-026, and FR-044: the error envelope and request
 * identifier, proven over HTTP against a real application.
 *
 * These are the tests that were blocked without a database. They exercise the real global
 * filter and the real middleware, because a unit test of the classifier cannot prove that
 * a NestJS pipeline actually routes a thrown error through it.
 */
describe('error envelope and request identifiers (HTTP)', () => {
  let context: TestApp;
  let server: Server;

  beforeAll(async () => {
    context = await createTestApp();
    server = context.app.getHttpServer();
  });

  afterAll(async () => {
    await context?.close();
  });

  // A route that does not exist: the guard runs before routing completes, so this is the
  // cheapest way to produce a real failure response.
  it('returns exactly the four envelope fields for a failure (FR-021)', async () => {
    const response = await request(server).get('/api/v1/no-such-route').expect(404);

    const body = response.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['code', 'details', 'message', 'requestId']);
    expect(body.code).toBe(ERROR_CODES.NOT_FOUND);
  });

  it('always includes a details array, empty rather than absent (FR-023)', async () => {
    const response = await request(server).get('/api/v1/no-such-route');
    expect(Array.isArray(response.body.details)).toBe(true);
  });

  it('echoes a supplied request identifier in the header and the envelope (FR-028)', async () => {
    const response = await request(server)
      .get('/api/v1/no-such-route')
      .set('x-request-id', 'client-supplied-id');

    expect(response.headers['x-request-id']).toBe('client-supplied-id');
    expect(response.body.requestId).toBe('client-supplied-id');
  });

  it('generates an identifier when none is supplied (FR-029)', async () => {
    const response = await request(server).get('/api/v1/no-such-route');
    expect(response.headers['x-request-id']).toMatch(/^[A-Za-z0-9._-]{1,128}$/);
    expect(response.body.requestId).toBe(response.headers['x-request-id']);
  });

  it('replaces a malformed identifier rather than failing the request (FR-030)', async () => {
    // A hostile tracing header is a client defect, not a reason to fail a business
    // operation - and rejecting it would let an unauthenticated caller provoke a 400 at
    // will. The value is replaced instead.
    //
    // NOTE: control characters are absent from this list deliberately. Node's HTTP client
    // refuses to TRANSMIT them ("Invalid character in header content"), so they can never
    // reach the server from a conforming client. Server-side handling of a newline is
    // proven in the unit tests, which call the sanitizer directly with such a value.
    const hostile = [
      'has spaces',
      'a'.repeat(200),
      'has"double-quotes',
      'has;semicolon',
      'has%percent',
      '',
    ];

    for (const value of hostile) {
      const response = await request(server).get('/api/v1/no-such-route').set('x-request-id', value);

      expect(response.status).toBe(404);
      expect(response.headers['x-request-id']).not.toBe(value);
      expect(response.headers['x-request-id']).toMatch(/^[A-Za-z0-9._-]{1,128}$/);
      expect(response.body.requestId).toBe(response.headers['x-request-id']);
    }
  });

  it('keeps the envelope identifier identical to the response header (FR-043)', async () => {
    const response = await request(server)
      .get('/api/v1/no-such-route')
      .set('x-request-id', 'correlation-check');
    expect(response.body.requestId).toBe(response.headers['x-request-id']);
    expect(response.body.requestId).toBe('correlation-check');
  });

  it('never leaks internals in a failure response (FR-026)', async () => {
    const response = await request(server).get('/api/v1/no-such-route');
    const serialised = JSON.stringify(response.body);

    expect(serialised).not.toContain('/app/');
    expect(serialised).not.toContain('node_modules');
    expect(serialised).not.toContain('at Object.');
    expect(serialised).not.toContain('postgresql://');
  });

  it('is served under the versioned prefix (PRD 9.5)', async () => {
    await request(server).get(HEALTH_URL).expect(200);
    await request(server).get('/health').expect(404);
  });
});
