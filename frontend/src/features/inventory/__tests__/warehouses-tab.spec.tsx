import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WarehousesTab } from '../warehouses-tab';
import { jsonResponse, renderWithProviders } from '../../../test/render';

/**
 * T052. The warehouses screen against the real contract.
 *
 * A warehouse is named, not coded: the screen must have no Code column and no
 * Code field. The rows carry the real flags (default, active) instead of a
 * sample status string.
 */

const WAREHOUSES = {
  items: [
    { id: 'w-1', name: 'Main Warehouse', isDefault: true, isActive: true, version: 3 },
    { id: 'w-2', name: 'Cold Store', isDefault: false, isActive: false, version: 2 },
  ],
  total: 2,
};

const EMPTY_BALANCES = {
  items: [],
  total: 0,
  totalKind: 'rows',
  lowStockCount: 0,
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
    throw new Error(`unexpected fetch: ${init.method ?? 'GET'} ${url}`);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('warehouses screen (T052)', () => {
  it('lists warehouses by name with the default and active flags, and has no Code column', async () => {
    vi.stubGlobal('fetch', stubInventoryApi());

    renderWithProviders(<WarehousesTab />);

    expect(await screen.findByText('Main Warehouse')).toBeInTheDocument();
    expect(screen.getByText('Cold Store')).toBeInTheDocument();
    expect(screen.getAllByText('Default').length).toBe(1);
    expect(screen.getAllByText('Inactive').length).toBe(1);

    // The headers are the real contract's: no code anywhere.
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Code' })).not.toBeInTheDocument();
  });

  it('opens a new-warehouse dialog with a name field and no code field', async () => {
    vi.stubGlobal('fetch', stubInventoryApi());

    renderWithProviders(<WarehousesTab />);

    await screen.findByText('Main Warehouse');
    fireEvent.click(screen.getByText('New Warehouse'));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByLabelText('Name *')).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Code/)).not.toBeInTheDocument();
  });

  it('sends only name, isDefault and version on a rename, carrying the version it read', async () => {
    const fetchMock = stubInventoryApi();
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<WarehousesTab />);

    await screen.findByText('Main Warehouse');
    // Open the row's action menu, then Edit.
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Main Warehouse' }));
    fireEvent.click(await screen.findByText('Edit'));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Main Hub' } });
    fireEvent.click(screen.getByText('Save changes'));

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(
        (call) => String(call[0]) === '/api/v1/warehouses/w-1',
      );
      expect(put).toBeDefined();
      const init = put![1] as RequestInit;
      expect(init.method).toBe('PUT');
      expect(JSON.parse(String(init.body))).toEqual({
        name: 'Main Hub',
        isDefault: true,
        version: 3,
      });
    });
  });
});
