import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReceiptsTab } from '../receipts-tab';
import { jsonResponse, renderWithProviders } from '../../../test/render';

/**
 * T066. The receipts screen, one row per receipt.
 *
 * The service aggregates per receipt: every receipt appears ONCE, with its
 * line count and - only when every line shares one unit of measure - the
 * total received quantity with that unit. The whole-selection total counts
 * RECEIPTS, not rows, and says so. A received-date range with its end before
 * its start is refused inline before any request is made.
 */

const RECEIPTS = [
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
    lineCount: 3,
    receivedTotal: '12.500',
    unitOfMeasure: 'roll',
  },
  {
    id: 'gr-2',
    number: 'GR-000002',
    orderId: 'po-2',
    orderNumber: 'PO-000002',
    supplierId: 'sup-1',
    supplierName: 'Acme Supplies',
    warehouseId: 'w-1',
    warehouseName: 'Main Warehouse',
    receivedAt: '2026-11-12T09:30:00.000Z',
    user: 'warehouse@nexuserp.com',
    lineCount: 2,
  },
] as const;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('receipts screen shows one row per receipt (T066)', () => {
  it('renders the line count and the conditional aggregate, and labels the total as receipts', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      if (url.startsWith('/api/v1/goods-receipts?')) {
        return jsonResponse({ items: RECEIPTS, total: RECEIPTS.length, page: 1, pageSize: 10 });
      }
      throw new Error(`unexpected fetch: ${init.method ?? 'GET'} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<ReceiptsTab />);

    // One row per receipt.
    expect(await screen.findByText('GR-000001')).toBeInTheDocument();
    expect(screen.getByText('GR-000002')).toBeInTheDocument();

    // The line counts.
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();

    // The conditional aggregate: present for the uniform-unit receipt, absent
    // for the mixed-unit one.
    expect(screen.getByText('12.5 roll')).toBeInTheDocument();

    // The whole-selection total counts receipts, and says so.
    expect(screen.getByText('2 receipts')).toBeInTheDocument();
  });

  it('refuses an end date before the start date inline and does not fire the request', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      if (url.startsWith('/api/v1/goods-receipts?')) {
        return jsonResponse({ items: RECEIPTS, total: RECEIPTS.length, page: 1, pageSize: 10 });
      }
      throw new Error(`unexpected fetch: ${init.method ?? 'GET'} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<ReceiptsTab />);

    // The first (valid) load fires exactly one list request.
    expect(await screen.findByRole('columnheader', { name: 'GR number' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Setting the start date is a valid, different query: one more request.
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-11-10' } });
    expect(await screen.findByRole('columnheader', { name: 'GR number' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // The end date closes the range with end < start: refused inline, and no
    // list request carrying the refused range is made.
    fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-11-01' } });

    expect(screen.getByText('The end date must not be before the start date.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
