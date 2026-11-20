import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

import { createTestQueryClient } from '../../../test/render';
import { resetSession, seedSignedInSession } from '../../../test/session';
import { OverviewPage } from '../dashboard-page';
import { dashboardFetch, fetchRouter } from './dashboard-fixtures';

/**
 * US6 - the first-use checklist (T024, FR-021..FR-023).
 *
 * The counts are the service's own; a step with something real behind it
 * ticks itself; the finished list disappears; the card is never dismissible.
 */
describe('Dashboard first-use checklist (T024)', () => {
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

  it('ticks the steps the member has real data behind', async () => {
    seedSignedInSession();
    stubAllEndpoints();
    renderDashboard();

    // The fixture: 3 customers, no products, no stock.
    const customerStep = await screen.findByRole('link', { name: /Add a customer/ });
    expect(customerStep.closest('li')?.className).toContain('is-complete');
    const productStep = screen.getByRole('link', { name: /Add a product/ });
    expect(productStep.closest('li')?.className).not.toContain('is-complete');
    const stockStep = screen.getByRole('link', { name: /Add stock/ });
    expect(stockStep.closest('li')?.className).not.toContain('is-complete');
  });

  it('offers the steps for the member\'s permissions only', async () => {
    seedSignedInSession({ permissions: ['sales.read', 'contacts.read'] });
    const fetchMock = fetchRouter([
      {
        match: (url) => url.startsWith('/api/v1/contacts?'),
        respond: () =>
          new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 1 }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      },
      ...dashboardFetch(),
    ]);
    vi.stubGlobal('fetch', fetchMock);
    renderDashboard();

    expect(await screen.findByRole('link', { name: /Add a customer/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Add a product/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Add stock/ })).not.toBeInTheDocument();
    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(urls.some((url) => url.includes('/api/v1/products'))).toBe(false);
    expect(urls.some((url) => url.includes('/api/v1/contacts'))).toBe(true);
  });

  it('requests the counts with pageSize 1', async () => {
    seedSignedInSession();
    const fetchMock = stubAllEndpoints();
    renderDashboard();

    await screen.findByRole('link', { name: /Add a customer/ });
    const countCalls = fetchMock.mock.calls
      .map(([input]) => String(input))
      .filter((url) => url.includes('pageSize=1'));
    expect(countCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('disappears when the data steps are all complete', async () => {
    seedSignedInSession();
    const fetchMock = fetchRouter([
      { match: (url) => url.startsWith('/api/v1/products?'), respond: () => new Response(JSON.stringify({ items: [{ id: 'p-1' }], total: 5, page: 1, pageSize: 1 }), { status: 200, headers: { 'content-type': 'application/json' } }) },
      { match: (url) => url.startsWith('/api/v1/contacts?'), respond: () => new Response(JSON.stringify({ items: [{ id: 'c-1' }], total: 3, page: 1, pageSize: 1 }), { status: 200, headers: { 'content-type': 'application/json' } }) },
      { match: (url) => url.startsWith('/api/v1/inventory/stock-balances') && !url.includes('lowStockOnly=true'), respond: () => new Response(JSON.stringify({ items: [{ id: 's-1' }], total: 7, page: 1, pageSize: 1 }), { status: 200, headers: { 'content-type': 'application/json' } }) },
      ...dashboardFetch(),
    ]);
    vi.stubGlobal('fetch', fetchMock);
    renderDashboard();

    await screen.findByText(/Sales orders awaiting shipment/);
    expect(screen.queryByText('Get started')).not.toBeInTheDocument();
  });

  it('shows the progress figure', async () => {
    seedSignedInSession();
    stubAllEndpoints();
    renderDashboard();

    expect(await screen.findByText(/1 of 3 done/)).toBeInTheDocument();
  });

  it('is not dismissible anywhere', async () => {
    seedSignedInSession();
    stubAllEndpoints();
    renderDashboard();

    await screen.findByRole('link', { name: /Add a customer/ });
    expect(screen.queryByRole('button', { name: /dismiss|hide|skip/i })).not.toBeInTheDocument();
  });
});
