import { describe, expect, it } from '@jest/globals';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ERROR_CODES, isValidRequestId } from '@nexuserp/shared';
import {
  AppException,
  AllExceptionsFilter,
} from '../all-exceptions.filter';
import { getRequestContext, runWithRequestContext } from '../../logging/request-context';
import { RequestIdMiddleware } from '../../logging/request-id.middleware';

/**
 * FR-021 to FR-026, exercised without a database.
 *
 * The integration suite (T040, T041) proves these over HTTP against a running service.
 * These tests cover the classification logic itself, which is the part most likely to
 * regress: a filter that silently stops mapping a status to a catalogued code would keep
 * returning 200s and the envelope tests over HTTP would still pass on the codes that work.
 */

/** Minimal Express-like response double capturing status and body. */
function responseDouble() {
  const state = { status: 0, body: undefined as unknown, headers: {} as Record<string, string> };
  return {
    state,
    status(code: number) {
      state.status = code;
      return this;
    },
    json(payload: unknown) {
      state.body = payload;
      return this;
    },
    setHeader(name: string, value: string) {
      state.headers[name.toLowerCase()] = value;
    },
  };
}

/** Minimal ArgumentsHost double returning the response double. */
function hostFor(response: ReturnType<typeof responseDouble>) {
  return {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ url: '/api/v1/health' }),
    }),
  } as never;
}

/**
 * Runs the filter WITH a bound request context.
 *
 * `AsyncLocalStorage` holds its store only for the duration of `run`, so the filter must
 * be invoked INSIDE the run. Calling it afterwards would read an undefined identifier and
 * the assertion would pass for the wrong reason.
 */
function capture(exception: unknown, requestId = 'req-1') {
  const response = responseDouble();
  const filter = new AllExceptionsFilter();

  runWithRequestContext({ requestId, userId: null, organizationId: null }, () => {
    filter.catch(exception, hostFor(response));
  });

  return response.state;
}

describe('AllExceptionsFilter', () => {
  it('returns exactly the four envelope fields for an unexpected failure (FR-021)', () => {
    const state = capture(new Error('boom: SELECT * FROM users failed at /app/main.ts'));
    expect(state.status).toBe(500);
    const body = state.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['code', 'details', 'message', 'requestId']);
  });

  it('never leaks a stack trace, path, query, or driver detail (FR-026)', () => {
    const secret = new Error('connect ECONNREFUSED postgresql://u:p@h:5432/db SELECT 1');
    secret.stack = 'Error: connect ECONNREFUSED\n    at PrismaClient (/app/src/main.ts:42:9)';
    const body = capture(secret).body as Record<string, unknown>;

    const serialised = JSON.stringify(body);
    expect(serialised).not.toContain('ECONNREFUSED');
    expect(serialised).not.toContain('postgresql://');
    expect(serialised).not.toContain('SELECT');
    expect(serialised).not.toContain('/app/src/main.ts');
    expect(body.code).toBe(ERROR_CODES.INTERNAL_ERROR);
  });

  it('puts the request identifier in the user-visible internal-error message (FR-031)', () => {
    const body = capture(new Error('boom'), 'req-abc').body as Record<string, unknown>;
    expect(body.message).toContain('req-abc');
    expect(String(body.message)).not.toContain('{requestId}');
  });

  it('always includes a details array, empty rather than absent (FR-023)', () => {
    const body = capture(new Error('boom')).body as Record<string, unknown>;
    expect(Array.isArray(body.details)).toBe(true);
    expect(body.details).toHaveLength(0);
  });

  it('maps each HTTP status to its catalogued code', () => {
    const cases: readonly [HttpStatus, string][] = [
      [HttpStatus.UNAUTHORIZED, ERROR_CODES.UNAUTHENTICATED],
      [HttpStatus.FORBIDDEN, ERROR_CODES.FORBIDDEN],
      [HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND],
      [HttpStatus.CONFLICT, ERROR_CODES.CONFLICT],
      [HttpStatus.TOO_MANY_REQUESTS, ERROR_CODES.TOO_MANY_REQUESTS],
      [HttpStatus.SERVICE_UNAVAILABLE, ERROR_CODES.SERVICE_UNAVAILABLE],
    ];
    for (const [status, expected] of cases) {
      const body = capture(new HttpException('x', status)).body as Record<string, unknown>;
      expect(body.code).toBe(expected);
    }
  });

  it('gives a validation failure a dotted field path (FR-024)', () => {
    const exception = new HttpException(
      { message: ['lines.2.quantity must be greater than zero', 'customer is required'] },
      HttpStatus.BAD_REQUEST,
    );
    const body = capture(exception).body as { code: string; details: { field: string; message: string }[] };

    expect(body.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    expect(body.details).toHaveLength(2);
    expect(body.details[0]?.field).toBe('lines.2.quantity');
    expect(body.details[0]?.message).toBe('must be greater than zero');
    expect(body.details[1]?.field).toBe('customer');
  });

  it('preserves an AppException code, status, and details', () => {
    const exception = new AppException(ERROR_CODES.INSUFFICIENT_STOCK, [
      { field: null, code: 'SHORT', message: 'product X is short' },
    ]);
    const state = capture(exception);
    const body = state.body as { code: string; details: unknown[] };
    expect(state.status).toBe(409);
    expect(body.code).toBe(ERROR_CODES.INSUFFICIENT_STOCK);
    expect(body.details).toHaveLength(1);
  });

  it('does not trust a message supplied by an arbitrary thrown error', () => {
    const body = capture(new HttpException('postgres://user:pw@host/db', HttpStatus.CONFLICT))
      .body as Record<string, unknown>;
    expect(String(body.message)).not.toContain('postgres://');
  });
});

