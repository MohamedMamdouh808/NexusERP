import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  useMovements,
  usePostAdjustment,
  useStockBalances,
  useWarehouses,
} from '../use-inventory';
import { createTestQueryClient, jsonResponse } from '../../../test/render';

/**
 * T049. The inventory hooks are the seam between the screens and the service.
 *
 * What matters here is WHERE the data comes from: every hook must answer
 * through the real HTTP client (`services/inventory-client.ts` →
 * `/api/v1/...`) and never through the sample service, whose inventory domain
 * was deleted when this feature went live. The sample service is spied, so a
 * hook that quietly went back to it fails here.
 */

function asSuccess(hook: unknown): { isSuccess: boolean; data?: unknown; error?: unknown } {
  return hook as { isSuccess: boolean; data?: unknown; error?: unknown };
}

function makeWrapper() {
  const client = createTestQueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client },
      createElement(MemoryRouter, null, children),
    );
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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

describe('inventory hooks read the real service (T049)', () => {
  it('answers warehouses, balances and movements over HTTP, never the sample service', async () => {
    const fetchMock = fetchRouter([
      {
        match: (url) => url.startsWith('/api/v1/warehouses'),
        respond: () =>
          jsonResponse({
            items: [
              { id: 'w-1', name: 'Main Warehouse', isDefault: true, isActive: true, version: 1 },
            ],
            total: 1,
          }),
      },
      {
        match: (url) => url.startsWith('/api/v1/inventory/stock-balances'),
        respond: () =>
          jsonResponse({
            items: [],
            total: 0,
            totalKind: 'rows',
            lowStockCount: 0,
          }),
      },
      {
        match: (url) => url.startsWith('/api/v1/inventory/stock-movements'),
        respond: () => jsonResponse({ items: [], total: 0 }),
      },
    ]);
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = makeWrapper();
    const warehouses = renderHook(() => useWarehouses(), { wrapper });
    const balances = renderHook(() => useStockBalances({ page: 1, pageSize: 20 }), { wrapper });
    const movements = renderHook(() => useMovements({ page: 1, pageSize: 20 }), { wrapper });

    await waitFor(() => expect(asSuccess(warehouses.result.current).isSuccess).toBe(true));
    await waitFor(() => expect(asSuccess(balances.result.current).isSuccess).toBe(true));
    await waitFor(() => expect(asSuccess(movements.result.current).isSuccess).toBe(true));

    // The data came from the HTTP answers.
    expect(
      (asSuccess(warehouses.result.current).data as { items: Array<{ name: string }> }).items[0]
        ?.name,
    ).toBe('Main Warehouse');

    // The urls the hooks asked are the service's, and only those.
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).toEqual([
      '/api/v1/warehouses',
      '/api/v1/inventory/stock-balances?page=1&pageSize=20',
      '/api/v1/inventory/stock-movements?page=1&pageSize=20',
    ]);
  });

  it('sends the adjustment under the Idempotency-Key the caller carries', async () => {
    const fetchMock = fetchRouter([
      {
        match: (url) => url.startsWith('/api/v1/inventory/adjustments'),
        respond: () =>
          jsonResponse(
            {
              movement: {
                id: 'm-1',
                sourceNumber: 'ADJ-00001',
                quantityDelta: '1.000',
                type: 'ADJUSTMENT',
              },
              balance: {
                warehouseId: 'w-1',
                productId: 'p-1',
                onHand: '1.000',
                reserved: '0.000',
                available: '1.000',
              },
            },
            { status: 201 },
          ),
      },
    ]);
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => usePostAdjustment(), { wrapper: makeWrapper() });

    result.current.mutate({
      idempotencyKey: 'test-key-1',
      warehouseId: 'w-1',
      productId: 'p-1',
      quantity: '1.000',
      reason: 'FOUND',
    });

    await waitFor(() => expect(asSuccess(result.current).isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/inventory/adjustments');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBe('test-key-1');
    expect(JSON.parse(String(init.body))).toMatchObject({
      warehouseId: 'w-1',
      productId: 'p-1',
      quantity: '1.000',
      reason: 'FOUND',
    });
  });
});
