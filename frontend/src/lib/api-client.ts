/**
 * The one place the interface talks to the service (T058, T049).
 *
 * Every response - success or failure - is mapped into the shared error envelope,
 * so no component ever inspects a raw Response and no component decides what a
 * failure looks like. The envelope is one shape for every failure the API can
 * produce (FR-021), and this client preserves the request identifier so a failure
 * can be quoted to an operator and matched against the server log (FR-031).
 *
 * Rate limiting is handled here rather than in a component, because `Retry-After`
 * is a transport concern: it is the service telling the client WHEN to come back,
 * and ignoring it means retrying into a limit that is still in force.
 */

import { ERROR_CODES, type ErrorEnvelopeSchema } from '@nexuserp/shared';

export interface ApiFailure {
  /** Contractual code. A client branches on this, never on the message. */
  readonly code: string;
  /** Safe to display: the service never puts internals in it (FR-026). */
  readonly message: string;
  readonly details: ErrorEnvelopeSchema['details'];
  /** Correlates the failure with the server log and with the response header. */
  readonly requestId: string;
  readonly status: number;
  /**
   * Whole seconds to wait before retrying, from `Retry-After`, or null when the
   * response did not carry a usable value.
   */
  readonly retryAfterSeconds: number | null;
}

export type ApiResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly failure: ApiFailure };

/**
 * True when a failure is a rate limit rather than a generic problem (T014).
 *
 * The rule was stated inline in the health panel and needed a second time by the
 * sample service's simulated 429, so it lives here - beside the client that reads
 * `Retry-After` - rather than being restated per caller (research.md R-007). The
 * status is checked as well as the code because a proxy or a gateway can answer
 * 429 without a body this application can read, in which case the code falls back
 * to the transport's.
 */
export function isRateLimited(failure: Pick<ApiFailure, 'status' | 'code'>): boolean {
  return failure.status === 429 || failure.code === ERROR_CODES.TOO_MANY_REQUESTS;
}

/**
 * The HTTP-date form required by `Retry-After` (RFC 7231 IMF-fixdate), checked
 * strictly and deliberately not left to `Date.parse`.
 *
 * `Date.parse` is lenient enough to accept things that are not dates at all: it
 * reads `-5` as a date far in the past. Trusting it turns a malformed header into
 * "wait 0 seconds", which is worse than having no header at all - the client would
 * retry immediately into a limit that is still in force.
 */
const HTTP_DATE = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/;

/**
 * Reads `Retry-After` in both forms the specification allows: a number of
 * seconds, or an HTTP date. Returns null rather than NaN or a negative number so
 * a malformed header cannot produce a countdown that is already over or never ends.
 */
export function parseRetryAfter(value: string | null, now: Date = new Date()): number | null {
  if (value === null) return null;

  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  if (/^\d+$/.test(trimmed)) {
    const seconds = Number.parseInt(trimmed, 10);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
  }

  if (!HTTP_DATE.test(trimmed)) return null;

  const when = Date.parse(trimmed);
  if (Number.isNaN(when)) return null;

  const seconds = Math.ceil((when - now.getTime()) / 1000);
  return seconds > 0 ? seconds : 0;
}

function fallbackFailure(status: number, requestId: string): ApiFailure {
  const code =
    status === 429
      ? ERROR_CODES.TOO_MANY_REQUESTS
      : status >= 500
        ? ERROR_CODES.INTERNAL_ERROR
        : ERROR_CODES.MALFORMED_REQUEST;

  return {
    code,
    message: 'The service returned a response this application could not read.',
    details: [],
    requestId,
    status,
    retryAfterSeconds: null,
  };
}

/**
 * Performs a request and returns a discriminated result. Never throws for an HTTP
 * failure; a thrown exception is reserved for a transport failure the caller
 * cannot act on, and is converted here into the same failure shape so callers
 * have exactly one thing to handle.
 */
export async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  fetchImpl: typeof fetch = fetch,
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetchImpl(path, {
      ...init,
      headers: { accept: 'application/json', ...(init.headers ?? {}) },
      credentials: 'same-origin',
    });
  } catch {
    return {
      ok: false,
      failure: {
        code: ERROR_CODES.SERVICE_UNAVAILABLE,
        message: 'The service could not be reached. Check that it is running.',
        details: [],
        requestId: 'unavailable',
        status: 0,
        retryAfterSeconds: null,
      },
    };
  }

  const headerRequestId = response.headers.get('x-request-id');

  if (response.ok) {
    // A success status does not promise a readable body: a proxy or a captive
    // portal can answer 200 with an HTML page. Parsing is therefore guarded, so a
    // malformed body becomes the same failure shape as every other problem rather
    // than an exception that escapes to the caller.
    try {
      const data = (await response.json()) as T;
      return { ok: true, data };
    } catch {
      return {
        ok: false,
        failure: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'The service returned a response this application could not read.',
          details: [],
          requestId: headerRequestId ?? 'unknown',
          status: response.status,
          retryAfterSeconds: parseRetryAfter(response.headers.get('retry-after')),
        },
      };
    }
  }

  // A failure body is contractually the envelope. If it is not - a proxy error
  // page, a truncated response - fall back rather than trusting the shape.
  let envelope: Partial<ErrorEnvelopeSchema> = {};
  try {
    envelope = (await response.json()) as Partial<ErrorEnvelopeSchema>;
  } catch {
    envelope = {};
  }

  const requestId =
    typeof envelope.requestId === 'string' && envelope.requestId.length > 0
      ? envelope.requestId
      : (headerRequestId ?? 'unknown');

  const base = fallbackFailure(response.status, requestId);

  return {
    ok: false,
    failure: {
      code: typeof envelope.code === 'string' ? envelope.code : base.code,
      message: typeof envelope.message === 'string' ? envelope.message : base.message,
      details: Array.isArray(envelope.details) ? envelope.details : [],
      requestId,
      status: response.status,
      retryAfterSeconds: parseRetryAfter(response.headers.get('retry-after')),
    },
  };
}

/** The health address. Relative, so the browser always uses its own origin. */
export const HEALTH_PATH = '/api/v1/health';