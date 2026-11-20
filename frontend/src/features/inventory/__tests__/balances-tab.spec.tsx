import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StockBalancesTab } from '../balances-tab';
import { jsonResponse, renderWithProviders } from '../../../test/render';

/**
 * T050. The stock balances screen against the real contract.
 *
 * One endpoint answers three selections with one row shape. The screen must
 * render BOTH shapes it can receive - a real balance row (hasStockRow) and a
 * product-level low-stock row for a product that has no stock rows yet - label
 * the total with what it counts, show the two hints that keep invisible stock
 * discoverable, and offer the archived-with-stock filter.
 */

const WAREHOUSES = {
  items: [
    { id: 'w-1', name: 'Main Warehouse', isDefault: true, isActive: true, version: 1 },
  ],
  total: 1,
};

const BALANCES = {
  items: [
    {
      productId: 'p-1',
      sku: 'SKU-1',
      productName: 'Drill',
      warehouseId: 'w-1',
      warehouseName: 'Main Warehouse',
      onHand: '5.000',
      reserved: '1.000',
      available: '4.000',
      archived: false,
      status: 'IN_STOCK',
      hasStockRow: true,
    },
    {
      productId: 'p-2',
      sku: 'SKU-2',
      productName: 'Saw',
      warehouseId: 'w-1',
      warehouseName: 'Main Warehouse',
      onHand: '0.000',
      reserved: '0.000',
      available: '0.000',
      archived: false,
      status: 'LOW_STOCK',
      hasStockRow: false,
    },
  ],
  total: 2,
  totalKind: 'rows',
  lowStockCount: 3,
};

const ARCHIVED_COUNT = {
  items: [],
  total: 2,
  totalKind: 'products',
  lowStockCount: 0,
};

function stubInventoryApi() {
  return vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    if (url.startsWith('/api/v1/warehouses')) {
      return jsonResponse(WAREHOUSES);
    }
    if (url.includes('status=archivedWithStock')) {
      return jsonResponse(ARCHIVED_COUNT);
    }
    if (url.startsWith('/api/v1/inventory/stock-balances')) {
      return jsonResponse(BALANCES);
    }
    throw new Error(`unexpected fetch: ${init.method ?? 'GET'} ${url}`);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('stock balances screen (T050)', () => {
  it('renders both row shapes, with the no-stock-yet product marked', async () => {
    vi.stubGlobal('fetch', stubInventoryApi());

    renderWithProviders(<StockBalancesTab />);

    // The real balance row.
    expect(await screen.findByText('SKU-1')).toBeInTheDocument();
    expect(screen.getByText('Drill')).toBeInTheDocument();

    // The product-level row of a product with no stock rows: shown, and
    // labelled so its zero quantities are never mistaken for a real balance.
    expect(screen.getByText('SKU-2')).toBeInTheDocument();
    expect(screen.getAllByText('No stock yet').length).toBeGreaterThan(0);
  });

  it('labels the total with what it counts: balance rows here', async () => {
    vi.stubGlobal('fetch', stubInventoryApi());

    renderWithProviders(<StockBalancesTab />);

    await screen.findByText('SKU-1');
    expect(screen.getByTestId('balances-total')).toHaveTextContent('2 balance rows');
  });

  it('shows the products-need-attention hint when low-stock products are not all visible', async () => {
    vi.stubGlobal('fetch', stubInventoryApi());

    renderWithProviders(<StockBalancesTab />);

    await screen.findByText('SKU-1');
    // lowStockCount is 3, only one low row is on this page.
    expect(screen.getByTestId('low-stock-hint')).toHaveTextContent(
      '3 products need attention, some have no stock rows yet. Show low stock',
    );
  });

  it('shows the archived-stock hint and offers the archived-with-stock filter', async () => {
    const fetchMock = stubInventoryApi();
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<StockBalancesTab />);

    await screen.findByText('SKU-1');
    expect(screen.getByTestId('archived-hint')).toHaveTextContent(
      '2 archived products still hold stock. Show them',
    );
    expect(
      screen.getByRole('option', { name: 'Archived with stock' }),
    ).toBeInTheDocument();

    // The hint is fed by the archived-with-stock selection, not by a count of
    // the page's own rows.
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).includes('status=archivedWithStock')),
    ).toBe(true);
  });
});
