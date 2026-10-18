import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { ERROR_CODES } from '@nexuserp/shared';
import { ProbeModule } from '../fixtures/probe.controllers';
import { createTestApp, HEALTH_URL, type TestApp } from '../fixtures/app';

/**
 * T106, Constitution Principle II: "An endpoint without a declared permission MUST fail
 * the test suite."
 *
 * This file IS that test. It builds a probe module carrying the real PermissionGuard and
 * four routes: undeclared, explicitly public, declared with a real permission, and declared
 * with a permission that does not exist.
 *
 * The failure mode this guards against is a developer adding a route, forgetting the
 * decorator, and shipping an endpoint that anyone can call. Default deny turns that into a
 * 403 they notice immediately.
 */
describe('default deny (T106, Constitution Principle II)', () => {
  let probe: INestApplication;
  let server: Server;

  async function createProbe(): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({ imports: [ProbeModule] }).compile();
    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    return app;
  }

  beforeAll(async () => {
    probe = await createProbe();
    server = probe.getHttpServer();
  });

  afterAll(async () => {
    await probe?.close();
  });

  it('denies a route that declares no permission', async () => {
    const response = await request(server).get('/api/v1/undeclared').expect(403);
    expect(response.body.code).toBe(ERROR_CODES.FORBIDDEN);
  });

  it('allows a route that explicitly opts out with @Public()', async () => {
    await request(server).get('/api/v1/declared-public').expect(200);
  });

  it('denies a route whose declared permission the caller does not hold', async () => {
    // No session exists yet, so the effective permission set is empty and a DECLARED route
    // is still denied - for the right reason: no session means no permissions.
    const response = await request(server).get('/api/v1/declared-permission').expect(403);
    expect(response.body.code).toBe(ERROR_CODES.FORBIDDEN);
  });

  it('denies a route declaring a permission that is not in the catalog', async () => {
    const response = await request(server).get('/api/v1/bad-permission').expect(403);
    expect(response.body.code).toBe(ERROR_CODES.FORBIDDEN);
  });

  it('returns 403, never 404, for a permission denial', async () => {
    // The distinction is load-bearing: 403 means "you are known and you may not", while
    // 404 is reserved for "no such record in YOUR organization" so it cannot leak the
    // existence of another organization's data.
    const response = await request(server).get('/api/v1/undeclared').expect(403);
    expect(response.status).not.toBe(404);
  });

  it('returns the standard envelope for the denial (FR-021)', async () => {
    const response = await request(server).get('/api/v1/undeclared').expect(403);
    expect(Object.keys(response.body).sort()).toEqual(['code', 'details', 'message', 'requestId']);
  });
});

/**
 * FR-055a: this feature MUST make no outbound request to any analytics, monitoring, or
 * other third-party service - on the success path OR the failure path.
 *
 * Two halves: the behavioural one (nothing is attempted) and the structural one (no such
 * client is installed at all).
 */
describe('no third-party egress (T046, FR-055a)', () => {
  let context: TestApp;
  let server: Server;
  let restoreFetch: () => void;
  const outbound: string[] = [];

  beforeAll(async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as { fetch?: typeof fetch }).fetch = ((input: unknown, ...rest: unknown[]) => {
      outbound.push(String(input));
      return (originalFetch as (...args: unknown[]) => Promise<unknown>)(input, ...rest);
    }) as typeof fetch;

    restoreFetch = () => {
      (globalThis as { fetch?: typeof fetch }).fetch = originalFetch;
    };

    context = await createTestApp();
    server = context.app.getHttpServer();
  });

  afterAll(async () => {
    restoreFetch?.();
    await context?.close();
  });

  it('makes no outbound call while handling a successful request', async () => {
    outbound.length = 0;
    await request(server).get(HEALTH_URL).expect(200);
    expect(outbound.filter((url) => !/127\.0\.0\.1|localhost/.test(url))).toEqual([]);
  });

  it('makes no outbound call while handling a failure', async () => {
    outbound.length = 0;
    await request(server).get('/api/v1/no-such-route').expect(404);
    expect(outbound.filter((url) => !/127\.0\.0\.1|localhost/.test(url))).toEqual([]);
  });

  it('declares no monitoring or analytics dependency', async () => {
    // The structural half of the guarantee: no such client is even installed, so there is
    // nothing to misconfigure.
    const pkg = (await import('../../package.json')) as {
      default?: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    };
    const declared = {
      ...(pkg.default?.dependencies ?? {}),
      ...(pkg.default?.devDependencies ?? {}),
    };
    for (const name of ['posthog-js', '@sentry/node', 'axios', 'node-fetch', 'openai', 'datadog']) {
      expect(Object.keys(declared)).not.toContain(name);
    }
  });
});
