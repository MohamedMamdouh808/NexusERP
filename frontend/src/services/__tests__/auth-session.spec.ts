import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { jsonResponse } from '../../test/render';
import {
  bootstrapSession,
  clearSession,
  getSessionState,
  registerAndSignIn,
  signIn,
  signOut,
  switchOrganizationForSession,
} from '../auth-session';
import { requestJson } from '../../lib/api-client';

/**
 * The session store, against a stubbed service.
 *
 * The behaviours that matter here are the ones the shell's honesty stands on:
 * the /auth/me probe is authoritative, a 401 ends the session wherever it comes
 * from, a transport failure does NOT (unreachable, not a false sign-out),
 * sign-out clears local state even when the service refuses (a documented
 * backend gap today), and no token, password or session identifier ever lands
 * in web storage.
 */

const ME_SIGNED_IN = {
  user: { id: 'user-1', email: 'nora@example.com' },
  membership: { id: 'membership-1', roleKey: 'administrator', isActive: true },
  organization: { id: 'org-1', name: "Nora's Organization" },
};

const LOGIN_OK = {
  user: { id: 'user-1', email: 'nora@example.com' },
  membership: {
    id: 'membership-1',
    roleKey: 'administrator',
    organization: { id: 'org-1', name: "Nora's Organization" },
  },
};

const ORGANIZATIONS = [
  { id: 'org-1', name: "Nora's Organization", roleKey: 'administrator' },
];

function envelope(status: number, code: string, message: string): Response {
  return jsonResponse({ code, message, details: [], requestId: 'req-1' }, { status });
}

let fetchCalls: { path: string; init: RequestInit }[] = [];

function stubFetch(handler: (path: string) => Response): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const path = String(input);
      fetchCalls.push({ path, init });
      return handler(path);
    }),
  );
}

function clearCookies(): void {
  for (const name of ['csrf_token', 'session_id']) {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
  }
}

beforeEach(() => {
  fetchCalls = [];
  clearSession();
  clearCookies();
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearSession();
  clearCookies();
});

describe('bootstrapSession (the /auth/me probe)', () => {
  it('goes signed-in with the service\u2019s own answer, including the switcher list', async () => {
    stubFetch((path) => {
      if (path.endsWith('/auth/me')) return jsonResponse(ME_SIGNED_IN);
      if (path.endsWith('/auth/organizations')) return jsonResponse(ORGANIZATIONS);
      throw new Error(`unexpected ${path}`);
    });

    await bootstrapSession(true);

    const state = getSessionState();
    expect(state.status).toBe('signed-in');
    if (state.status !== 'signed-in') return;
    expect(state.user).toEqual(ME_SIGNED_IN.user);
    expect(state.organization).toEqual(ME_SIGNED_IN.organization);
    expect(state.organizations).toEqual(ORGANIZATIONS);
  });

  it('goes signed-out on a 401 rather than showing an error', async () => {
    stubFetch(() => envelope(401, 'UNAUTHENTICATED', 'Authentication required.'));

    await bootstrapSession(true);

    expect(getSessionState().status).toBe('signed-out');
  });

  it('stays honest on a transport failure: unreachable, not signed-out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    await bootstrapSession(true);

    const state = getSessionState();
    expect(state.status).toBe('unreachable');
    if (state.status !== 'unreachable') return;
    expect(state.failure.requestId).toBe('unavailable');
  });
});

