/**
 * Auth client - the frontend's half of the service seam for authentication.
 *
 * Every call goes through `requestJson` from `api-client.ts`, which maps every
 * response into the shared error envelope `{ code, message, details, requestId }`.
 * The session cookie is handled by the browser (it is HttpOnly, so JavaScript
 * never sees it); the CSRF token is returned in the login response and must be
 * sent back as `X-CSRF-Token` on every state-changing request (FR-011).
 */

import { requestJson, type ApiResult } from '../lib/api-client';

const API_BASE = '/api/v1';

export interface RegisterResult {
  readonly user: { readonly id: string; readonly email: string };
  readonly organization: { readonly id: string; readonly name: string };
  readonly membership: { readonly id: string; readonly roleKey: string };
  readonly session: { readonly id: string };
  readonly sessionToken: string;
  readonly csrfToken: string;
}

export interface LoginResult {
  readonly user: { readonly id: string; readonly email: string };
  readonly membership: {
    readonly id: string;
    readonly roleKey: string;
    readonly organization: { readonly id: string; readonly name: string };
  };
  readonly session: { readonly id: string };
  readonly sessionToken: string;
  readonly csrfToken: string;
}

export interface MeResult {
  readonly user: { readonly id: string; readonly email: string };
  readonly membership: {
    readonly id: string;
    readonly roleKey: string;
    readonly isActive: boolean;
    readonly organization: { readonly id: string; readonly name: string };
  };
}

export interface Organization {
  readonly id: string;
  readonly name: string;
  readonly roleKey: string;
}

/** POST /api/v1/auth/register - creates user, org, membership, warehouse, sequences. */
export async function register(
  email: string,
  password: string,
): Promise<ApiResult<RegisterResult>> {
  return requestJson(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

/** POST /api/v1/auth/login - creates session, returns session token + CSRF token. */
export async function login(
  email: string,
  password: string,
): Promise<ApiResult<LoginResult>> {
  return requestJson(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

/** POST /api/v1/auth/logout - invalidates the session. Requires CSRF token. */
export async function logout(csrfToken: string): Promise<ApiResult<{ readonly message: string }>> {
  return requestJson(`${API_BASE}/auth/logout`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-CSRF-Token': csrfToken,
    },
  });
}

/** GET /api/v1/auth/me - current user and active membership. */
export async function me(): Promise<ApiResult<MeResult>> {
  return requestJson(`${API_BASE}/auth/me`, {
    method: 'GET',
  });
}

/** GET /api/v1/auth/organizations - all organizations the user belongs to. */
export async function organizations(): Promise<ApiResult<readonly Organization[]>> {
  return requestJson(`${API_BASE}/auth/organizations`, {
    method: 'GET',
  });
}

/** POST /api/v1/auth/switch-organization - switch active organization. Requires CSRF. */
export async function switchOrganization(
  organizationId: string,
  csrfToken: string,
): Promise<ApiResult<{ readonly membership: { readonly id: string; readonly roleKey: string }; readonly organization: { readonly id: string; readonly name: string } }>> {
  return requestJson(`${API_BASE}/auth/switch-organization`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify({ organizationId }),
  });
}
