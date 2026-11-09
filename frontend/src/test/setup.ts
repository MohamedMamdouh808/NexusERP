import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

import { resetSession } from './session';

/**
 * Request shim (jsdom × Node 24 undici).
 *
 * Under jsdom the test process double-books `Request`: undici (Node's fetch)
 * provides the class, while jsdom provides the `AbortSignal` — and undici's
 * `RequestInit` refuses any signal it did not mint, so React Router's
 * client-side navigation fails with
 * `RequestInit: Expected signal ... to be an instance of AbortSignal`
 * (the same mismatch vitest reports as vitest-dev/vitest#8374).
 *
 * The shim keeps undici's validation by NOT handing the foreign signal to
 * `super`, then re-exposes the caller's signal through an own property, which
 * shadows the prototype getter. Callers see their signal (`.aborted` works),
 * undici never sees an instance it would reject.
 */

type RequestLike = typeof Request;

const NativeRequest: RequestLike | undefined = globalThis.Request;
if (NativeRequest !== undefined) {
  class RequestAcceptingForeignSignals extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      const { signal, ...rest } = init ?? {};
      super(input, rest);
      if (signal) {
        Object.defineProperty(this, 'signal', {
          value: signal,
          writable: true,
          configurable: true,
        });
      }
    }
  }
  Object.defineProperty(globalThis, 'Request', {
    value: RequestAcceptingForeignSignals,
    writable: true,
    configurable: true,
  });
}

// Unmount between cases so a query cannot match a node left behind by the
// previous one - a passing test that reads yesterday's DOM proves nothing.
// The session store is reset the same way: it is a module singleton, so a
// seeded or cleared session from one case must not answer the next one's
// renders, and the in-memory CSRF token is dropped with it.
afterEach(() => {
  cleanup();
  resetSession();
});