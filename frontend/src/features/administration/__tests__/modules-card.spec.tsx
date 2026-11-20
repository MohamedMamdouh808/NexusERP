/**
 * T033 - Modules card behaviour (FR-036..FR-039).
 */
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ModulesCard } from '../modules-card';
import { jsonResponse, renderWithProviders } from '../../../test/render';
import { resetSession, seedSignedInSession } from '../../../test/session';

const MODULES = {
  modules: [
    { key: 'inventory', enabled: true, version: 1, locked: false },
    { key: 'purchasing', enabled: true, version: 1, locked: false },
    { key: 'sales', enabled: true, version: 1, locked: false },
    { key: 'invoicing', enabled: true, version: 1, locked: false },
    { key: 'reports', enabled: true, version: 1, locked: false },
    { key: 'contacts', enabled: true, version: 1, locked: true },
    { key: 'products', enabled: true, version: 1, locked: true },
    { key: 'settings', enabled: true, version: 1, locked: true },
    { key: 'audit', enabled: true, version: 1, locked: true },
  ],
};

describe('Organization Modules card (T033)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetSession();
  });

  it('renders five switchable switches and four locked always-on modules', async () => {
    seedSignedInSession();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(MODULES)));
    renderWithProviders(<ModulesCard onToast={() => {}} />);

    expect((await screen.findAllByRole('switch')).length).toBe(5);
    expect(screen.getAllByText(/Locked on/i).length).toBe(4);
  });
});
