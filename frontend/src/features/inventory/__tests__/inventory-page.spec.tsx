import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InventoryPage } from '../inventory-page';
import { jsonResponse, renderWithProviders } from '../../../test/render';

/**
 * The inventory tabs are routes, so the pathname must decide which tab is
 * active. Prefix matching made /inventory/movements resolve to the balances
 * tab until a second click set local state.
 */

const WAREHOUSES = {
  items: [{ id: 'w-1', name: 'Main Warehouse', isDefault: true, isActive: true, version: 1 }],
  total: 1,
};

const EMPTY_BALANCES = {
  items: [],
  total: 0,
  totalKind: 'rows',
  lowStockCount: 0,
};

const EMPTY_MOVEMENTS = {
  items: [],
  total: 0,
};

function stubInventoryApi() {
  return vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    if (url.startsWith('/api/v1/warehouses')) {
      return jsonResponse(WAREHOUSES);
    }
    if (url.startsWith('/api/v1/inventory/stock-balances')) {
      return jsonResponse(EMPTY_BALANCES);
    }
    if (url.startsWith('/api/v1/inventory/stock-movements')) {
      return jsonResponse(EMPTY_MOVEMENTS);
    }
    throw new Error(`unexpected fetch: ${init.method ?? 'GET'} ${url}`);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('inventory page tabs', () => {
  it('opens the movements tab directly from /inventory/movements', async () => {
    vi.stubGlobal('fetch', stubInventoryApi());

    renderWithProviders(<InventoryPage />, { initialEntries: ['/inventory/movements'] });

    expect(screen.getByRole('tab', { name: 'Movements' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Stock balances' })).toHaveAttribute('aria-selected', 'false');
    expect(await screen.findByText('No movements match your filters')).toBeInTheDocument();
  });

  it('switches to another tab with a single click', async () => {
    vi.stubGlobal('fetch', stubInventoryApi());

    renderWithProviders(<InventoryPage />, { initialEntries: ['/inventory'] });
    expect(await screen.findByRole('region', { name: 'Stock balances' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Warehouses' }));

    expect(await screen.findByText('Main Warehouse')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Warehouses' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByTestId('balances-total')).not.toBeInTheDocument();
  });
});