describe('RequestIdMiddleware', () => {
  const middleware = new RequestIdMiddleware();

  /**
   * Drives the middleware and captures the context INSIDE `next`.
   *
   * `AsyncLocalStorage` holds its store only for the duration of the run, so reading the
   * context after `use` returns would always be undefined - and the assertions would
   * pass or fail for the wrong reason. A real request reads it while handling is in
   * progress, which is exactly what `next()` represents.
   */
  function run(supplied?: string) {
    const request = { headers: supplied === undefined ? {} : { 'x-request-id': supplied } };
    const response = responseDouble();
    let ran = false;
    let requestId: string | undefined;
    let hadContext = false;

    middleware.use(request as never, response as never, () => {
      ran = true;
      hadContext = getRequestContext() !== undefined;
      requestId = getRequestContext()?.requestId;
    });

    return { ran, response, requestId, hadContext };
  }

  it('binds the context for the duration of the request', () => {
    expect(run('ctx-check').hadContext).toBe(true);
  });

  it('adopts a supplied identifier (FR-029)', () => {
    const { requestId } = run('client-supplied-1');
    expect(requestId).toBe('client-supplied-1');
  });

  it('generates one when none is supplied (FR-029)', () => {
    const { requestId } = run();
    expect(requestId).toBeDefined();
    expect(isValidRequestId(requestId)).toBe(true);
  });

  it('replaces a malformed identifier rather than rejecting the request (FR-030)', () => {
    const hostile = ['has space', 'a'.repeat(200), 'has\nnewline', ''];
    for (const value of hostile) {
      const { ran, requestId } = run(value);
      expect(ran).toBe(true);
      expect(requestId).not.toBe(value);
      expect(isValidRequestId(requestId)).toBe(true);
    }
  });

  it('echoes the identifier on the response header (FR-028)', () => {
    const { response } = run('echo-me');
    expect(response.state.headers['x-request-id']).toBe('echo-me');
  });

  it('never lets a supplied identifier break the log line', () => {
    // The allowlist admits no control character, so a hostile header cannot forge a record.
    const { requestId } = run('id\u0000with-null');
    expect(isValidRequestId(requestId)).toBe(true);
    expect(requestId).not.toContain('\u0000');
  });
});