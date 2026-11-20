import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OrdersTab } from '../orders-tab';
import { jsonResponse, renderWithProviders } from '../../../test/render';

/**
 * T065. The orders screen shows the server's progress summary.
 *
 * The service is the only place that knows how much of an order has arrived:
 * the list row carries `progress`, and the screen renders it verbatim - it
 * never re-adds the line quantities itself. A draft carries no figure at all.
 */

const ORDERS = [
  {
    id: 'po-1',
    number: 'PO-000001',
    supplierId: 'sup-1',
    supplierName: 'Acme Supplies',
    warehouseId: 'w-1',
    warehouseName: 'Main Warehouse',
    status: 'PARTIALLY_RECEIVED',
    orderDate: '2026-11-01',
    expectedDate: null,
    notes: '',
    total: '1234.50',
    progress: { kind: 'QUANTITY', receivedTotal: '40.000', orderedTotal: '100.000', unitOfMeasure: 'roll' },
  },
  {
    id: 'po-2',
    number: 'PO-000002',
    supplierId: 'sup-1',
    supplierName: 'Acme Supplies',
    warehouseId: 'w-1',
    warehouseName: 'Main Warehouse',
    status: 'PARTIALLY_RECEIVED',
    orderDate: '2026-11-02',
    expectedDate: null,
    notes: '',
    total: '555.00',
    progress: { kind: 'LINES', fullyReceivedLineCount: 2, lineCount: 5 },
  },
  {
    id: 'po-3',
    number: 'PO-000003',
    supplierId: 'sup-1',
    supplierName: 'Acme Supplies',
    warehouseId: 'w-1',
    warehouseName: 'Main Warehouse',
    status: 'DRAFT',
    orderDate: '2026-11-03',
    expectedDate: null,
    notes: '',
    total: '0.00',
    progress: { kind: 'NONE' },
  },
] as const;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('orders screen shows the server progress summary (T065)', () => {
  it('renders the three branches verbatim and never computes its own figure', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      if (url.startsWith('/api/v1/purchase-orders?')) {
        return jsonResponse({ items: ORDERS, total: ORDERS.length, page: 1, pageSize: 10 });
      }
      throw new Error(`unexpected fetch: ${init.method ?? 'GET'} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<OrdersTab />);

    // The uniform-unit branch: quantities with the shared unit abbreviation.
    expect(await screen.findByText('40 of 100 roll')).toBeInTheDocument();
    // The mixed-unit branch: fully-received line counts.
    expect(screen.getByText('2 of 5 lines fully received')).toBeInTheDocument();
    // A draft carries no progress figure at all.
    const dashCells = screen.getAllByText('—');
    expect(dashCells.length).toBeGreaterThan(0);
  });
});
