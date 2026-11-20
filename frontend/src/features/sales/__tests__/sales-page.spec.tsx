import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SalesPage } from '../sales-page';
import { jsonResponse, renderWithProviders } from '../../../test/render';

/**
 * The sales tabs are routes: /sales/shipments must open the shipments tab, not
 * fall back to /sales (orders) because it is a path prefix.
 *
 * The page reads the real service, so the fetch layer is stubbed at the seam
 * the client uses; the payloads are the service's own page shapes.
 */
afterEach(() => {
  vi.unstubAllGlobals();
});

const SHIPMENTS = [
  {
    id: 'sh-1',
    number: 'SH-000001',
    orderId: 'so-1',
    orderNumber: 'SO-000001',
    customerId: 'cust-1',
    customerName: 'Acme Retail',
    warehouseId: 'w-1',
    warehouseName: 'Main Warehouse',
    shippedAt: '2026-11-10T09:00:00.000Z',
    user: 'Amina Hassan',
    lineCount: 1,
  },
] as const;

function stubSalesApi() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/api/v1/shipments')) {
      return jsonResponse({ items: SHIPMENTS, total: SHIPMENTS.length });
    }
    if (url.startsWith('/api/v1/sales-orders')) {
      return jsonResponse({ items: [], total: 0 });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
}

describe('sales page tabs', () => {
  it('opens the shipments tab directly from /sales/shipments', async () => {
    stubSalesApi();
    renderWithProviders(<SalesPage />, { initialEntries: ['/sales/shipments'] });

    expect(screen.getByRole('tab', { name: 'Shipments' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Sales orders' })).toHaveAttribute('aria-selected', 'false');
    expect(await screen.findByRole('columnheader', { name: 'SH number' })).toBeInTheDocument();
  });

  it('switches to another tab with a single click', async () => {
    stubSalesApi();
    renderWithProviders(<SalesPage />, { initialEntries: ['/sales'] });
    expect(screen.getByRole('tab', { name: 'Sales orders' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByRole('tab', { name: 'Shipments' }));

    expect(screen.getByRole('tab', { name: 'Shipments' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('columnheader', { name: 'SH number' })).toBeInTheDocument();
  });
});
