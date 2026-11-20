import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

import { createTestQueryClient } from '../../../test/render';
import { resetSession, seedSignedInSession } from '../../../test/session';
import { OverviewPage } from '../dashboard-page';
import { dashboardFetch, fetchRouter } from './dashboard-fixtures';

/**
 * The measured request counts (T029, FR-016).
 *
 * Two numbers are recorded per role: the first batch - 8 for a full
 * Administrator - and the total until every widget has settled, never
 * described as 8. What is not visible is never asked: no 403 ever shows up,
 * because the request is never issued.
 */

/** The path prefix that identifies each widget's request, distinguishing the two stock calls. */
function requestKey(url: string): string {
  if (url.includes('reports/kpi-summary')) return 'kpi-summary';
  if (url.includes('reports/sales-over-time')) return 'sales-over-time';
  if (url.includes('reports/documents-by-status')) return 'documents-by-status';
  if (url.includes('reports/receivables-aging')) return 'receivables-aging';
  if (url.includes('reports/stock-reconciliation')) return 'stock-reconciliation';
  if (url.includes('audit-logs')) return 'audit-logs';
  if (url.includes('products?')) return 'checklist-products';
  if (url.includes('contacts?')) return 'checklist-contacts';
  if (url.includes('/invoices?')) return 'overdue-invoices';
  if (url.includes('sales-orders?')) return 'confirmed-sales-orders';
  if (url.includes('purchase-orders?')) return 'purchase-orders-awaiting';
  if (url.includes('lowStockOnly=true')) return 'low-stock-products';
  if (url.includes('/inventory/stock-balances')) return 'checklist-stock';
  return url;
}

const FIRST_BATCH = new Set([
  'kpi-summary',
  'sales-over-time',
  'documents-by-status',
  'receivables-aging',
  'overdue-invoices',
  'confirmed-sales-orders',
  'purchase-orders-awaiting',
  'low-stock-products',
]);

const SETTLED_ALL = new Set([
  ...FIRST_BATCH,
  'stock-reconciliation',
  'audit-logs',
  'checklist-products',
  'checklist-contacts',
  'checklist-stock',
]);

describe('Dashboard request counts (T029)', () => {
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

  it('an Administrator dispatches exactly eight together, then settles at thirteen', async () => {
    seedSignedInSession();
    const fetchMock = stubAllEndpoints();
    renderDashboard();

    await screen.findByText(/How are we doing/);
    const keys = fetchMock.mock.calls.map(([input]) => requestKey(String(input)));

    // The first eight dispatched requests are the first batch, in whatever
    // order the hooks mounted, never including a deferred widget.
    expect(keys.length).toBeGreaterThanOrEqual(13);
    expect(new Set(keys.slice(0, 8))).toEqual(FIRST_BATCH);
    expect(new Set(keys.slice(8))).toEqual(new Set(['stock-reconciliation', 'audit-logs', 'checklist-products', 'checklist-contacts', 'checklist-stock']));
    expect(new Set(keys)).toEqual(SETTLED_ALL);
    expect(new Set(keys).size).toBe(13);
  });

  it('a sales-reader dispatches only the sales attention list, and no error follows', async () => {
    seedSignedInSession({ permissions: ['sales.read', 'sales.write'] });
    const fetchMock = stubAllEndpoints();
    renderDashboard();

    await screen.findByText('Sales orders awaiting shipment');
    const keys = fetchMock.mock.calls.map(([input]) => requestKey(String(input)));

    expect(keys).toEqual(['confirmed-sales-orders']);
    expect(keys).not.toContain('kpi-summary');
    expect(keys).not.toContain('audit-logs');
  });

  it('an invoices-reader dispatches only the overdue attention list', async () => {
    seedSignedInSession({ permissions: ['invoices.read'] });
    const fetchMock = stubAllEndpoints();
    renderDashboard();

    await screen.findByText('Overdue invoices');
    const keys = fetchMock.mock.calls.map(([input]) => requestKey(String(input)));

    expect(keys).toEqual(['overdue-invoices']);
    expect(keys).not.toContain('confirmed-sales-orders');
  });

  it('a products reader gets the welcome and exactly one deferred request', async () => {
    seedSignedInSession({ permissions: ['products.read'] });
    const fetchMock = stubAllEndpoints();
    renderDashboard();

    // The dashboard shows the bare welcome, but the checklist's one readable
    // count still dispatches - the analytics and attention batches never do.
    expect(await screen.findByText('No dashboard widgets yet')).toBeInTheDocument();
    const keys = fetchMock.mock.calls.map(([input]) => requestKey(String(input)));

    expect(keys).toEqual(['checklist-products']);
    expect(keys).not.toContain('kpi-summary');
    expect(keys).not.toContain('overdue-invoices');
  });
});
