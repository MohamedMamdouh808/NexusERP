/**
 * The signed-in session, held in memory only (T089).
 *
 * The service seam for authentication state. This is the module that knows the
 * session exists; the shell's components read it and never touch the transport
 * themselves (FR-036). Three properties the implementation holds:
 *
 *  - **Memory only.** No token, password or session identifier is ever written
 *    to localStorage, sessionStorage, a URL or a log. The session itself lives
 *    in the service's HttpOnly `session_id` cookie, which JavaScript cannot
 *    read; the only JS-readable value here is the companion CSRF token, kept in
 *    a module variable and attached to state-changing requests by the request
 *    client (FR-011).
 *  - **The service's answers are the truth.** "Am I signed in?" is answered by
 *    probing `GET /auth/me`; nothing is assumed from a cookie's presence. After
 *    a switch of organization the store refetches `me` and `organizations`
 *    rather than trusting the switch response, whose `organization.name` is a
 *    known backend defect (it echoes the organization id).
 *  - **A 401 anywhere ends the session.** The store registers itself as the
 *    request client's unauthorized handler, so one expired session clears
 *    itself whether the 401 came from the probe or from any other call.
 *
 * `hydrateSession` doubles as the test harness's seed entry point: unit tests
 * need a signed-in store without a running service (`src/test/session.ts`).
 */

import { useSyncExternalStore } from 'react';

import {
  setCsrfProvider,
  setUnauthorizedHandler,
  type ApiFailure,
} from '../lib/api-client';
import {
  changePassword,
  login,
  logout,
  me,
  organizations,
  register,
  switchOrganization,
  type MembershipRole,
  type Organization,
} from './auth-client';

/** The active membership, typed for the top bar and the profile screen. */
export interface SessionMembership {
  readonly id: string;
  /** The roles the service attached to this membership (usually one). */
  readonly roles: readonly MembershipRole[];
  /**
   * The member's display name in this organization, when the administrator
   * gave them one. The dashboard greets a member with it, falling back to
   * the email address.
   */
  readonly name?: string | null;
  readonly version?: number;
}

/** The organization the session is scoped to, as /auth/me describes it. */
export interface SessionOrganization {
  readonly id: string;
  readonly name: string;
  /** The ISO 4217 code the organization's prices are in. Read-only. */
  readonly currencyCode: string;
  /** The default due date of an operational invoice, in days. Read-only. */
  readonly defaultPaymentTermsDays: number;
  /** The switchable modules this organization has switched on (FR-027). */
  readonly enabledModules: readonly string[];
}

/** A signed-in user as the service describes them (no password material). */
export interface SessionUser {
  readonly id: string;
  readonly email: string;
  /**
   * True while the account still has to choose its own password.
   *
   * The service refuses every capability except the password change itself while
   * this is set, so the shell has to offer the change before anything else.
   */
  readonly mustChangePassword: boolean;
}

export type SessionState =
  | { readonly status: 'pending' }
  | {
      readonly status: 'signed-in';
      readonly user: SessionUser;
      readonly membership: SessionMembership;
      /** The organization the session is scoped to right now. */
      readonly organization: SessionOrganization;
      /** Every organization the user holds an active membership in. */
      readonly organizations: readonly Organization[];
      /** The caller's effective permissions, as the service resolved them. */
      readonly permissions: readonly string[];
    }
  | { readonly status: 'signed-out' }
  /** The service could not answer the probe; not evidence of signed-out. */
  | { readonly status: 'unreachable'; readonly failure: ApiFailure };

let state: SessionState = { status: 'pending' };

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSessionState(): SessionState {
  return state;
}

/** Reads the session inside a component; re-renders when the store changes. */
export function useSession(): SessionState {
  return useSyncExternalStore(subscribeSession, getSessionState);
}

/**
 * Whether the signed-in caller holds a permission.
 *
 * The service resolves the permissions and sends them with the identity, so
 * this is the service's own answer, not a guess from the role names. An
 * unsigned-in caller holds nothing.
 *
 * A hidden control is NOT security - the server refuses the request either way
 * (Constitution Principle II). This only keeps the interface from offering an
 * action that would be refused.
 */
export function hasPermission(state: SessionState, permission: string): boolean {
  return state.status === 'signed-in' && state.permissions.includes(permission);
}

/**
 * Test and bootstrap entry point that replaces the whole state in one call.
 * The test harness seeds signed-in sessions with it; the store itself uses the
 * narrower transitions below.
 */
export function hydrateSession(next: SessionState): void {
  state = next;
  emit();
}

/* ------------------------------------------------------------------ */
/* CSRF token: in memory, attached centrally by the request client.   */
/* ------------------------------------------------------------------ */

let csrfToken: string | null = null;

// The provider is registered once at module scope, before any request is made.
setCsrfProvider(() => csrfToken);

/** Reads the non-HttpOnly companion cookie into memory. */
function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = 'csrf_token=';
  for (const part of document.cookie.split(';')) {
    const candidate = part.trim();
    if (candidate.startsWith(prefix)) {
      const value = candidate.slice(prefix.length);
      return value.length > 0 ? decodeURIComponent(value) : null;
    }
  }
  return null;
}

function forgetCsrfToken(): void {
  csrfToken = null;
}

/* ------------------------------------------------------------------ */
/* Store transitions                                                  */
/* ------------------------------------------------------------------ */

