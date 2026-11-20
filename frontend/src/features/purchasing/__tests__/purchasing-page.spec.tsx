import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PurchasingPage } from '../purchasing-page';
import { jsonResponse, renderWithProviders } from '../../../test/render';

/**
 * The purchasing tabs are routes: /purchasing/receipts must open the receipts
 * tab, not fall back to /purchasing (orders) because it is a path prefix.
 *
 * The module is real: both lists answer over HTTP, and no sample-data banner
 * renders anywhere on the page - purchasing is backed end to end now.
 */

const EMPTY_PAGE = { items: [], total: 0, page: 1, pageSize: 10 };

const ONE_RECEIPT_PAGE = {
  items: [
    {
      id: 'gr-1',
      number: 'GR-000001',
      orderId: 'po-1',
      orderNumber: 'PO-000001',
      supplierId: 'sup-1',
      supplierName: 'Acme Supplies',
      warehouseId: 'w-1',
      warehouseName: 'Main Warehouse',
      receivedAt: '2026-11-13T10:00:00.000Z',
      user: 'warehouse@nexuserp.com',
      lineCount: 1,
    },
  ],
  total: 1,
  page: 1,
  pageSize: 10,
};

function stubLists() {
  return vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    if (url.startsWith('/api/v1/purchase-orders')) return jsonResponse(EMPTY_PAGE);
    if (url.startsWith('/api/v1/goods-receipts')) return jsonResponse(ONE_RECEIPT_PAGE);
    throw new Error(`unexpected fetch: ${init.method ?? 'GET'} ${url}`);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('purchasing page tabs', () => {
  it('opens the goods receipts tab directly from /purchasing/receipts', async () => {
    vi.stubGlobal('fetch', stubLists());

    renderWithProviders(<PurchasingPage />, { initialEntries: ['/purchasing/receipts'] });

    expect(screen.getByRole('tab', { name: 'Goods receipts' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Purchase orders' })).toHaveAttribute('aria-selected', 'false');
    expect(await screen.findByRole('columnheader', { name: 'GR number' })).toBeInTheDocument();
  });

  it('switches to another tab with a single click', async () => {
    vi.stubGlobal('fetch', stubLists());

    renderWithProviders(<PurchasingPage />, { initialEntries: ['/purchasing'] });

    fireEvent.click(screen.getByRole('tab', { name: 'Goods receipts' }));

    expect(screen.getByRole('tab', { name: 'Goods receipts' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('columnheader', { name: 'GR number' })).toBeInTheDocument();
  });

  it('renders no sample-data banner anywhere - purchasing is a real module now', () => {
    vi.stubGlobal('fetch', stubLists());

    const { container } = renderWithProviders(<PurchasingPage />, { initialEntries: ['/purchasing'] });

    expect(container.querySelector('.sample-banner')).toBeNull();
  });
});
