import { describe, expect, it, vi, afterEach } from 'vitest';

import {
  archiveContact,
  buildQuery,
  createContact,
  getContact,
  listContacts,
  restoreContact,
  updateContact,
} from '../../../services/contacts-client';
import { jsonResponse } from '../../../test/render';

/**
 * The contacts HTTP client.
 *
 * What matters here is the shape of the request, because the service is the
 * one that refuses a wrong body: the query is built from the caller's values
 * (and only from values that were actually given), and a mutation carries
 * exactly the fields the service's contract names.
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

describe('the contacts client', () => {
  it('lists contacts with the query the caller gave', async () => {
    const fetchMock = stubFetch((url) => {
      expect(url).toContain('/api/v1/contacts?');
      expect(url).toContain('search=Acme');
      expect(url).toContain('role=customer');
      expect(url).toContain('status=archived');
      expect(url).toContain('page=2');
      expect(url).toContain('pageSize=50');
      expect(url).toContain('sortBy=code');
      expect(url).toContain('sortOrder=desc');
      return jsonResponse({ items: [], total: 0, page: 2, pageSize: 50 });
    });

    const result = await listContacts({
      search: 'Acme',
      role: 'customer',
      status: 'archived',
      page: 2,
      pageSize: 50,
      sortBy: 'code',
      sortOrder: 'desc',
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('leaves out the filters the caller did not give', () => {
    // "all" is the absence of a filter, so it is not sent as a filter.
    expect(buildQuery({ role: 'all', status: 'all' })).toBe('');
    expect(buildQuery({ role: 'supplier' })).toBe('?role=supplier');
  });

  it('escapes a search term that carries URL syntax', () => {
    const query = buildQuery({ search: 'a&b=c d' });
    expect(query).toContain('search=a%26b%3Dc+d');
    expect(query).not.toContain('&b=c');
  });

  it('reads one contact', async () => {
    const fetchMock = stubFetch((url) => {
      expect(url).toContain('/api/v1/contacts/contact-1');
      return jsonResponse({
        id: 'contact-1',
        organizationId: 'org-1',
        code: 'CUST-00001',
        name: 'Acme Corp',
        email: null,
        phone: null,
        isCustomer: true,
        isSupplier: false,
        addressLine1: null,
        addressLine2: null,
        city: null,
        region: null,
        postalCode: null,
        country: null,
        isArchived: false,
        version: 1,
        createdAt: '2026-11-10T20:00:00.000Z',
        updatedAt: '2026-11-10T20:00:00.000Z',
      });
    });

    const result = await getContact('contact-1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.code).toBe('CUST-00001');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('creates a contact with both roles and the address fields', async () => {
    const fetchMock = stubFetch((url, init) => {
      expect(url).toContain('/api/v1/contacts');
      expect(init.method).toBe('POST');
      const body = JSON.parse(String(init.body));
      expect(body).toMatchObject({
        name: 'Acme Corp',
        isCustomer: true,
        isSupplier: true,
        addressLine1: '123 Main St',
        city: 'Metropolis',
      });
      return jsonResponse({ id: 'contact-1' }, { status: 201 });
    });

    await createContact({
      name: 'Acme Corp',
      isCustomer: true,
      isSupplier: true,
      addressLine1: '123 Main St',
      city: 'Metropolis',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends the version with an update', async () => {
    const fetchMock = stubFetch((_url, init) => {
      expect(init.method).toBe('PUT');
      expect(JSON.parse(String(init.body)).version).toBe(3);
      return jsonResponse({ id: 'contact-1', version: 4 });
    });

    await updateContact('contact-1', { version: 3, name: 'Acme', isCustomer: true, isSupplier: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('archives and restores on the service\'s own endpoints', async () => {
    const fetchMock = stubFetch((url, init) => {
      expect(init.method).toBe('POST');
      return jsonResponse({ id: 'contact-1', isArchived: url.endsWith('/archive') });
    });

    const archived = await archiveContact('contact-1');
    expect(archived.ok).toBe(true);
    if (archived.ok) expect(archived.data.isArchived).toBe(true);

    const restored = await restoreContact('contact-1');
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.data.isArchived).toBe(false);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('hands back the service\'s failure envelope instead of throwing', async () => {
    stubFetch(() =>
      jsonResponse(
        {
          code: 'DUPLICATE_RECORD',
          message: 'A contact with this email already exists.',
          details: [],
          requestId: 'req-1',
        },
        { status: 409 },
      ),
    );

    const result = await createContact({ name: 'Acme', isCustomer: true, isSupplier: false });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe('DUPLICATE_RECORD');
      expect(result.failure.requestId).toBe('req-1');
    }
  });
});
