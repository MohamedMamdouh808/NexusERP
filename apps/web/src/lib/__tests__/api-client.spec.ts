import { describe, expect, it, vi } from 'vitest';

import { parseRetryAfter, requestJson } from '../api-client';
import { jsonResponse } from '../../test/render';

describe('parseRetryAfter', () => {
  it('reads a number of seconds', () => {
    expect(parseRetryAfter('30')).toBe(30);
    expect(parseRetryAfter('0')).toBe(0);
    expect(parseRetryAfter(' 45 ')).toBe(45);
  });

  it('reads an HTTP date as the remaining time', () => {
    const now = new Date('2026-10-18T10:00:00Z');
    expect(parseRetryAfter('Sun, 18 Oct 2026 10:00:30 GMT', now)).toBe(30);
  });

  it('returns null rather than a useless number for a value it cannot trust', () => {
    expect(parseRetryAfter(null)).toBe(null);
    expect(parseRetryAfter('')).toBe(null);
    expect(parseRetryAfter('-5')).toBe(null);
    expect(parseRetryAfter('soon')).toBe(null);
    expect(parseRetryAfter('1.5')).toBe(null);
  });

  it('never returns a negative wait for a date already in the past', () => {
    const now = new Date('2026-10-18T10:00:00Z');
    expect(parseRetryAfter('Sun, 18 Oct 2026 09:59:00 GMT', now)).toBe(0);
  });
});

describe('requestJson (T049)', () => {
  it('returns the parsed body on success', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ status: 'ok' }));

    const result = await requestJson<{ status: string }>('/api/v1/health', {}, fetchImpl as never);

    expect(result).toEqual({ ok: true, data: { status: 'ok' } });
  });

  it('maps a 429 into the envelope, keeping the code, the identifier and Retry-After', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        {
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many requests. Please wait a moment and try again.',
          details: [],
          requestId: 'req-429-0001',
        },
        { status: 429, headers: { 'retry-after': '30', 'x-request-id': 'req-header-0002' } },
      ),
    );

    const result = await requestJson('/api/v1/health', {}, fetchImpl as never);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a failure');
    expect(result.failure.code).toBe('TOO_MANY_REQUESTS');
    expect(result.failure.status).toBe(429);
    expect(result.failure.retryAfterSeconds).toBe(30);
    // The body's identifier wins: it is the one the service logged.
    expect(result.failure.requestId).toBe('req-429-0001');
  });

  it('falls back to the response header identifier when the body is not the envelope', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('<html>502 Bad Gateway</html>', {
          status: 502,
          headers: { 'content-type': 'text/html', 'x-request-id': 'req-header-0003' },
        }),
    );

    const result = await requestJson('/api/v1/health', {}, fetchImpl as never);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a failure');
    expect(result.failure.status).toBe(502);
    expect(result.failure.requestId).toBe('req-header-0003');
    expect(result.failure.code).toBe('INTERNAL_ERROR');
    expect(result.failure.retryAfterSeconds).toBe(null);
  });

  it('turns an unreachable service into the same failure shape instead of throwing', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });

    const result = await requestJson('/api/v1/health', {}, fetchImpl as never);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a failure');
    expect(result.failure.code).toBe('SERVICE_UNAVAILABLE');
    expect(result.failure.status).toBe(0);
  });

  it('asks for JSON on the same origin', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ status: 'ok' }));

    await requestJson('/api/v1/health', {}, fetchImpl as never);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/health');
    expect(init.credentials).toBe('same-origin');
    expect((init.headers as Record<string, string>).accept).toBe('application/json');
  });

  it('treats a success status with an unreadable body as a failure, not an exception', async () => {
    // A proxy or a captive portal can answer 200 with an HTML page. Parsing that as
    // a report would throw inside the query and surface as a blank panel.
    const fetchImpl = vi.fn(
      async () =>
        new Response('<html>hello</html>', {
          status: 200,
          headers: { 'content-type': 'text/html', 'x-request-id': 'req-html-0004' },
        }),
    );

    const result = await requestJson('/api/v1/health', {}, fetchImpl as never);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a failure');
    expect(result.failure.code).toBe('INTERNAL_ERROR');
    expect(result.failure.requestId).toBe('req-html-0004');
    expect(result.failure.message).toBe(
      'The service returned a response this application could not read.',
    );
  });
});