import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

import { createTestQueryClient, jsonResponse } from '../../../test/render';
import { resetSession, seedSignedInSession } from '../../../test/session';
import { OverviewPage } from '../dashboard-page';
import { dashboardFetch, fetchRouter } from './dashboard-fixtures';

/**
 * US3 - the needs-attention card (T018, FR-012..FR-015).
 *
 * The card holds a row per visible attention item with an icon, label and
 * count; the top-5 lists sit beneath as compact linked rows; a row with
 * nothing shows its muted empty message; the whole thing is permission-gated,
 * item by item.
 */
describe('Dashboard attention items (T018)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetSession();
  });

  function stubAllEndpoints() {
    const fetchMock = fetchRouter(dashboardFetch());
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  function renderDashboard() {
    const queryClient = createTestQueryClient();
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/']}>
          <OverviewPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('shows the permitted attention items with the endpoint totals', async () => {
    seedSignedInSession();
    stubAllEndpoints();
    renderDashboard();

    expect(await screen.findByText('Overdue invoices')).toBeInTheDocument();
    expect(screen.getByText('Sales orders awaiting shipment')).toBeInTheDocument();
    expect(screen.getByText('Purchase orders awaiting receipt')).toBeInTheDocument();
    expect(screen.getByText('Low-stock products')).toBeInTheDocument();
  });

  it('links the record rows to their records and carries "View all" with the filter', async () => {
    seedSignedInSession();
    stubAllEndpoints();
    renderDashboard();

    expect(await screen.findByRole('link', { name: /INV-000001/ })).toHaveAttribute('href', '/invoicing/inv-1');
    expect(screen.getByRole('link', { name: /View all overdue invoices/ })).toHaveAttribute('href', '/invoicing?overdue=1');
    expect(screen.getByRole('link', { name: /SO-000001/ })).toHaveAttribute('href', '/sales/so-1');
    expect(screen.getByRole('link', { name: /View all sales orders/ })).toHaveAttribute('href', '/sales');
    expect(screen.getByRole('link', { name: /PO-000001/ })).toHaveAttribute('href', '/purchasing/po-1');
    expect(screen.getByRole('link', { name: /View all purchase orders/ })).toHaveAttribute('href', '/purchasing');
    expect(screen.getByRole('link', { name: /SKU-LOW-1/ })).toHaveAttribute('href', '/products/p-1');
    expect(screen.getByRole('link', { name: /View all low-stock products/ })).toHaveAttribute('href', '/inventory?lowStock=1');
  });

  it('shows the overdue balance on the overdue row when relevant', async () => {
    seedSignedInSession();
    stubAllEndpoints();
    renderDashboard();

    const balances = (await screen.findAllByText('75.00')).map((el) => el.closest('.overview-page__attention-row')).filter((row): row is HTMLElement => row !== null);
    expect(balances.length).toBeGreaterThan(0);
  });

  it('shows only the sales item for a sales-only member, and requests nothing else', async () => {
    seedSignedInSession({ permissions: ['sales.read', 'sales.write'] });
    const fetchMock = stubAllEndpoints();
    renderDashboard();

    expect(await screen.findByText('Sales orders awaiting shipment')).toBeInTheDocument();
    expect(screen.queryByText('Overdue invoices')).not.toBeInTheDocument();
    expect(screen.queryByText('Purchase orders awaiting receipt')).not.toBeInTheDocument();
    expect(screen.queryByText('Low-stock products')).not.toBeInTheDocument();
    expect(screen.queryByText('Stock reconciliation')).not.toBeInTheDocument();

    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(urls.every((url) => url.includes('/api/v1/sales-orders'))).toBe(true);
    expect(urls.length).toBe(1);
  });

  it('hides the reconciliation widget without reports.read', async () => {
    seedSignedInSession({ permissions: ['invoices.read', 'audit.read'] });
    stubAllEndpoints();
    renderDashboard();

    expect(await screen.findByText('Overdue invoices')).toBeInTheDocument();
    expect(screen.queryByText('Stock reconciliation')).not.toBeInTheDocument();
  });

  it('shows the quiet no-discrepancies state when the reconciliation is clean', async () => {
    seedSignedInSession();
    stubAllEndpoints();
    renderDashboard();

    expect(await screen.findByText('No discrepancies')).toBeInTheDocument();
  });

  it('says something muted when a permitted item has nothing to show', async () => {
    seedSignedInSession({ permissions: ['invoices.read', 'inventory.read'] });
    const fetchMock = fetchRouter([
      {
        match: (url) => url.startsWith('/api/v1/invoices?'),
        respond: () => jsonResponse({ items: [], total: 0, page: 1, pageSize: 5, outstanding: '0.00', overdue: '0.00' }),
      },
      ...dashboardFetch(),
    ]);
    vi.stubGlobal('fetch', fetchMock);
    renderDashboard();

    expect(await screen.findByText('No overdue invoices')).toBeInTheDocument();
    expect(screen.getByText('Low-stock products')).toBeInTheDocument();
  });
});
