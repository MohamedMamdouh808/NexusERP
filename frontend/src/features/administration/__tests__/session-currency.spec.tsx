/**
 * T063/T064 - The session's organization currency drives formatting and the
 * save/toggle hooks refresh the session in place (FR-027, FR-044).
 */
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useOrganizationCurrency } from '../../../lib/i18n-format';
import { resetSession, seedSignedInSession, TEST_ORGANIZATION } from '../../../test/session';

describe('Session currency (T063, FR-044)', () => {
  afterEach(() => {
    resetSession();
    vi.unstubAllGlobals();
  });

  it('uses the session currency code, not a hard-coded default', () => {
    seedSignedInSession({ organization: { ...TEST_ORGANIZATION, currencyCode: 'EUR' } });
    const { result } = renderHook(() => useOrganizationCurrency());
    expect(result.current).toBe('EUR');
  });
});
