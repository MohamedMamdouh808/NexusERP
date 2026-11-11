import { requestJson, type ApiResult } from '../lib/api-client';

const API_BASE = '/api/v1';

export interface Contact {
  readonly id: string;
  readonly organizationId: string;
  readonly code: string;
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly isCustomer: boolean;
  readonly isSupplier: boolean;
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly city: string | null;
  readonly region: string | null;
  readonly postalCode: string | null;
  readonly country: string | null;
  readonly isArchived: boolean;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ContactListResponse {
  readonly items: readonly Contact[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface CreateContactInput {
  readonly name: string;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly isCustomer: boolean;
  readonly isSupplier: boolean;
  readonly addressLine1?: string | null;
  readonly addressLine2?: string | null;
  readonly city?: string | null;
  readonly region?: string | null;
  readonly postalCode?: string | null;
  readonly country?: string | null;
}

export interface UpdateContactInput extends CreateContactInput {
  readonly version: number;
}

export interface ListContactsParams {
  readonly search?: string;
  readonly role?: 'all' | 'customer' | 'supplier';
  readonly status?: 'all' | 'active' | 'archived';
  readonly page?: number;
  readonly pageSize?: number;
  readonly sortBy?: 'name' | 'code' | 'createdAt';
  readonly sortOrder?: 'asc' | 'desc';
}

/**
 * Builds the list query string.
 *
 * Exported for the tests: what the client sends is part of the contract with
 * the service, so it is worth asserting directly.
 */
export function buildQuery(params: ListContactsParams): string {
  const q = new URLSearchParams();
  if (params.search) q.set('search', params.search);
  if (params.role && params.role !== 'all') q.set('role', params.role);
  if (params.status && params.status !== 'all') q.set('status', params.status);
  if (params.page) q.set('page', String(params.page));
  if (params.pageSize) q.set('pageSize', String(params.pageSize));
  if (params.sortBy) q.set('sortBy', params.sortBy);
  if (params.sortOrder) q.set('sortOrder', params.sortOrder);
  const s = q.toString();
  return s ? `?${s}` : '';
}

export async function listContacts(params: ListContactsParams = {}): Promise<ApiResult<ContactListResponse>> {
  return requestJson<ContactListResponse>(`${API_BASE}/contacts${buildQuery(params)}`, { method: 'GET' });
}

export async function getContact(id: string): Promise<ApiResult<Contact>> {
  return requestJson<Contact>(`${API_BASE}/contacts/${id}`, { method: 'GET' });
}

export async function createContact(input: CreateContactInput): Promise<ApiResult<Contact>> {
  return requestJson<Contact>(`${API_BASE}/contacts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      email: input.email ?? undefined,
      phone: input.phone ?? undefined,
      isCustomer: input.isCustomer,
      isSupplier: input.isSupplier,
      addressLine1: input.addressLine1 ?? undefined,
      addressLine2: input.addressLine2 ?? undefined,
      city: input.city ?? undefined,
      region: input.region ?? undefined,
      postalCode: input.postalCode ?? undefined,
      country: input.country ?? undefined,
    }),
  });
}

export async function updateContact(id: string, input: UpdateContactInput): Promise<ApiResult<Contact>> {
  return requestJson<Contact>(`${API_BASE}/contacts/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      version: input.version,
      name: input.name,
      email: input.email ?? undefined,
      phone: input.phone ?? undefined,
      isCustomer: input.isCustomer,
      isSupplier: input.isSupplier,
      addressLine1: input.addressLine1 ?? undefined,
      addressLine2: input.addressLine2 ?? undefined,
      city: input.city ?? undefined,
      region: input.region ?? undefined,
      postalCode: input.postalCode ?? undefined,
      country: input.country ?? undefined,
    }),
  });
}

export async function archiveContact(id: string): Promise<ApiResult<{ id: string; isArchived: boolean }>> {
  return requestJson<{ id: string; isArchived: boolean }>(`${API_BASE}/contacts/${id}/archive`, { method: 'POST' });
}

export async function restoreContact(id: string): Promise<ApiResult<{ id: string; isArchived: boolean }>> {
  return requestJson<{ id: string; isArchived: boolean }>(`${API_BASE}/contacts/${id}/restore`, { method: 'POST' });
}