import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OrderForm } from '../order-form';
import { jsonResponse, renderWithProviders } from '../../../test/render';

/**
 * T068. The purchase order form reads its dictionaries from the real service.
 *
 * Suppliers come from the real contacts list (role supplier, active),
 * products from the real catalogue with archived products refused server-side,
 * warehouses from the real warehouses list. A demonstration document never
 * names a demonstration record and never names one the service would refuse:
 * the purchase price the user sees as the default line cost is the product's
 * real purchase price. An order with no lines is a valid draft - the service
 * accepts it and the caller posts it as such.
 */

const CONTACTS = {
  items: [
    {
      id: 'sup-1',
      code: 'SUP-1',
      name: 'Acme Supplies',
      email: null,
      phone: null,
      isCustomer: false,
      isSupplier: true,
      status: 'active',
      version: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  total: 1,
  page: 1,
  pageSize: 100,
} as const;

const PRODUCTS = {
  items: [
    {
      id: 'p-1',
      organizationId: 'org-1',
      sku: 'SKU-1',
      name: 'Drill',
      categoryId: 'cat-1',
      unitId: 'unit-1',
      purchasePrice: '1.2345',
      sellingPrice: '5.0000',
      lowStockThreshold: null,
      isArchived: false,
      version: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  total: 1,
  page: 1,
  pageSize: 100,
} as const;

const WAREHOUSES = {
  items: [{ id: 'w-1', name: 'Main Warehouse', isDefault: true, isActive: true, version: 1 }],
  total: 1,
} as const;

function fetchRouter(handlers: readonly { match: (url: string) => boolean; respond: () => Response }[]) {
  return vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const handler = handlers.find((entry) => entry.match(url));
    if (handler === undefined) {
      throw new Error(`unexpected fetch: ${init.method ?? 'GET'} ${url}`);
    }
    return handler.respond();
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the purchase order form reads the real dictionaries (T068)', () => {
  it('lists suppliers from the real contacts service, products from the real catalogue, warehouses from the real list', async () => {
    const fetchMock = fetchRouter([
      {
        match: (url) => url === '/api/v1/contacts?role=supplier&status=active&page=1&pageSize=100',
        respond: () => jsonResponse(CONTACTS),
      },
      {
        match: (url) => url.startsWith('/api/v1/products?'),
        respond: () => jsonResponse(PRODUCTS),
      },
      {
        match: (url) => url === '/api/v1/warehouses',
        respond: () => jsonResponse(WAREHOUSES),
      },
    ]);
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<OrderForm submitLabel="Save draft" />);

    // The supplier select carries the real option once the service answers.
    expect(await screen.findByRole('option', { name: 'SUP-1 — Acme Supplies' })).toBeInTheDocument();
    // The products request asks for active products only.
    const productsCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).startsWith('/api/v1/products?'),
    );
    expect(String(productsCall?.[0])).toContain('status=active');
    // The warehouse select carries the real option.
    expect(await screen.findByRole('option', { name: 'Main Warehouse' })).toBeInTheDocument();
  });

  it('defaults the line unit cost to the product purchase price, still editable', async () => {
    const fetchMock = fetchRouter([
      {
        match: (url) => url.startsWith('/api/v1/contacts?'),
        respond: () => jsonResponse(CONTACTS),
      },
      {
        match: (url) => url.startsWith('/api/v1/products?'),
        respond: () => jsonResponse(PRODUCTS),
      },
      {
        match: (url) => url === '/api/v1/warehouses',
        respond: () => jsonResponse(WAREHOUSES),
      },
    ]);
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<OrderForm submitLabel="Save draft" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Add line' }));
    // The catalogue arrives over HTTP; the select only accepts the value once
    // its option exists.
    expect(await screen.findByRole('option', { name: 'SKU-1 — Drill' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Product'), { target: { value: 'p-1' } });

    expect(screen.getByLabelText('Unit cost *')).toHaveValue('1.2345');
  });

  it('posts a zero-line draft as it is, and the service accepts it', async () => {
    const fetchMock = fetchRouter([
      {
        match: (url) => url.startsWith('/api/v1/contacts?'),
        respond: () => jsonResponse(CONTACTS),
      },
      {
        match: (url) => url.startsWith('/api/v1/products?'),
        respond: () => jsonResponse(PRODUCTS),
      },
      {
        match: (url) => url === '/api/v1/warehouses',
        respond: () => jsonResponse(WAREHOUSES),
      },
      {
        match: (url) => url === '/api/v1/purchase-orders',
        respond: () =>
          jsonResponse(
            {
              id: 'po-9',
              number: 'PO-000009',
              supplierId: 'sup-1',
              warehouseId: 'w-1',
              status: 'DRAFT',
              orderDate: '2026-11-13',
              expectedDate: null,
              notes: '',
              total: '0.00',
              version: 1,
              lines: [],
            },
            { status: 201 },
          ),
      },
    ]);
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<OrderForm submitLabel="Save draft" />, {
      initialEntries: ['/purchasing/new'],
    });

    // The dictionaries arrive over HTTP; a select only accepts a value once
    // its option exists.
    expect(await screen.findByRole('option', { name: 'SUP-1 — Acme Supplies' })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'Main Warehouse' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Supplier *'), { target: { value: 'sup-1' } });
    fireEvent.change(screen.getByLabelText('Destination warehouse *'), { target: { value: 'w-1' } });
    fireEvent.change(screen.getByLabelText('Order date *'), { target: { value: '2026-11-13' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        (call) => String(call[0]) === '/api/v1/purchase-orders' && (call[1] as RequestInit).method === 'POST',
      );
      expect(post).toBeDefined();
    });

    const post = fetchMock.mock.calls.find(
      (call) => String(call[0]) === '/api/v1/purchase-orders' && (call[1] as RequestInit).method === 'POST',
    )!;
    expect(JSON.parse(String((post[1] as RequestInit).body))).toEqual({
      supplierId: 'sup-1',
      warehouseId: 'w-1',
      orderDate: '2026-11-13',
      expectedDate: null,
      notes: '',
      lines: [],
    });
  });
});
