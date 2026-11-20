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

import { i18nInstance } from '../../i18n';
import type { MembershipRole } from '../../services/auth-client';

const ROLE_LABEL_KEYS: Record<string, string> = {
  administrator: 'shell.roles.administrator',
  member: 'shell.roles.member',
};

export function roleLabel(roles: readonly MembershipRole[] | undefined | null): string {
  const key = roles?.[0]?.key;
  if (key === undefined || key === '') return '—';
  const known = ROLE_LABEL_KEYS[key];
  return known !== undefined
    ? i18nInstance.t(known)
    : key.charAt(0).toUpperCase() + key.slice(1);
}
