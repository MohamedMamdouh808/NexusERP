import { describe, expect, it, vi, afterEach } from 'vitest';

import {
  archiveProduct,
  buildProductsQuery,
  createProduct,
  listProducts,
  restoreProduct,
  updateProduct,
} from '../../../services/products-client';
import { jsonResponse } from '../../../test/render';

/**
 * The products client.
 *
 * What matters here is the shape of the request, because the service is the one
 * that refuses a wrong body: the query carries only the values the caller gave,
 * the amounts travel as decimal strings, and a failure comes back as the
 * service's envelope rather than as an exception.
 */
afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(handler: (url: string, init: RequestInit) => Response) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) =>
    handler(String(input), init),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('the products client', () => {
  it('sends only the filters the caller gave', () => {
    expect(buildProductsQuery({})).toBe('');
    expect(buildProductsQuery({ search: 'Acme' })).toBe('?search=Acme');
    expect(buildProductsQuery({ categoryId: 'c1', status: 'archived' })).toBe(
      '?categoryId=c1&status=archived',
    );
  });

  it('escapes a search term that carries URL syntax', () => {
    const query = buildProductsQuery({ search: 'a&b=c d' });
    expect(query).toContain('search=a%26b%3Dc+d');
    expect(query).not.toContain('&b=c');
  });

  it('asks for the active products by default', async () => {
    const fetchMock = stubFetch((url) => {
      expect(url).toContain('/api/v1/products?');
      expect(url).toContain('status=active');
      expect(url).toContain('page=1');
      expect(url).toContain('pageSize=25');
      expect(url).toContain('sortBy=name');
      expect(url).toContain('sortOrder=asc');
      return jsonResponse({ items: [], total: 0, page: 1, pageSize: 25 });
    });

    const result = await listProducts();
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends the amounts as decimal strings', async () => {
    const fetchMock = stubFetch((url, init) => {
      expect(url).toContain('/api/v1/products');
      expect(init.method).toBe('POST');
      const body = JSON.parse(String(init.body));
      expect(body.purchasePrice).toBe('4.5000');
      expect(body.sellingPrice).toBe('9.9900');
      expect(body.lowStockThreshold).toBe('2.000');
      return jsonResponse({ id: 'p1' }, { status: 201 });
    });

    await createProduct({
      sku: 'SKU-1001',
      name: 'Blue T-Shirt',
      categoryId: 'c1',
      unitId: 'u1',
      purchasePrice: '4.5000',
      sellingPrice: '9.9900',
      lowStockThreshold: '2.000',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('leaves the reorder level out when there is none', async () => {
    const fetchMock = stubFetch((_url, init) => {
      const body = JSON.parse(String(init.body));
      expect(body).not.toHaveProperty('lowStockThreshold');
      return jsonResponse({ id: 'p1' }, { status: 201 });
    });

    await createProduct({
      sku: 'SKU-1001',
      name: 'Blue T-Shirt',
      categoryId: 'c1',
      unitId: 'u1',
      purchasePrice: '4.5000',
      sellingPrice: '9.9900',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends the version with an update', async () => {
    const fetchMock = stubFetch((_url, init) => {
      expect(init.method).toBe('PUT');
      expect(JSON.parse(String(init.body)).version).toBe(3);
      return jsonResponse({ id: 'p1', version: 4 });
    });

    await updateProduct('p1', {
      version: 3,
      sku: 'SKU-1001',
      name: 'Blue T-Shirt',
      categoryId: 'c1',
      unitId: 'u1',
      purchasePrice: '4.5000',
      sellingPrice: '9.9900',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('archives and restores on the service\'s own endpoints', async () => {
    const fetchMock = stubFetch((url, init) => {
      expect(init.method).toBe('POST');
      return jsonResponse({ id: 'p1', isArchived: url.endsWith('/archive') });
    });

    const archived = await archiveProduct('p1');
    expect(archived.ok).toBe(true);
    if (archived.ok) expect(archived.data.isArchived).toBe(true);

    const restored = await restoreProduct('p1');
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.data.isArchived).toBe(false);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('hands back the service\'s failure envelope instead of throwing', async () => {
    stubFetch(() =>
      jsonResponse(
        {
          code: 'DUPLICATE_RECORD',
          message: 'A product with this SKU already exists: Blue T-Shirt',
          details: [],
          requestId: 'req-1',
        },
        { status: 409 },
      ),
    );

    const result = await createProduct({
      sku: 'SKU-1001',
      name: 'Blue T-Shirt',
      categoryId: 'c1',
      unitId: 'u1',
      purchasePrice: '4.5000',
      sellingPrice: '9.9900',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe('DUPLICATE_RECORD');
      expect(result.failure.requestId).toBe('req-1');
    }
  });
});
