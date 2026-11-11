import { requestJson, type ApiResult } from '../lib/api-client';
import {
  PRODUCT_LIST_DEFAULTS,
  type ProductSortField,
  type ProductSortOrder,
  type ProductStatusFilter,
} from '@nexuserp/shared';

const API_BASE = '/api/v1';

/**
 * A product as the service answers it.
 *
 * The prices and the reorder level are decimal STRINGS. The interface performs
 * no arithmetic on money - it shows what was recorded - so nothing here is a
 * number that could have lost a digit.
 */
export interface Product {
  readonly id: string;
  readonly organizationId: string;
  readonly sku: string;
  readonly name: string;
  readonly categoryId: string;
  readonly unitId: string;
  readonly purchasePrice: string;
  readonly sellingPrice: string;
  readonly lowStockThreshold: string | null;
  readonly isArchived: boolean;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProductListResponse {
  readonly items: readonly Product[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface ProductCategory {
  readonly id: string;
  readonly name: string;
}

export interface UnitOfMeasure {
  readonly id: string;
  readonly name: string;
  readonly abbreviation: string;
}

export interface CreateProductInput {
  readonly sku: string;
  readonly name: string;
  readonly categoryId: string;
  readonly unitId: string;
  readonly purchasePrice: string;
  readonly sellingPrice: string;
  readonly lowStockThreshold?: string | null;
}

export interface UpdateProductInput extends CreateProductInput {
  /** The version the caller read; the service refuses a stale one. */
  readonly version: number;
}

export interface ListProductsParams {
  readonly search?: string;
  readonly categoryId?: string;
  readonly status?: ProductStatusFilter;
  readonly page?: number;
  readonly pageSize?: number;
  readonly sortBy?: ProductSortField;
  readonly sortOrder?: ProductSortOrder;
}

/**
 * Builds the list query.
 *
 * Only the values the caller gave are sent: a filter that was not chosen is
 * absent, so the service applies its own default rather than being told
 * "all" by a client that never asked.
 */
export function buildProductsQuery(params: ListProductsParams): string {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.categoryId) query.set('categoryId', params.categoryId);
  if (params.status) query.set('status', params.status);
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  if (params.sortBy) query.set('sortBy', params.sortBy);
  if (params.sortOrder) query.set('sortOrder', params.sortOrder);
  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
}

/** The list, with the server's own defaults when the caller names none. */
export async function listProducts(
  params: ListProductsParams = {},
): Promise<ApiResult<ProductListResponse>> {
  const withDefaults: ListProductsParams = {
    status: PRODUCT_LIST_DEFAULTS.status,
    page: PRODUCT_LIST_DEFAULTS.page,
    pageSize: PRODUCT_LIST_DEFAULTS.pageSize,
    sortBy: PRODUCT_LIST_DEFAULTS.sortBy,
    sortOrder: PRODUCT_LIST_DEFAULTS.sortOrder,
    ...params,
  };
  return requestJson<ProductListResponse>(
    `${API_BASE}/products${buildProductsQuery(withDefaults)}`,
    { method: 'GET' },
  );
}

export async function getProduct(id: string): Promise<ApiResult<Product>> {
  return requestJson<Product>(`${API_BASE}/products/${id}`, { method: 'GET' });
}

export async function createProduct(input: CreateProductInput): Promise<ApiResult<Product>> {
  return requestJson<Product>(`${API_BASE}/products`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sku: input.sku,
      name: input.name,
      categoryId: input.categoryId,
      unitId: input.unitId,
      purchasePrice: input.purchasePrice,
      sellingPrice: input.sellingPrice,
      ...(input.lowStockThreshold ? { lowStockThreshold: input.lowStockThreshold } : {}),
    }),
  });
}

export async function updateProduct(
  id: string,
  input: UpdateProductInput,
): Promise<ApiResult<Product>> {
  return requestJson<Product>(`${API_BASE}/products/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      version: input.version,
      sku: input.sku,
      name: input.name,
      categoryId: input.categoryId,
      unitId: input.unitId,
      purchasePrice: input.purchasePrice,
      sellingPrice: input.sellingPrice,
      ...(input.lowStockThreshold ? { lowStockThreshold: input.lowStockThreshold } : {}),
    }),
  });
}

export async function archiveProduct(
  id: string,
): Promise<ApiResult<{ id: string; isArchived: boolean }>> {
  return requestJson<{ id: string; isArchived: boolean }>(`${API_BASE}/products/${id}/archive`, {
    method: 'POST',
  });
}

export async function restoreProduct(
  id: string,
): Promise<ApiResult<{ id: string; isArchived: boolean }>> {
  return requestJson<{ id: string; isArchived: boolean }>(`${API_BASE}/products/${id}/restore`, {
    method: 'POST',
  });
}

export async function listCategories(): Promise<ApiResult<ProductCategory[]>> {
  return requestJson<ProductCategory[]>(`${API_BASE}/product-categories`, { method: 'GET' });
}

export async function createCategory(name: string): Promise<ApiResult<ProductCategory>> {
  return requestJson<ProductCategory>(`${API_BASE}/product-categories`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

export async function listUnits(): Promise<ApiResult<UnitOfMeasure[]>> {
  return requestJson<UnitOfMeasure[]>(`${API_BASE}/units-of-measure`, { method: 'GET' });
}

export async function createUnit(
  name: string,
  abbreviation: string,
): Promise<ApiResult<UnitOfMeasure>> {
  return requestJson<UnitOfMeasure>(`${API_BASE}/units-of-measure`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, abbreviation }),
  });
}