/** Drops all local session memory: signed-out, no CSRF token. */
export function clearSession(): void {
  forgetCsrfToken();
  if (state.status !== 'signed-out') {
    hydrateSession({ status: 'signed-out' });
  }
}

setUnauthorizedHandler(() => {
  // Only a signed-in store reacts: the /auth/me probe answers 401 as the
  // legitimate "not signed in" answer, and must not alarm anybody signed out.
  if (state.status === 'signed-in') clearSession();
});

/* ------------------------------------------------------------------ */
/* The probe: GET /auth/me + GET /auth/organizations                  */
/* ------------------------------------------------------------------ */

let probe: Promise<void> | null = null;

/** True when a failure means the session is gone (rather than the service). */
function isUnauthenticated(failure: ApiFailure): boolean {
  return failure.status === 401 || failure.code === 'UNAUTHENTICATED';
}

/** Refetches who is signed in and overwrites the store with the answer. */
function loadSignedInSession(): Promise<void> {
  return me().then((meResult) => {
    if (!meResult.ok) {
      if (isUnauthenticated(meResult.failure)) clearSession();
      else hydrateSession({ status: 'unreachable', failure: meResult.failure });
      return;
    }
    csrfToken = readCsrfCookie();
    const meData = meResult.data;
    return organizations().then((orgsResult) => {
      // The organization itself comes from /auth/me (top-level in the
      // contract), and the switcher list from /auth/organizations. A switcher
      // failure cannot make a valid session unauthenticated; it only empties
      // the menu the user can then re-probe.
      hydrateSession({
        status: 'signed-in',
        user: meData.user,
        membership: { id: meData.membership.id, roles: meData.membership.roles, name: meData.membership.name ?? null, version: meData.membership.version ?? 1 },
        organization: meData.organization,
        organizations: orgsResult.ok ? orgsResult.data : [],
        permissions: meData.permissions ?? [],
      });    });
  });
}

/**
 * Asks the service who is signed in, once. Pending by default (the session
 * gate's first render), forced after sign-in or a retry of an unreachable
 * probe: `force` re-probes even when the store is not pending, and never
 * re-runs while a probe is already in flight.
 */
export function bootstrapSession(force = false): Promise<void> {
  if (probe !== null) return probe;
  if (!force && state.status !== 'pending') return Promise.resolve();
  probe = loadSignedInSession()
    .catch((error: unknown) => {
      // requestJson maps HTTP failures and transport failures into the same
      // envelope, so this catch is reserved for a defect in this module. The
      // honest state is "unreachable", not a false sign-out.
      const failure: ApiFailure = {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'The session probe failed.',
        details: [],
        requestId: 'unknown',
        status: 0,
        retryAfterSeconds: null,
      };
      hydrateSession({ status: 'unreachable', failure });
    })
    .finally(() => {
      probe = null;
    });
  return probe;
}

/* ------------------------------------------------------------------ */
/* Sign in / sign out / switch                                        */
/* ------------------------------------------------------------------ */

export type SessionActionOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly failure: ApiFailure };

/**
 * Signs the user in: the service sets the session cookies, then the store
 * re-probes so what the shell shows is the service's answer, not the login
 * response's copy of it.
 */
export async function signIn(email: string, password: string): Promise<SessionActionOutcome> {
  const result = await login(email, password);
  if (!result.ok) return { ok: false, failure: result.failure };
  await bootstrapSession(true);
  return { ok: true };
}

/**
 * Changes the signed-in user's own password.
 *
 * The service rotates the session and issues fresh cookies, so the store
 * re-probes afterwards: what the shell shows next is the service's own answer
 * (including the cleared forced-change flag), never a local guess.
 */
export async function changeOwnPassword(
  currentPassword: string,
  newPassword: string,
): Promise<SessionActionOutcome> {
  const result = await changePassword(currentPassword, newPassword);
  if (!result.ok) return { ok: false, failure: result.failure };
  await bootstrapSession(true);
  return { ok: true };
}

/**
 * Registers the account, then signs the new user in by calling login: the
 * register response carries one-time tokens but sets no cookies, and tokens
 * from a body are never stored. The caller keeps the register failure (the
 * duplicate-email case still answers 500 - a known gap documented in the
 * contract) and the store is untouched in that case.
 */export async function registerAndSignIn(
  email: string,
  password: string,
  organizationName?: string,
  currencyCode?: string,
): Promise<SessionActionOutcome> {
  const result = await register(email, password, organizationName, currencyCode);
  if (!result.ok) return { ok: false, failure: result.failure };
  return signIn(email, password);
}

/**
 * Signs out: asks the service to invalidate the session (its endpoint is a
 * documented gap - it currently answers 403 even with a valid session), then
 * clears the store regardless, because local state must not outlive the
 * user's choice either way.
 */
export async function signOut(): Promise<void> {
  await logout();
  clearSession();
}

/**
 * Switches the active organization through the real endpoint, then refetches
 * the session so the top bar shows names the service itself vouches for.
 */
export async function switchOrganizationForSession(
  organizationId: string,
): Promise<SessionActionOutcome> {
  const result = await switchOrganization(organizationId);
  await bootstrapSession(true);
  if (!result.ok) return { ok: false, failure: result.failure };
  return { ok: true };
}
