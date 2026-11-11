import { describe, expect, it } from '@jest/globals';

import {
  extendRequestContext,
  getRequestContext,
  runWithRequestContext,
} from '../request-context';

/**
 * The per-request context, across the guard-to-controller boundary.
 *
 * The shape matters here: a guard is a SEPARATE async function the router
 * awaits, and the controller runs in a continuation that was created BEFORE the
 * guard ran. A context implementation that replaces the stored object when it
 * is extended therefore loses the extension - the controller reads the
 * pre-guard values and queries the database with an empty organization id.
 */
describe('the request context', () => {
  /** The guard: resolves the tenant, then extends the context. */
  async function guard(): Promise<boolean> {
    await Promise.resolve();
    extendRequestContext({ userId: 'user-1', organizationId: 'org-1' });
    return true;
  }

  it('carries the organization from a guard to the controller that runs after it', async () => {
    await runWithRequestContext(
      { requestId: 'req-1', userId: null, organizationId: null },
      async () => {
        await guard();
        // The controller's read.
        expect(getRequestContext()?.organizationId).toBe('org-1');
        expect(getRequestContext()?.userId).toBe('user-1');
      },
    );
  });

  it('keeps the request identifier and leaves untouched fields alone', () => {
    runWithRequestContext(
      { requestId: 'req-2', userId: null, organizationId: null },
      () => {
        extendRequestContext({ organizationId: 'org-2' });
        const context = getRequestContext();
        expect(context?.requestId).toBe('req-2');
        expect(context?.userId).toBeNull();
      },
    );
  });

  it('does nothing outside a request', () => {
    expect(() => extendRequestContext({ organizationId: 'org-3' })).not.toThrow();
    expect(getRequestContext()).toBeUndefined();
  });});
