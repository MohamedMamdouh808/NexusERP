import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The per-request context: one identifier that ties a user's report to the exact
 * server activity that produced it.
 *
 * FR-028 requires the SAME identifier in the response and in every log line for the
 * request. Reading it from a decorator parameter at each layer would mean a guard,
 * a pipe, an interceptor, and a service each had to be passed it - and any layer that
 * forgot would silently produce untraceable output. `AsyncLocalStorage` carries it out
 * of band, so it is available everywhere and cannot be forgotten.
 *
 * This is the same mechanism the transaction unit of work uses (research.md R-003), so
 * the request context travels the same way in both cases.
 */

export interface RequestContext {
  /** Identifier echoed in the response, the error envelope, and every log line. */
  readonly requestId: string;
  /**
   * Emitted as null until authentication ships (FR-038). The field is present from the
   * start so the log record's field set does not change when FR-038 becomes active -
   * changing a log format after a monitoring service has been configured to read it
   * breaks dashboards silently.
   */
  readonly userId: string | null;
  /** Emitted as null until organizations ship. See `userId` for why the field exists. */
  readonly organizationId: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Runs `work` with the given context bound to the current async execution.
 *
 * Everything awaited inside `work` - a guard, a repository, a Prisma callback - sees the
 * same context without receiving it as a parameter.
 */
export function runWithRequestContext<T>(context: RequestContext, work: () => T): T {
  return storage.run(context, work);
}

/** The context for the current request, or undefined outside a request. */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/** The current request identifier, or undefined outside a request. */
export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/**
 * Returns a copy of the current context with the given fields replaced.
 *
 * Used when a later stage of the request learns something the earlier stage could not:
 * after authentication resolves a user, or after tenant resolution resolves an
 * organization. The store is immutable so a nested stage cannot corrupt the value an
 * outer stage is still reading.
 */
export function extendRequestContext(patch: Partial<Omit<RequestContext, 'requestId'>>): void {
  const current = storage.getStore();
  if (!current) return;
  storage.enterWith({ ...current, ...patch });
}