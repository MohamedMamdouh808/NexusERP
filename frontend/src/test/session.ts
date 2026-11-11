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
import type { MembershipRole, Organization } from '../services/auth-client';
import { PERMISSION_CATALOG } from '@nexuserp/shared';

export interface SeedSignedInOptions {
  readonly email?: string;
  readonly roleKey?: string;
  /** The active organization; defaults to one sample-like fixture. */
  readonly organization?: Organization;
  /** Full switcher list; defaults to just the active organization. */
  readonly organizations?: readonly Organization[];
  /**
   * The caller's effective permissions. Defaults to the whole catalogue,
   * which is what an Administrator holds - the case most screens are written
   * against. A test that needs a reader-only caller says so.
   */
  readonly permissions?: readonly string[];
}

const DEFAULT_USER: SessionUser = {
  id: 'test-user-1',
  email: 'nora.eaton@example.test',
  mustChangePassword: false,
};
const DEFAULT_MEMBERSHIP: SessionMembership = {
  id: 'test-membership-1',
  roles: [{ id: 'test-role-administrator', key: 'administrator', name: 'Administrator' }],
};
const TEST_ROLE_ADMINISTRATOR: readonly MembershipRole[] = [
  { id: 'test-role-administrator', key: 'administrator', name: 'Administrator' },
];
export const TEST_ORGANIZATION: Organization = {
  id: 'test-org-1',
  name: 'Test Organization (One)',
  currencyCode: 'USD',
  roles: TEST_ROLE_ADMINISTRATOR,
};
/** A second membership, so a test can make the switcher real (>1 membership). */
export const TEST_ORGANIZATION_TWO: Organization = {
  id: 'test-org-2',
  name: 'Test Organization (Two)',
  currencyCode: 'USD',
  roles: TEST_ROLE_ADMINISTRATOR,
};

/** Puts the store into the signed-in state a /auth/me answer has just produced. */
export function seedSignedInSession(options: SeedSignedInOptions = {}): SessionState {
  const organization = options.organization ?? TEST_ORGANIZATION;
  const state: SessionState = {
    status: 'signed-in',
    user: { ...DEFAULT_USER, ...(options.email !== undefined ? { email: options.email } : {}) },
    membership: options.roleKey !== undefined
      ? {
          ...DEFAULT_MEMBERSHIP,
          roles: [{ id: 'test-role-custom', key: options.roleKey, name: options.roleKey }],
        }
      : DEFAULT_MEMBERSHIP,
    organization,
    organizations: options.organizations ?? [organization],
    permissions: options.permissions ?? PERMISSION_CATALOG.map((permission) => permission.code),
  };
  hydrateSession(state);
  return state;
}

/** Returns the store to its fresh "nobody has probed yet" state. */
export function resetSession(): void {
  clearSession();
  hydrateSession({ status: 'pending' });
}
