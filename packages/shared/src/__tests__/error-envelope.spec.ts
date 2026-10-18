import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ERROR_MESSAGES,
  EMITTABLE_ERROR_CODES,
  ERROR_CODES,
  ERROR_CODE_STATUS,
  isValidRequestId,
  type ErrorCode,
} from '../errors/index.js';
import { errorEnvelopeSchema } from '../schemas/index.js';

/**
 * FR-021, FR-023, FR-025, FR-026:
 * - exactly four top-level fields, never more
 * - `details` is always present, an empty array rather than absent
 * - every code has a fixed status and a safe default message
 */
describe('errorEnvelopeSchema', () => {
  const valid = {
    code: 'VALIDATION_ERROR',
    message: 'Some fields need attention.',
    details: [{ field: 'lines.2.quantity', code: 'OUT_OF_RANGE', message: 'Must be positive.' }],
    requestId: 'req-1',
  };

  it('accepts a well-formed envelope', () => {
    expect(errorEnvelopeSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts an envelope with an empty details array', () => {
    expect(errorEnvelopeSchema.safeParse({ ...valid, details: [] }).success).toBe(true);
  });

  it('has exactly four top-level fields', () => {
    expect(Object.keys(valid).sort()).toEqual(['code', 'details', 'message', 'requestId']);
    const parsed = errorEnvelopeSchema.parse(valid);
    expect(Object.keys(parsed).sort()).toEqual(['code', 'details', 'message', 'requestId']);
  });

  it('rejects an envelope with an extra top-level field, because anything else is a defect', () => {
    const result = errorEnvelopeSchema.safeParse({ ...valid, stack: 'Error: boom at /app/main.ts' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing details field rather than defaulting it', () => {
    const { details: _details, ...withoutDetails } = valid;
    expect(errorEnvelopeSchema.safeParse(withoutDetails).success).toBe(false);
  });

  it('rejects an unknown code', () => {
    expect(errorEnvelopeSchema.safeParse({ ...valid, code: 'TOTALLY_MADE_UP' }).success).toBe(false);
  });

  it('rejects a malformed request identifier', () => {
    expect(errorEnvelopeSchema.safeParse({ ...valid, requestId: 'bad id' }).success).toBe(false);
  });
});

describe('error code catalog', () => {
  const allCodes = Object.values(ERROR_CODES) as ErrorCode[];

  it('has a unique value for every code', () => {
    expect(new Set(allCodes).size).toBe(allCodes.length);
  });

  it('assigns every code an HTTP status', () => {
    for (const code of allCodes) {
      expect(ERROR_CODE_STATUS[code]).toBeGreaterThanOrEqual(400);
      expect(ERROR_CODE_STATUS[code]).toBeLessThan(600);
    }
  });

  it('assigns every code a non-empty default message', () => {
    for (const code of allCodes) {
      expect(DEFAULT_ERROR_MESSAGES[code]).toBeTruthy();
    }
  });

  it('never leaks an internal detail in a default message', () => {
    // FR-026: no stack trace, file path, query, hostname or credential.
    const forbidden = [
      'at Object.',
      '.ts:',
      '.js:',
      'node_modules',
      'prisma',
      'postgresql://',
      'SELECT',
      'INSERT',
      'localhost',
      'undefined',
      'null',
    ];
    for (const code of allCodes) {
      const message = DEFAULT_ERROR_MESSAGES[code];
      for (const needle of forbidden) {
        expect(message).not.toContain(needle);
      }
    }
  });

  it('puts the request identifier in the internal error message so a user can quote it', () => {
    expect(DEFAULT_ERROR_MESSAGES[ERROR_CODES.INTERNAL_ERROR]).toContain('{requestId}');
    expect(DEFAULT_ERROR_MESSAGES[ERROR_CODES.SERVICE_UNAVAILABLE]).not.toContain('{requestId}');
  });

  it('lists only codes the foundation can emit today', () => {
    for (const code of EMITTABLE_ERROR_CODES) {
      expect(allCodes).toContain(code);
    }
    expect(new Set(EMITTABLE_ERROR_CODES).size).toBe(EMITTABLE_ERROR_CODES.length);
  });

  it('uses 403 for permission failures and 404 for a missing record, never the reverse', () => {
    // The 403-versus-404 distinction is a tenant-isolation guarantee: 404 must not
    // confirm that another organization's record exists.
    expect(ERROR_CODE_STATUS[ERROR_CODES.FORBIDDEN]).toBe(403);
    expect(ERROR_CODE_STATUS[ERROR_CODES.NOT_FOUND]).toBe(404);
  });

  it('uses 429 for rate limiting even though no limiter ships yet', () => {
    // FR-022a: the shape ships before the mechanism, so a client generated from the
    // contract handles a 429 it has never seen.
    expect(ERROR_CODE_STATUS[ERROR_CODES.TOO_MANY_REQUESTS]).toBe(429);
    expect(EMITTABLE_ERROR_CODES).toContain(ERROR_CODES.TOO_MANY_REQUESTS);
  });
});

describe('isValidRequestId', () => {
  it('accepts only allowlisted values', () => {
    expect(isValidRequestId('abc-123_XYZ.1')).toBe(true);
    expect(isValidRequestId('has space')).toBe(false);
    expect(isValidRequestId('')).toBe(false);
    expect(isValidRequestId(123)).toBe(false);
    expect(isValidRequestId(undefined)).toBe(false);
  });
});