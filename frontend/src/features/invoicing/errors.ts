/**
 * Reading a failure the client enriched, for inline display.
 *
 * `api-client` returns one envelope for every failure; `toError` copies its
 * fields onto the thrown Error. Three questions the screens ask are answered
 * here rather than restated in each dialog:
 *
 *  - Did the attempt end with an UNKNOWN outcome (the service was never
 *    reached)? Such an attempt must reuse its idempotency key on retry.
 *  - Which request identifier may the user quote to an operator? A transport
 *    failure has no service request to quote, so it has none.
 *  - Which allocation detail (invoice and current balance) did the service
 *    name? BALANCE_CHANGED and OVER_ALLOCATION carry two domain keys beyond
 *    the shared detail shape.
 */

export interface EnrichedError extends Error {
  code?: string;
  requestId?: string;
  status?: number;
  details?: unknown;
}

export interface AllocationFailureDetail {
  readonly invoiceId?: string;
  readonly currentBalance?: string;
  readonly message?: string;
}

function enriched(error: unknown): EnrichedError | null {
  return error instanceof Error ? (error as EnrichedError) : null;
}

/** True when the request never reached the service, so its outcome is unknown. */
export function isUnknownOutcome(error: unknown): boolean {
  return enriched(error)?.status === 0;
}

/** The identifier to quote, or null when the service never answered. */
export function requestReference(error: unknown): string | null {
  const failure = enriched(error);
  if (failure === null || failure.status === 0) return null;
  const id = failure.requestId;
  return typeof id === 'string' && id.length > 0 && id !== 'unavailable' && id !== 'unknown'
    ? id
    : null;
}

/** The domain detail that names an invoice and the balance the service holds. */
export function allocationFailureDetail(error: unknown): AllocationFailureDetail | null {
  const details = enriched(error)?.details;
  if (!Array.isArray(details)) return null;
  for (const raw of details) {
    if (typeof raw !== 'object' || raw === null) continue;
    const detail = raw as Record<string, unknown>;
    const invoiceId = typeof detail.invoiceId === 'string' ? detail.invoiceId : undefined;
    const currentBalance =
      typeof detail.currentBalance === 'string' ? detail.currentBalance : undefined;
    if (invoiceId !== undefined || currentBalance !== undefined) {
      return {
        invoiceId,
        currentBalance,
        message: typeof detail.message === 'string' ? detail.message : undefined,
      };
    }
  }
  return null;
}

/** The failure message with the request identifier appended when there is one. */
export function describeFailure(
  error: unknown,
  fallback: string,
  quote: (requestId: string) => string,
): string {
  const message = error instanceof Error && error.message.length > 0 ? error.message : fallback;
  const id = requestReference(error);
  return id === null ? message : `${message} ${quote(id)}`;
}
