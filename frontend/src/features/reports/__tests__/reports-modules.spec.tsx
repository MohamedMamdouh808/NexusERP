/**
 * T042 - Reports hides each section whose source module is disabled (FR-041).
 */
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReportsPage } from '../reports-page';
import { resetSession, seedSignedInSession, TEST_ORGANIZATION } from '../../../test/session';
import { renderWithProviders, jsonResponse } from '../../../test/render';

function stubReports() {
  vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items: [], total: 0, value: '0', change: '0' })));
}

describe('Reports module-aware sections (T042, FR-041)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetSession();
  });

  it('hides sales-sourced sections and keeps module-neutral and always-on sections', () => {
    seedSignedInSession({
      organization: { ...TEST_ORGANIZATION, enabledModules: ['inventory', 'purchasing', 'invoicing', 'reports'] },
    });
    stubReports();
    renderWithProviders(<ReportsPage />);

    expect(screen.queryByText(/Total sales/i)).toBeNull();
    expect(screen.queryByText(/Sales by category/i)).toBeNull();
    expect(screen.getByText(/Total products/i)).toBeTruthy();
  });
});
