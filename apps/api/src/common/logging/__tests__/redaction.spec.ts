import { Writable } from 'node:stream';
import { describe, expect, it } from '@jest/globals';
import {
  REDACTION_PATHS,
  SENSITIVE_FIELD_NAMES,
  buildRequestLogRecord,
  createLogger,
  scrubSecrets,
} from '../logger';
import { runWithRequestContext } from '../request-context';

/**
 * FR-039, tested directly.
 *
 * fast-redact paths were verified empirically to cover ONLY the top level: `*.password`
 * reaches exactly one level deep and `**.password` is not supported at all. Recursive
 * scrubbing is therefore what actually satisfies FR-039, so it gets its own tests
 * covering depth, arrays, and cycle safety.
 */
describe('scrubSecrets', () => {
  it('redacts a sensitive field at any depth', () => {
    const scrubbed = scrubSecrets({
      body: { password: 'depth-1' },
      nested: { deeper: { deeper2: { token: 'depth-3' } } },
    });
    expect(JSON.stringify(scrubbed)).not.toContain('depth-1');
    expect(JSON.stringify(scrubbed)).not.toContain('depth-3');
  });

  it('redacts inside arrays, which a path-based rule would skip', () => {
    const scrubbed = scrubSecrets({ credentials: [{ password: 'in-array' }] });
    expect(JSON.stringify(scrubbed)).not.toContain('in-array');
  });

  it('leaves non-sensitive values untouched, so a record stays diagnosable', () => {
    const scrubbed = scrubSecrets({ route: '/api/v1/health', status: 200, userId: 'user-1' });
    expect(scrubbed).toEqual({ route: '/api/v1/health', status: 200, userId: 'user-1' });
  });

  it('matches a sensitive name case-insensitively', () => {
    const scrubbed = scrubSecrets({ Password: 'mixed-case', TOKEN: 'mixed-case-2' });
    expect(scrubbed.Password).toBe('[redacted]');
    expect(scrubbed.TOKEN).toBe('[redacted]');
  });

  it('does not recurse forever on a cyclic object', () => {
    const cyclic: Record<string, unknown> = { name: 'root' };
    cyclic.self = cyclic;
    expect(() => scrubSecrets(cyclic)).not.toThrow();
  });

  it('passes primitives through unchanged', () => {
    expect(scrubSecrets('plain')).toBe('plain');
    expect(scrubSecrets(42)).toBe(42);
    expect(scrubSecrets(null)).toBeNull();
  });

  it('covers every credential field the product handles', () => {
    for (const name of ['password', 'token', 'sessionToken', 'csrfToken', 'authorization', 'cookie']) {
      expect(SENSITIVE_FIELD_NAMES).toContain(name);
      expect(REDACTION_PATHS).toContain(name);
    }
  });
});

/**
 * FR-039: log records MUST NOT contain passwords, session tokens, secrets, or personal
 * data beyond what is needed to diagnose a problem.
 *
 * Redaction is asserted by reading the ACTUAL OUTPUT of the logger, not by inspecting the
 * configuration. A redaction list that is configured but not applied looks identical when
 * inspected and leaks when it matters.
 */
describe('log redaction', () => {
  /** Captures what the logger actually emitted, one JSON record per line. */
  function capture(lines: readonly Record<string, unknown>[]): string {
    const chunks: string[] = [];
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(String(chunk));
        callback();
      },
    });

    const logger = createLogger({ level: 'trace', isProduction: true, destination });

    for (const line of lines) {
      logger.info(line);
    }

    return chunks.join('');
  }

  it('removes credential values by name at any nesting depth', () => {
    const output = capture([
      {
        password: 'hunter2-correct-horse',
        token: 'abc.def.ghi',
        sessionToken: 'sess_secret_value',
        csrfToken: 'csrf_secret_value',
        authorization: 'Bearer super-secret-token',
        cookie: 'sid=super-secret-cookie',
      },
    ]);

    for (const secret of [
      'hunter2-correct-horse',
      'abc.def.ghi',
      'sess_secret_value',
      'csrf_secret_value',
      'super-secret-token',
      'super-secret-cookie',
    ]) {
      expect(output).not.toContain(secret);
    }
  });

  it('redacts nested credential fields', () => {
    const output = capture([
      {
        body: {
          password: 'nested-secret-value',
          nested: { deeper: { token: 'deeply-nested-token' } },
        },
      },
    ]);

    expect(output).not.toContain('nested-secret-value');
    expect(output).not.toContain('deeply-nested-token');
  });

  it('still writes the record, so redaction never silences a diagnostic', () => {
    const output = capture([{ password: 'secret', route: '/api/v1/health', status: 200 }]);
    expect(output).toContain('/api/v1/health');
    expect(output).toContain('[redacted]');
  });

  it('covers every credential path the product handles', () => {
    for (const path of ['password', 'token', 'sessionToken', 'csrfToken', 'authorization', 'cookie']) {
      expect(REDACTION_PATHS).toContain(path);
    }
  });

  it('redacts request and response headers that carry credentials', () => {
    const output = capture([
      {
        req: { headers: { authorization: 'Bearer header-secret', cookie: 'sid=header-cookie' } },
      },
    ]);
    expect(output).not.toContain('header-secret');
    expect(output).not.toContain('header-cookie');
  });
});

/**
 * FR-037 and FR-038: a request log record MUST carry the request identifier, the route,
 * the response status, and the time taken - plus the user and organization where known.
 */
describe('request log record', () => {
  it('carries the identifier, route, status, and duration', () => {
    const record = runWithRequestContext(
      { requestId: 'req-42', userId: null, organizationId: null },
      () =>
        buildRequestLogRecord({
          route: '/api/v1/health',
          method: 'GET',
          status: 200,
          durationMs: 3,
        }),
    );

    expect(record).toEqual({
      requestId: 'req-42',
      route: '/api/v1/health',
      method: 'GET',
      status: 200,
      durationMs: 3,
      userId: null,
      organizationId: null,
    });
  });

  it('includes the user and organization when known', () => {
    const record = runWithRequestContext(
      { requestId: 'req-7', userId: 'user-1', organizationId: 'org-9' },
      () =>
        buildRequestLogRecord({ route: '/api/v1/products', method: 'POST', status: 201, durationMs: 12 }),
    );

    expect(record.userId).toBe('user-1');
    expect(record.organizationId).toBe('org-9');
  });

  it('emits the fields as null outside a request rather than omitting them', () => {
    // The field set is fixed from the start so a monitoring service configured against it
    // does not break when FR-038 becomes active.
    const record = buildRequestLogRecord({
      route: '/api/v1/health',
      method: 'GET',
      status: 200,
      durationMs: 1,
    });
    expect(record).toHaveProperty('userId', null);
    expect(record).toHaveProperty('organizationId', null);
    expect(record).toHaveProperty('requestId');
  });
});