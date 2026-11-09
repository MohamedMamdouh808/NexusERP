/**
 * Session seed helpers for the component suite.
 *
 * The session store is a module singleton that the shell reads through
 * `useSession`. Component tests need a signed-in store without a running
 * service: these helpers write the store directly (the same in-memory shape the
 * probe produces) and reset it, so a test cannot leak its session into the
 * next one.
 *
 * The seeded identities are test fixtures; they never claim to be sample data
 * (`src/mocks/` stays out of the shell) and they never pose as real accounts.
 */

import {
  clearSession,
  hydrateSession,
  type SessionMembership,
  type SessionState,
  type SessionUser,
} from '../services/auth-session';
import type { Organization } from '../services/auth-client';

export interface SeedSignedInOptions {
  readonly email?: string;
  readonly roleKey?: string;
  /** The active organization; defaults to one sample-like fixture. */
  readonly organization?: Organization;
  /** Full switcher list; defaults to just the active organization. */
  readonly organizations?: readonly Organization[];
}

const DEFAULT_USER: SessionUser = { id: 'test-user-1', email: 'nora.eaton@example.test' };
const DEFAULT_MEMBERSHIP: SessionMembership = { id: 'test-membership-1', roleKey: 'administrator' };
export const TEST_ORGANIZATION: Organization = {
  id: 'test-org-1',
  name: 'Test Organization (One)',
  roleKey: 'administrator',
};
/** A second membership, so a test can make the switcher real (>1 membership). */
export const TEST_ORGANIZATION_TWO: Organization = {
  id: 'test-org-2',
  name: 'Test Organization (Two)',
  roleKey: 'administrator',
};

/** Puts the store into the signed-in state a /auth/me answer has just produced. */
export function seedSignedInSession(options: SeedSignedInOptions = {}): SessionState {
  const organization = options.organization ?? TEST_ORGANIZATION;
  const state: SessionState = {
    status: 'signed-in',
    user: { ...DEFAULT_USER, ...(options.email !== undefined ? { email: options.email } : {}) },
    membership: options.roleKey !== undefined
      ? { ...DEFAULT_MEMBERSHIP, roleKey: options.roleKey }
      : DEFAULT_MEMBERSHIP,
    organization,
    organizations: options.organizations ?? [organization],
  };
  hydrateSession(state);
  return state;
}

/** Returns the store to its fresh "nobody has probed yet" state. */
export function resetSession(): void {
  clearSession();
  hydrateSession({ status: 'pending' });
}
