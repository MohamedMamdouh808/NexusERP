/**
 * The idempotency key of one adjust-stock dialog session.
 *
 * A UUID generated with the platform's randomness: the key is unique per user
 * action, and the SAME key travels with a retry so the service can tell a retry
 * from a second posting.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // A very old environment: an equally collision-resistant fallback.
  return `adj-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
