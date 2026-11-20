import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  useGoodsReceipts,
  usePurchaseOrder,
  usePurchaseOrders,
  useReceiveGoods,
} from '../use-purchasing';
import { createTestQueryClient, jsonResponse } from '../../../test/render';

/**
 * T064. The purchasing hooks are the seam between the screens and the service.
 *
 * What matters here is WHERE the data comes from: every hook must answer
 * through the real HTTP client (`services/purchasing-client.ts` →
 * `/api/v1/...`) and never through the sample service, whose purchasing domain
 * was deleted when this feature went live. The receipt mutation must send the
 * Idempotency-Key the caller generated and invalidate the views a receipt
 * changes: the purchasing lists, the stock balances, the movement ledger.
 */

function asSuccess(hook: unknown): { isSuccess: boolean; data?: unknown; error?: unknown } {
  return hook as { isSuccess: boolean; data?: unknown; error?: unknown };
}

interface FetchHandler {
  match: (url: string) => boolean;
  respond: () => Response;
}

function fetchRouter(handlers: readonly FetchHandler[]) {
  return vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const handler = handlers.find((entry) => entry.match(url));
    if (handler === undefined) {
      throw new Error(`unexpected fetch: ${init.method ?? 'GET'} ${url}`);
    }
    return handler.respond();
  });
}

const orderRow = {
  id: 'po-1',
  number: 'PO-000001',
  supplierId: 'sup-1',
  supplierName: 'Acme Supplies',
  warehouseId: 'w-1',
  warehouseName: 'Main Warehouse',
  status: 'CONFIRMED',
  orderDate: '2026-11-01',
  expectedDate: null,
  notes: '',
  total: '100.00',
  progress: { kind: 'QUANTITY', received: '40.000', ordered: '100.000', unitOfMeasure: 'roll' },
} as const;

const orderDetail = {
  ...orderRow,
  version: 3,
  lines: [
    {
      id: 'line-1',
      productId: 'p-1',
      productSku: 'RL-001',
      productName: 'Paper roll',
      quantity: '100.000',
      received: '40.000',
      outstanding: '60.000',
      unitCost: '1.0000',
      unitOfMeasure: 'roll',
      lineTotal: '100.00',
    },
  ],
} as const;

const receiptRow = {
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
  receivedTotal: '40.000',
  unitOfMeasure: 'roll',
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('purchasing hooks read the real service (T064)', () => {
  it('answers the orders list, the order and the receipts list over HTTP, never the sample service', async () => {
    const fetchMock = fetchRouter([
      {
        match: (url) => url.startsWith('/api/v1/purchase-orders?'),
        respond: () =>
          jsonResponse({ items: [orderRow], total: 1, page: 1, pageSize: 10 }),
      },
      {
        match: (url) => url === '/api/v1/purchase-orders/po-1',
        respond: () => jsonResponse(orderDetail),
      },
      {
        match: (url) => url.startsWith('/api/v1/goods-receipts?'),
        respond: () =>
          jsonResponse({ items: [receiptRow], total: 1, page: 1, pageSize: 10 }),
      },
    ]);
    vi.stubGlobal('fetch', fetchMock);

    const client = createTestQueryClient();
    const wrapper = function Wrapper({ children }: { children: ReactNode }) {
      return createElement(
        QueryClientProvider,
        { client },
        createElement(MemoryRouter, null, children),
      );
    };

    const orders = renderHook(() => usePurchaseOrders({ page: 1, pageSize: 10 }), { wrapper });
    const detail = renderHook(() => usePurchaseOrder('po-1'), { wrapper });
    const receipts = renderHook(() => useGoodsReceipts({ page: 1, pageSize: 10 }), { wrapper });

    await waitFor(() => expect(asSuccess(orders.result.current).isSuccess).toBe(true));
    await waitFor(() => expect(asSuccess(detail.result.current).isSuccess).toBe(true));
    await waitFor(() => expect(asSuccess(receipts.result.current).isSuccess).toBe(true));

    expect(
      (asSuccess(orders.result.current).data as { items: Array<{ number: string }> }).items[0]
        ?.number,
    ).toBe('PO-000001');
    expect((asSuccess(detail.result.current).data as { version: number }).version).toBe(3);
    expect(
      (asSuccess(receipts.result.current).data as { items: Array<{ number: string }> }).items[0]
        ?.number,
    ).toBe('GR-000001');

    // The urls the hooks asked are the service's, and only those.
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).toEqual([
      '/api/v1/purchase-orders?page=1&pageSize=10',
      '/api/v1/purchase-orders/po-1',
      '/api/v1/goods-receipts?page=1&pageSize=10',
    ]);
  });

  it('sends the receipt under the Idempotency-Key the caller carries', async () => {
    const fetchMock = fetchRouter([
      {
        match: (url) => url.startsWith('/api/v1/purchase-orders/po-1/receipts'),
        respond: () =>
          jsonResponse(
            {
              receipt: { id: 'gr-1', number: 'GR-000001', receivedAt: '2026-11-13T10:00:00.000Z' },
              order: { id: 'po-1', number: 'PO-000001', status: 'PARTIALLY_RECEIVED', version: 4 },
            },
            { status: 201 },
          ),
      },
    ]);
    vi.stubGlobal('fetch', fetchMock);

    const client = createTestQueryClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const wrapper = function Wrapper({ children }: { children: ReactNode }) {
      return createElement(
        QueryClientProvider,
        { client },
        createElement(MemoryRouter, null, children),
      );
    };

    const { result } = renderHook(() => useReceiveGoods(), { wrapper });

    result.current.mutate({
      idempotencyKey: 'test-key-1',
      orderId: 'po-1',
      lines: [{ lineId: 'line-1', productId: 'p-1', quantity: '10.000' }],
    });

    await waitFor(() => expect(asSuccess(result.current).isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/purchase-orders/po-1/receipts');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBe('test-key-1');
    expect(JSON.parse(String(init.body))).toEqual({
      lines: [{ lineId: 'line-1', productId: 'p-1', quantity: '10.000' }],
    });

    // Posting a receipt refreshes every view it changes.
    const invalidated = invalidateSpy.mock.calls.map((call) => {
      const arg = call[0] as { queryKey?: readonly unknown[] };
      return JSON.stringify(arg?.queryKey);
    });
    expect(invalidated).toContain(JSON.stringify(['purchaseOrders']));
    expect(invalidated).toContain(JSON.stringify(['goodsReceipts']));
    expect(invalidated).toContain(JSON.stringify(['inventory', 'stockBalances']));
    expect(invalidated).toContain(JSON.stringify(['inventory', 'movements']));
  });
});
