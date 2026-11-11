import { describe, expect, it } from 'vitest';

import { roleLabel } from '../role-label';

/**
 * The role labels shown in the shell (top bar, profile screen).
 *
 * The store's membership comes from the service's `roles` array. The cases that
 * must answer without throwing: a session hydrated from an older shape (no
 * roles at all) — the crash this module once had — and an honest no-role
 * membership.
 */
describe('roleLabel', () => {
  it('does not throw when the membership has no roles (older session shape)', () => {
    expect(() => roleLabel(undefined)).not.toThrow();
    expect(roleLabel(undefined)).toBe('—');
  });

  it('answers an em dash for an empty or role-less membership', () => {
    expect(roleLabel([])).toBe('—');
    expect(roleLabel([{ id: 'r1', key: '', name: 'No key' }])).toBe('—');
  });

  it('names the known v1 role keys', () => {
    expect(roleLabel([{ id: 'r1', key: 'administrator', name: 'Administrator' }])).toBe('Administrator');
    expect(roleLabel([{ id: 'r1', key: 'member', name: 'Member' }])).toBe('Member');
  });

  it('capitalizes an unknown key instead of inventing a label', () => {
    expect(roleLabel([{ id: 'r1', key: 'auditor', name: 'Auditor' }])).toBe('Auditor');
  });

  it('labels the first role when a membership holds several', () => {
    expect(
      roleLabel([
        { id: 'r1', key: 'auditor', name: 'Auditor' },
        { id: 'r2', key: 'member', name: 'Member' },
      ]),
    ).toBe('Auditor');
  });
});
