import { AsyncLocalStorage } from 'node:async_hooks';
import { UnauthorizedException } from '@nestjs/common';
import type { ModuleState } from '@nexuserp/shared';

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
  /**
   * The calling organization's module availability, loaded once per request by
   * `ModuleStateService` and cached here for the lifetime of the request so the
   * shared module guard reads module state exactly once (FR-020).
   */
  readonly moduleStates?: readonly ModuleState[];
  /**
   * Per-request performance counters (Feature 019). One object per request, mutated in
   * place by the Prisma query hook; never shared across requests and never persisted.
   */
  readonly performance?: PerformanceContext;
}

/**
 * Counters for one request.
 *
 * `queryCount` is a single integer increment per database query and `dbTimeMs` is the
 * sum of the durations Prisma reports. `startedAt` is a monotonic `performance.now()`
 * value taken when the request entered the application, so the non-database time is
 * `elapsed - dbTimeMs`. None of these values are derived from client input.
 */
export interface PerformanceContext {
  queryCount: number;
  dbTimeMs: number;
  startedAt: number;
}

/** Enables the `Server-Timing`/`X-Query-Count` headers and per-query debug logging. */
export function isPerformanceInstrumentationEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.PERF_INSTRUMENTATION === '1';
}

const storage = new AsyncLocalStorage<MutableRequestContext>();

/**
 * The shape actually stored.
 *
 * The fields are writable here even though `RequestContext` presents them as
 * readonly: the object is shared by reference, so the extension a guard makes
 * must be visible to every later reader of the SAME object (see
 * `extendRequestContext`).
 */
interface MutableRequestContext {
  requestId: string;
  userId: string | null;
  organizationId: string | null;
  moduleStates?: readonly ModuleState[];
  performance?: PerformanceContext;
}

/**
 * Runs `work` with the given context bound to the current async execution.
 *
 * Everything awaited inside `work` - a guard, a repository, a Prisma callback - sees the
 * same context without receiving it as a parameter.
 */
export function runWithRequestContext<T>(context: RequestContext, work: () => T): T {
  return storage.run(
    {
      requestId: context.requestId,
      userId: context.userId,
      organizationId: context.organizationId,
      ...(context.moduleStates !== undefined ? { moduleStates: context.moduleStates } : {}),
      ...(context.performance !== undefined ? { performance: context.performance } : {}),
    },
    work,
  );
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
 * organization.
 *
 * The fields are updated IN PLACE, on the object the request is already bound
 * to. Replacing the stored object instead (`AsyncLocalStorage.enterWith`) does
 * not work here, and the reason is worth recording, because it cost a real
 * outage:
 *
 * A guard is a separate async function that the router AWAITS, and the
 * controller runs in a continuation that was created BEFORE the guard ran. That
 * continuation captured the context object as it was at creation time, so a
 * REPLACED store is invisible to it: the controller reads the pre-guard values
 * (organizationId null) and the query goes to the database with an empty
 * organization id - a 500 with a Prisma "invalid length: expected 32, found 0"
 * that names nothing useful.
 *
 * Mutating the bound object keeps every holder of that reference in agreement,
 * whatever the async boundary between them.
 */
export function extendRequestContext(patch: Partial<Omit<RequestContext, 'requestId'>>): void {
  const current = storage.getStore();
  if (!current) return;
  if (patch.userId !== undefined) current.userId = patch.userId;
  if (patch.organizationId !== undefined) current.organizationId = patch.organizationId;
  if (patch.moduleStates !== undefined) current.moduleStates = patch.moduleStates;
  if (patch.performance !== undefined) current.performance = patch.performance;
}

/**
 * Starts the performance counters for the current request.
 *
 * Called once by the request-id middleware, which is the earliest point in the
 * pipeline. Starting here (rather than in an interceptor) is what makes the count
 * include the queries the guards issue before the controller runs.
 */
export function startPerformanceMeasurement(): PerformanceContext {
  const performanceContext: PerformanceContext = {
    queryCount: 0,
    dbTimeMs: 0,
    startedAt: performance.now(),
  };
  extendRequestContext({ performance: performanceContext });
  return performanceContext;
}

/** The counters for the current request, or undefined outside a request. */
export function getPerformanceContext(): PerformanceContext | undefined {
  return storage.getStore()?.performance;
}

/** Records one completed database query. One integer add plus one float add. */
export function recordDatabaseQuery(durationMs: number): void {
  const performanceContext = storage.getStore()?.performance;
  if (!performanceContext) return;
  performanceContext.queryCount += 1;
  performanceContext.dbTimeMs += Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
}

/**
 * The organization the request is scoped to.
 *
 * Throws when there is none instead of returning an empty string. A tenant-scoped
 * query needs a tenant: an empty organization id is not "no organization", it is a
 * malformed uuid, and the database rejects it with an error that names nothing
 * useful. A request that reaches a controller without a tenant has no session
 * bound to it, which is an UNAUTHENTICATED request - and saying so is honest.
 */
export function requireOrganizationId(): string {
  const organizationId = getRequestContext()?.organizationId;
  if (!organizationId) {
    throw new UnauthorizedException('No organization in the request context.');
  }
  return organizationId;
}

/**
 * The user the request is made by.
 *
 * Same reasoning as `requireOrganizationId`: an empty user id is not a value a
 * query can use, and the caller is not identified.
 */
export function requireUserId(): string {
  const userId = getRequestContext()?.userId;
  if (!userId) {
    throw new UnauthorizedException('No user in the request context.');
  }
  return userId;
}