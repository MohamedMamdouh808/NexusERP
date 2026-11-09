/**
 * Auth client - the frontend's half of the service seam for authentication.
 *
 * Source of truth: `docs/api-auth-contract.md` and `backend/openapi.json`
 * (`contract-drift.spec.ts` fails the backend build when they drift).
 *
 * Every call goes through `requestJson` from `api-client.ts`, which maps every
 * response into the shared error envelope `{ code, message, details, requestId }`.
 *
 * The session lives only in the browser's `session_id` HttpOnly cookie, which
 * JavaScript can never read. The companion `csrf_token` cookie is readable by
 * design; the session store (NOT this module) reads it into memory once per
 * session and the request client attaches it as `X-CSRF-Token` on every
 * state-changing request (FR-011). No response-body token is ever stored.
 *
 * Login failures carry no distinguishable detail: wrong password and unknown
 * email answer the same 404 `NOT_FOUND` with the same generic message, so
 * callers treat ANY login failure as "the email address or password is not
 * correct" and never branch on status (FR-010).
 */

import { requestJson, type ApiResult } from '../lib/api-client';

const API_BASE = '/api/v1';

/**
 * The register response. `sessionToken`/`csrfToken` are returned ONCE here and
 * the endpoint sets no cookies, so the interface signs the new user in with a
 * follow-up login call instead of using them. They are typed for the contract,
 * never read.
 */
export interface RegisterResult {
  readonly user: { readonly id: string; readonly email: string };
  readonly organization: { readonly id: string; readonly name: string };
  readonly membership: { readonly id: string; readonly roleKey: string };
  readonly session: { readonly id: string };
  readonly sessionToken: string;
  readonly csrfToken: string;
}

/** The login response 200 body - tokens live in the cookies, NOT in the body. */
export interface LoginResult {
  readonly user: { readonly id: string; readonly email: string };
  readonly membership: {
    readonly id: string;
    readonly roleKey: string;
    readonly organization: { readonly id: string; readonly name: string };
  };
}

/** GET /auth/me 200 body: the active membership and its organization. */
export interface MeResult {
  readonly user: { readonly id: string; readonly email: string };
  readonly membership: {
    readonly id: string;
    readonly roleKey: string;
    readonly isActive: boolean;
  };
  readonly organization: { readonly id: string; readonly name: string };
}

/** One active membership, as the org switcher lists them. */
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

/** POST /api/v1/auth/login - sets the session cookies (nothing stored from the body). */
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

/**
 * POST /api/v1/auth/logout - invalidates the session server-side and clears
 * both cookies. The CSRF header and the credentials are attached by the request
 * client. Known backend gap (see the contract): the endpoint currently answers
 * 403 for everyone, so the session store clears local state regardless of this
 * call's outcome.
 */
export async function logout(): Promise<ApiResult<{ readonly message: string }>> {
  return requestJson(`${API_BASE}/auth/logout`, { method: 'POST' });
}

/** GET /api/v1/auth/me - current user, active membership and organization. */
export async function me(): Promise<ApiResult<MeResult>> {
  return requestJson(`${API_BASE}/auth/me`, { method: 'GET' });
}

/** GET /api/v1/auth/organizations - all organizations the user belongs to. */
export async function organizations(): Promise<ApiResult<readonly Organization[]>> {
  return requestJson(`${API_BASE}/auth/organizations`, {
    method: 'GET',
  });
}

/**
 * POST /api/v1/auth/switch-organization - switches the session's active
 * membership. The response's `organization.name` is a known backend defect
 * (it currently echoes the organization id), so callers must not trust it:
 * the session store refetches `/auth/me` and `/auth/organizations` afterwards.
 */
export async function switchOrganization(
  organizationId: string,
): Promise<ApiResult<SwitchOrganizationResult>> {
  return requestJson(`${API_BASE}/auth/switch-organization`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organizationId }),
  });
}

/** The switch response shape - kept for the contract, never trusted for names. */
export interface SwitchOrganizationResult {
  readonly membership: { readonly id: string; readonly roleKey: string };
  readonly organization: { readonly id: string; readonly name: string };
}
