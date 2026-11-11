/**
 * The role labels the interface can name.
 *
 * The service answers a membership's roles as an array
 * (`roles: [{ id, key, name }]`), usually with one entry. The first role's key
 * decides the label: the two known v1 keys get their human labels, an unknown
 * key shows capitalized rather than invented, and a membership with no role
 * (an honest possibility) shows an em dash rather than crashing. The input is
 * read defensively - a stale session written by an older shape must degrade to
 * "no role", not throw.
 */

import type { MembershipRole } from '../../services/auth-client';

const ROLE_LABELS: Record<string, string> = {
  administrator: 'Administrator',
  member: 'Member',
};

export function roleLabel(roles: readonly MembershipRole[] | undefined | null): string {
  const key = roles?.[0]?.key;
  if (key === undefined || key === '') return '—';
  const known = ROLE_LABELS[key];
  return known ?? key.charAt(0).toUpperCase() + key.slice(1);
}
