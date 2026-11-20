/**
 * T021 - Organization General card behaviour (FR-032..FR-035, FR-039).
 */
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GeneralCard } from '../general-card';
import { jsonResponse, renderWithProviders } from '../../../test/render';
import { resetSession, seedSignedInSession } from '../../../test/session';

const SETTINGS = {
  id: 'org-1',
  name: 'Acme Retail',
  currencyCode: 'USD',
  defaultPaymentTermsDays: 30,
  version: 1,
  currencyLocked: false,
  modules: [
    { key: 'inventory', enabled: true, version: 1, locked: false },
    { key: 'purchasing', enabled: true, version: 1, locked: false },
    { key: 'sales', enabled: true, version: 1, locked: false },
    { key: 'invoicing', enabled: true, version: 1, locked: false },
    { key: 'reports', enabled: true, version: 1, locked: false },
  ],
};

describe('Organization General card (T021)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetSession();
  });

  it('renders real settings and the currency-lock reason', async () => {
    seedSignedInSession();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(SETTINGS)),
    );
    renderWithProviders(<GeneralCard onToast={() => {}} />);

    expect(await screen.findByDisplayValue('Acme Retail')).toBeTruthy();
    expect(screen.getByText(/Applies to invoices issued from now on/i)).toBeTruthy();
    expect(screen.getByText(/enforced by the server/i)).toBeTruthy();
  });

  it('shows the locked-currency reason when the server reports a lock', async () => {
    seedSignedInSession();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ...SETTINGS, currencyLocked: true })));
    renderWithProviders(<GeneralCard onToast={() => {}} />);
    expect(await screen.findByText(/Locked once orders or invoices exist/i)).toBeTruthy();
  });
});
