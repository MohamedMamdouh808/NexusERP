/**
 * Error codes and the error envelope type.
 *
 * Constitution Principle II and the specification's FR-021, FR-022 and FR-025:
 * every failing response in NexusERP uses ONE shape, and every code's meaning is
 * fixed once published. A code is never reused for a different failure and its
 * meaning never changes, which is what makes it safe for a client to branch on the
 * code rather than on the human-readable message.
 *
 * This module is the single source of truth for that vocabulary. The service, the
 * web client, the generated API contract and the reference data all read these
 * constants rather than restating a string, so the four cannot disagree.
 */

/**
 * Every error code the product defines.
 *
 * Codes are grouped by the HTTP status they travel with. The status is informative;
 * the code is what is contractual.
 */
export const ERROR_CODES = {
  // 400 Bad Request
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  MALFORMED_REQUEST: 'MALFORMED_REQUEST',
  IDEMPOTENCY_KEY_REQUIRED: 'IDEMPOTENCY_KEY_REQUIRED',
  OVER_RECEIPT: 'OVER_RECEIPT',
  OVER_ALLOCATION: 'OVER_ALLOCATION',

  // 401 Unauthorized
  UNAUTHENTICATED: 'UNAUTHENTICATED',

  // 403 Forbidden
  FORBIDDEN: 'FORBIDDEN',
  MODULE_DISABLED: 'MODULE_DISABLED',

  // 404 Not Found
  NOT_FOUND: 'NOT_FOUND',

  // 405 Method Not Allowed
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',

  // 409 Conflict
  CONFLICT: 'CONFLICT',
  DUPLICATE_RECORD: 'DUPLICATE_RECORD',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  PRODUCT_IN_USE: 'PRODUCT_IN_USE',
  CONTACT_IN_USE: 'CONTACT_IN_USE',
  LAST_ADMINISTRATOR: 'LAST_ADMINISTRATOR',
  INVOICE_HAS_PAYMENTS: 'INVOICE_HAS_PAYMENTS',
  STALE_VERSION: 'STALE_VERSION',

  // 413 Payload Too Large
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',

  // 422 Unprocessable Entity
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',

  // 429 Too Many Requests
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',

  // 500 Internal Server Error
  INTERNAL_ERROR: 'INTERNAL_ERROR',

  // 501 Not Implemented
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',

  // 503 Service Unavailable
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

/** The type of a single error code value. */
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * The set of codes the platform foundation can actually emit today.
 *
 * Codes outside this set are documented and reserved so a client generated from the
 * contract handles a failure it has never seen (FR-022). A code MUST NOT be added
 * here without an endpoint that emits it and a test that asserts the envelope.
 */
export const EMITTABLE_ERROR_CODES: readonly ErrorCode[] = [
  ERROR_CODES.VALIDATION_ERROR,
  ERROR_CODES.MALFORMED_REQUEST,
  ERROR_CODES.UNAUTHENTICATED,
  ERROR_CODES.FORBIDDEN,
  ERROR_CODES.MODULE_DISABLED,
  ERROR_CODES.NOT_FOUND,
  ERROR_CODES.METHOD_NOT_ALLOWED,
  ERROR_CODES.CONFLICT,
  ERROR_CODES.DUPLICATE_RECORD,
  ERROR_CODES.INVALID_STATE_TRANSITION,
  ERROR_CODES.PAYLOAD_TOO_LARGE,
  ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
  ERROR_CODES.VALIDATION_FAILED,
  ERROR_CODES.TOO_MANY_REQUESTS,
  ERROR_CODES.INTERNAL_ERROR,
  ERROR_CODES.NOT_IMPLEMENTED,
  ERROR_CODES.SERVICE_UNAVAILABLE,
];

/**
 * HTTP status each code travels with.
 *
 * Kept beside the codes so a handler cannot pair a code with the wrong status, and so
 * the generated contract and the service cannot disagree about it.
 */
export const ERROR_CODE_STATUS: Readonly<Record<ErrorCode, number>> = {
  [ERROR_CODES.VALIDATION_ERROR]: 400,
  [ERROR_CODES.MALFORMED_REQUEST]: 400,
  [ERROR_CODES.IDEMPOTENCY_KEY_REQUIRED]: 400,
  [ERROR_CODES.OVER_RECEIPT]: 400,
  [ERROR_CODES.OVER_ALLOCATION]: 400,
  [ERROR_CODES.UNAUTHENTICATED]: 401,
  [ERROR_CODES.FORBIDDEN]: 403,
  [ERROR_CODES.MODULE_DISABLED]: 403,
  [ERROR_CODES.NOT_FOUND]: 404,
  [ERROR_CODES.METHOD_NOT_ALLOWED]: 405,
  [ERROR_CODES.CONFLICT]: 409,
  [ERROR_CODES.DUPLICATE_RECORD]: 409,
  [ERROR_CODES.INVALID_STATE_TRANSITION]: 409,
  [ERROR_CODES.INSUFFICIENT_STOCK]: 409,
  [ERROR_CODES.PRODUCT_IN_USE]: 409,
  [ERROR_CODES.CONTACT_IN_USE]: 409,
  [ERROR_CODES.LAST_ADMINISTRATOR]: 409,
  [ERROR_CODES.INVOICE_HAS_PAYMENTS]: 409,
  [ERROR_CODES.STALE_VERSION]: 409,
  [ERROR_CODES.PAYLOAD_TOO_LARGE]: 413,
  [ERROR_CODES.IDEMPOTENCY_KEY_REUSED]: 422,
  [ERROR_CODES.VALIDATION_FAILED]: 422,
  [ERROR_CODES.TOO_MANY_REQUESTS]: 429,
  [ERROR_CODES.INTERNAL_ERROR]: 500,
  [ERROR_CODES.NOT_IMPLEMENTED]: 501,
  [ERROR_CODES.SERVICE_UNAVAILABLE]: 503,
};

/**
 * Default human-readable message per code.
 *
 * Every message here is safe to show a user verbatim: none contains a stack trace,
 * file path, query, hostname, or credential (FR-026). The internal-error message
 * carries the request identifier so a user can quote it in a support request (FR-031).
 */
export const DEFAULT_ERROR_MESSAGES: Readonly<Record<ErrorCode, string>> = {
  [ERROR_CODES.VALIDATION_ERROR]: 'Some fields need attention.',
  [ERROR_CODES.MALFORMED_REQUEST]: 'The request could not be read.',
  [ERROR_CODES.IDEMPOTENCY_KEY_REQUIRED]:
    'This action requires an Idempotency-Key header. Refresh and try again.',
  [ERROR_CODES.OVER_RECEIPT]: 'The received quantity exceeds the outstanding quantity.',
  [ERROR_CODES.OVER_ALLOCATION]: 'The allocated amount exceeds the invoice balance.',
  [ERROR_CODES.UNAUTHENTICATED]: 'Your session has expired. Please sign in again.',
  [ERROR_CODES.FORBIDDEN]: 'You do not have permission to perform this action.',
  [ERROR_CODES.MODULE_DISABLED]: 'This module is not enabled for your organization.',
  [ERROR_CODES.NOT_FOUND]: 'Record not found.',
  [ERROR_CODES.METHOD_NOT_ALLOWED]: 'That action is not available on this address.',
  [ERROR_CODES.CONFLICT]: 'This record changed since you opened it. Reload to continue.',
  [ERROR_CODES.DUPLICATE_RECORD]: 'A record with these values already exists.',
  [ERROR_CODES.INVALID_STATE_TRANSITION]:
    'This action is not available while the record is in its current state.',
  [ERROR_CODES.INSUFFICIENT_STOCK]: 'Not enough available stock for the requested items.',
  [ERROR_CODES.PRODUCT_IN_USE]:
    'This product is used by open documents or has reserved stock.',
  [ERROR_CODES.CONTACT_IN_USE]:
    'This contact is used by open documents or has unpaid invoices.',
  [ERROR_CODES.LAST_ADMINISTRATOR]:
    'An organization must keep at least one administrator.',
  [ERROR_CODES.INVOICE_HAS_PAYMENTS]:
    'This invoice has payments against it. Reverse the payments first.',
  [ERROR_CODES.STALE_VERSION]: 'This record changed since you opened it. Reload to continue.',
  [ERROR_CODES.PAYLOAD_TOO_LARGE]: 'The request is too large.',
  [ERROR_CODES.IDEMPOTENCY_KEY_REUSED]:
    'This request conflicts with an earlier request. Refresh and try again.',
  [ERROR_CODES.VALIDATION_FAILED]: 'The request could not be processed as sent.',
  [ERROR_CODES.TOO_MANY_REQUESTS]: 'Too many requests. Please wait a moment and try again.',
  [ERROR_CODES.INTERNAL_ERROR]:
    'Something went wrong. No changes were saved. Reference: {requestId}',
  [ERROR_CODES.NOT_IMPLEMENTED]: 'That action is not available in this release.',
  [ERROR_CODES.SERVICE_UNAVAILABLE]:
    'The service is temporarily unavailable. Please try again shortly.',
};

/**
 * A single field-level or check-level detail attached to an error.
 *
 * `field` is a dotted path into the submitted body, for example `lines.2.quantity`.
 * It is null for failures that are not tied to a field, such as a failed health check.
 */
export interface ErrorDetail {
  readonly field: string | null;
  readonly code: string | null;
  readonly message: string | null;
}

/**
 * The single shape of every failing response in NexusERP.
 *
 * Exactly four top-level fields, no more. Anything else in a failure response is a
 * defect, not an extension point.
 */
export interface ErrorEnvelope {
  readonly code: ErrorCode;
  readonly message: string;
  readonly details: readonly ErrorDetail[];
  readonly requestId: string;
}

/**
 * Pattern every request identifier must satisfy.
 *
 * The strict allowlist is what makes an identifier safe to place in a log line: it
 * cannot contain a newline, a carriage return, or any control character, so it can
 * never forge or split a record (FR-030).
 */
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

/** Header carrying the request identifier in both directions. */
export const REQUEST_ID_HEADER = 'x-request-id';

/** True when the supplied value is usable as a request identifier. */
export function isValidRequestId(value: unknown): value is string {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value);
}