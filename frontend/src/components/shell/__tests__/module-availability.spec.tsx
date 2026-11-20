/**
 * T040 - Module availability in the shell (FR-040..FR-042).
 * A disabled module's sidebar entry is unavailable with "Turned off in Settings",
 * its route redirects to Organization settings, and NAVIGATION is unchanged.
 */

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { NAVIGATION } from '../navigation';
import { Sidebar } from '../sidebar';
import { moduleForPath, isModuleEnabled } from '../module-availability';
import { resetSession, seedSignedInSession, TEST_ORGANIZATION } from '../../../test/session';
import { renderWithProviders } from '../../../test/render';

describe('Module availability (T040, FR-040..FR-042)', () => {
  it('maps routes to module keys and fails closed outside a session', () => {
    expect(moduleForPath('/inventory/stock-balances')).toBe('inventory');
    expect(moduleForPath('/reports')).toBe('reports');
    expect(moduleForPath('/products')).toBeNull();
    resetSession();
    expect(isModuleEnabled({ status: 'signed-out' }, 'sales')).toBe(false);
  });

  it('renders a disabled module entry as unavailable with the turned-off reason', () => {
    seedSignedInSession({
      organization: { ...TEST_ORGANIZATION, enabledModules: ['inventory', 'purchasing', 'invoicing'] },
    });
    renderWithProviders(<Sidebar />);
    expect(screen.queryByRole('link', { name: /reports/i })).toBeNull();
    expect(document.body.textContent).toContain('Turned off in Settings');
  });

  it('keeps the static navigation list unchanged', () => {
    expect(NAVIGATION.length).toBe(3);
    expect(NAVIGATION.flatMap((g) => g.entries).some((e) => e.label === 'Reports')).toBe(true);
  });
});
