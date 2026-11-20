import { describe, expect, it, afterEach } from '@jest/globals';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { Response } from 'express';
import { lastValueFrom, of } from 'rxjs';
import {
  recordDatabaseQuery,
  runWithRequestContext,
  startPerformanceMeasurement,
} from '../../../common/logging/request-context';
import { PerformanceInterceptor } from '../performance.interceptor';
import { maskQueryText } from '../query-text';

/**
 * Feature 019 contracts/instrumentation.md:
 *
 *   - `Server-Timing` reports `db` and `app` separately.
 *   - `X-Query-Count` is present in development and tests.
 *   - In production both are absent unless `PERF_INSTRUMENTATION=1`.
 *   - A logged statement never carries a value; parameters are masked.
 */
describe('performance instrumentation', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalFlag = process.env.PERF_INSTRUMENTATION;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalFlag === undefined) delete process.env.PERF_INSTRUMENTATION;
    else process.env.PERF_INSTRUMENTATION = originalFlag;
  });

  function execute(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {};
    const response = {
      headersSent: false,
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
    } as unknown as Response;

    const context = {
      getType: () => 'http',
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ExecutionContext;

    const next: CallHandler = { handle: () => of({ ok: true }) };

    return runWithRequestContext(
      { requestId: 'req-perf', userId: null, organizationId: null },
      async () => {
        startPerformanceMeasurement();
        recordDatabaseQuery(12.5);
        recordDatabaseQuery(7.5);
        await lastValueFrom(new PerformanceInterceptor().intercept(context, next));
        return headers;
      },
    ) as unknown as Promise<Record<string, string>>;
  }

  it('emits db and app durations plus the query count in development', async () => {
    process.env.NODE_ENV = 'test';
    const headers = await execute();

    expect(headers['Server-Timing']).toMatch(/^db;dur=20\.0, app;dur=\d+\.\d$/);
    expect(headers['X-Query-Count']).toBe('2');
  });

  it('omits the headers in production unless instrumentation is requested', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.PERF_INSTRUMENTATION;

    const headers = await execute();

    expect(headers['Server-Timing']).toBeUndefined();
    expect(headers['X-Query-Count']).toBeUndefined();
  });

  it('emits the headers in production when PERF_INSTRUMENTATION=1', async () => {
    process.env.NODE_ENV = 'production';
    process.env.PERF_INSTRUMENTATION = '1';

    const headers = await execute();

    expect(headers['Server-Timing']).toBeDefined();
    expect(headers['X-Query-Count']).toBe('2');
  });

  it('masks every literal and never includes bind values', () => {
    const masked = maskQueryText(
      "SELECT * FROM contacts WHERE email = 'amina@example.com' AND name = 'Amina'",
    );

    expect(masked).toBe('SELECT * FROM contacts WHERE email = [?] AND name = [?]');
    expect(masked).not.toContain('amina');
    expect(masked).not.toContain('Amina');
  });
});
