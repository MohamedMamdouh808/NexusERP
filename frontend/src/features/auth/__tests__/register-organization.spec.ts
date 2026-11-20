/**
 * T050 - Registration form validation mirrors the server (FR-043).
 */
import { describe, expect, it } from 'vitest';
import { validateRegistration } from '../register-page';

const t = (key: string) => key;

describe('Registration form (T050, FR-043)', () => {
  it('requires a supported currency and defaults from the form state', () => {
    const base = { email: 'a@b.com', password: 'Password1234', organizationName: '', currencyCode: 'USD' };
    expect(validateRegistration(base, t).currencyCode).toBeUndefined();
    expect(validateRegistration({ ...base, currencyCode: 'CAD' }, t).currencyCode).toBeDefined();
  });

  it('accepts a 1-100 character optional name and refuses over-long names', () => {
    const base = { email: 'a@b.com', password: 'Password1234', currencyCode: 'USD' };
    expect(validateRegistration({ ...base, organizationName: 'A' }, t).organizationName).toBeUndefined();
    expect(validateRegistration({ ...base, organizationName: 'x'.repeat(101) }, t).organizationName).toBeDefined();
  });
});
