import { HttpException, HttpStatus } from '@nestjs/common';
import { ERROR_CODES } from '@nexuserp/shared';
import { describe, expect, it, jest } from '@jest/globals';

import { AllExceptionsFilter } from '../all-exceptions.filter';

/**
 * SC-014 names "the error format" a critical path, so the status-to-code mapping is
 * contract, not plumbing.
 *
 * This drives the filter rather than a helper, because the mapping is only trustworthy if
 * it holds for the exception classes the framework actually throws. The filter is
 * stateless, so it can be constructed directly, and `catch` is synchronous.
 */

const filter = new AllExceptionsFilter();

interface Captured {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

function capture(exception: unknown): Captured {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };

  filter.catch(exception, {
    switchToHttp: () => ({
      getRequest: () => ({ headers: {}, method: 'GET', url: '/api/v1/thing', requestId: 'req-map' }),
      getResponse: () => response,
      getStatus: () => HttpStatus.INTERNAL_SERVER_ERROR,
    }),
    getStatus: () => HttpStatus.INTERNAL_SERVER_ERROR,
    getResponse: () => response,
  } as never);

  const status = response.status.mock.calls.at(-1)?.[0] as number;
  const body = response.json.mock.calls.at(-1)?.[0] as Record<string, unknown>;
  return { status, body };
}

describe('every mapped HTTP status carries its catalogued code (SC-014)', () => {
  const cases: ReadonlyArray<readonly [number, string]> = [
    [HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR],
    [HttpStatus.UNAUTHORIZED, ERROR_CODES.UNAUTHENTICATED],
    [HttpStatus.FORBIDDEN, ERROR_CODES.FORBIDDEN],
    [HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND],
    // These three were never exercised, which is why a regression in them would have gone
    // unnoticed: a bare `status >= 500` fallback sends 405 and 413 to CONFLICT, which is
    // simply the wrong answer for a client that called the wrong verb or sent too much.
    [HttpStatus.METHOD_NOT_ALLOWED, ERROR_CODES.METHOD_NOT_ALLOWED],
    [HttpStatus.CONFLICT, ERROR_CODES.CONFLICT],
    [HttpStatus.PAYLOAD_TOO_LARGE, ERROR_CODES.PAYLOAD_TOO_LARGE],
    [HttpStatus.UNPROCESSABLE_ENTITY, ERROR_CODES.VALIDATION_FAILED],
    [HttpStatus.TOO_MANY_REQUESTS, ERROR_CODES.TOO_MANY_REQUESTS],
    [HttpStatus.NOT_IMPLEMENTED, ERROR_CODES.NOT_IMPLEMENTED],
    [HttpStatus.SERVICE_UNAVAILABLE, ERROR_CODES.SERVICE_UNAVAILABLE],
    [HttpStatus.INTERNAL_SERVER_ERROR, ERROR_CODES.INTERNAL_ERROR],
  ];

  it.each(cases)('status %s maps to %s', (status, expectedCode) => {
    const captured = capture(new HttpException('x', status));

    expect(captured.status).toBe(status);
    expect(captured.body.code).toBe(expectedCode);
  });

  it('uses the catalogued message for the code, never the raw exception text (FR-026)', () => {
    const captured = capture(
      new HttpException('connection to postgresql://user:pw@db failed', HttpStatus.SERVICE_UNAVAILABLE),
    );

    expect(captured.body.message).not.toContain('postgresql://');
    expect(captured.body.message).not.toContain('pw@');
  });

  it('defaults an unmapped 5xx to INTERNAL_ERROR and an unmapped 4xx to CONFLICT', () => {
    // 599 and 418 have no explicit case. The fallback must not send a 4xx to a 5xx code.
    expect(capture(new HttpException('x', 599)).body.code).toBe(ERROR_CODES.INTERNAL_ERROR);
    expect(capture(new HttpException('x', 418)).body.code).toBe(ERROR_CODES.CONFLICT);
  });
});