describe('signIn', () => {
  it('reads the CSRF cookie into memory and sends it back on sign-out', async () => {
    stubFetch((path) => {
      if (path.endsWith('/auth/login')) return jsonResponse(LOGIN_OK);
      if (path.endsWith('/auth/logout')) return envelope(403, 'FORBIDDEN', "You don't have permission.");
      if (path.endsWith('/auth/me')) return jsonResponse(ME_SIGNED_IN);
      if (path.endsWith('/auth/organizations')) return jsonResponse(ORGANIZATIONS);
      throw new Error(`unexpected ${path}`);
    });
    // jsdom ignores Set-Cookie from a stubbed fetch, so the cookie the real
    // browser would hold after the login call is set here.
    document.cookie = 'csrf_token=csrf-123;path=/';

    const outcome = await signIn('nora@example.com', 'Correct-Horse-1');
    expect(outcome.ok).toBe(true);
    expect(getSessionState().status).toBe('signed-in');

    // Sign-out clears local state even though the endpoint refuses today.
    const signResult = await signOut();
    expect(signResult).toBeUndefined();
    expect(getSessionState().status).toBe('signed-out');

    const logoutCall = fetchCalls.find((call) => call.path.endsWith('/auth/logout'));
    if (logoutCall === undefined) throw new Error('expected a logout call');
    const headers = logoutCall.init.headers as Record<string, string>;
    expect(headers['X-CSRF-Token']).toBe('csrf-123');

    // Nothing was persisted anywhere JavaScript could read later.
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('leaves the store signed-out and untouched when the service refuses', async () => {
    stubFetch(() => envelope(404, 'NOT_FOUND', 'Record not found.'));

    const outcome = await signIn('nora@example.com', 'wrong-password');
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.failure.requestId).toBe('req-1');
    expect(getSessionState().status).toBe('signed-out');
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});

describe('registerAndSignIn', () => {
  it('registers, then signs in through the cookie flow', async () => {
    stubFetch((path) => {
      if (path.endsWith('/auth/register')) return jsonResponse(ME_SIGNED_IN, { status: 201 });
      if (path.endsWith('/auth/login')) return jsonResponse(LOGIN_OK);
      if (path.endsWith('/auth/me')) return jsonResponse(ME_SIGNED_IN);
      if (path.endsWith('/auth/organizations')) return jsonResponse(ORGANIZATIONS);
      throw new Error(`unexpected ${path}`);
    });
    document.cookie = 'csrf_token=csrf-from-login;path=/';

    const outcome = await registerAndSignIn('nora@example.com', 'Correct-Horse-1');
    expect(outcome.ok).toBe(true);
    expect(getSessionState().status).toBe('signed-in');
    expect(fetchCalls.some((call) => call.path.endsWith('/auth/register'))).toBe(true);
    expect(fetchCalls.some((call) => call.path.endsWith('/auth/login'))).toBe(true);
    // The response body's one-time tokens are never stored.
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('does not create a session when the account cannot be created', async () => {
    stubFetch(() => envelope(500, 'INTERNAL_ERROR', 'Internal error.'));

    const outcome = await registerAndSignIn('dup@example.com', 'Correct-Horse-1');
    expect(outcome.ok).toBe(false);
    expect(getSessionState().status).toBe('signed-out');
  });
});

describe('signOut', () => {
  it('clears the store even when the endpoint refuses (403 gap)', async () => {
    stubFetch((path) => {
      if (path.endsWith('/auth/me')) return jsonResponse(ME_SIGNED_IN);
      if (path.endsWith('/auth/organizations')) return jsonResponse(ORGANIZATIONS);
      if (path.endsWith('/auth/logout')) return envelope(403, 'FORBIDDEN', "You don't have permission.");
      throw new Error(`unexpected ${path}`);
    });

    await bootstrapSession(true);
    expect(getSessionState().status).toBe('signed-in');

    await signOut();
    expect(getSessionState().status).toBe('signed-out');
  });
});

describe('switchOrganizationForSession', () => {
  it('switches through the real endpoint and refetches names the service vouches for', async () => {
    const OTHER = { id: 'org-2', name: 'Other Organization', roleKey: 'member' };
    let switched = false;
    stubFetch((path) => {
      if (path.endsWith('/auth/me')) {
        return jsonResponse(
          switched
            ? { ...ME_SIGNED_IN, membership: { ...ME_SIGNED_IN.membership, id: 'membership-2', roleKey: 'member' }, organization: OTHER }
            : ME_SIGNED_IN,
        );
      }
      if (path.endsWith('/auth/organizations')) {
        return jsonResponse(switched ? [...ORGANIZATIONS, OTHER] : ORGANIZATIONS);
      }
      if (path.endsWith('/auth/switch-organization')) {
        switched = true;
        // The service's known defect: the switch body echoes the id, not the name.
        return jsonResponse({
          membership: { id: 'membership-2', roleKey: 'member' },
          organization: { id: 'org-2', name: 'org-2' },
        });
      }
      throw new Error(`unexpected ${path}`);
    });

    await bootstrapSession(true);
    expect(getSessionState().status).toBe('signed-in');

    const outcome = await switchOrganizationForSession('org-2');
    expect(outcome.ok).toBe(true);
    const state = getSessionState();
    if (state.status !== 'signed-in') throw new Error('expected signed-in');
    // The top bar reads the REFETCHED truth, never the switch body's name.
    expect(state.organization).toEqual(OTHER);
    expect(state.membership.roleKey).toBe('member');
  });
});

describe('unauthorized handler (a 401 anywhere ends the session)', () => {
  it('signs the store out when any other call answers 401', async () => {
    stubFetch((path) => {
      if (path.endsWith('/auth/me')) return jsonResponse(ME_SIGNED_IN);
      if (path.endsWith('/auth/organizations')) return jsonResponse(ORGANIZATIONS);
      if (path.endsWith('/auth/logout')) return envelope(401, 'UNAUTHENTICATED', 'Authentication required.');
      throw new Error(`unexpected ${path}`);
    });
    await bootstrapSession(true);
    expect(getSessionState().status).toBe('signed-in');

    // Another feature's call, through the request client, expires the session.
    await requestJson('/api/v1/auth/logout', { method: 'POST' });
    await vi.waitFor(() => expect(getSessionState().status).toBe('signed-out'));
  });
});
