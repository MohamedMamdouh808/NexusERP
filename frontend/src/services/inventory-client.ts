import { requestJson, type ApiResult } from '../lib/api-client';

const API_BASE = '/api/v1';

/**
 * The inventory HTTP client.
 *
 * The inventory is a real domain: the balances, the movements, the warehouses
 * and the adjustments all live in the service. Every quantity arrives as a
 * decimal STRING (NUMERIC(14,3) printed with three places) and no arithmetic
 * happens here - the interface shows what was recorded.
 *
 * A posted adjustment is exactly-once: the caller generates the idempotency key
 * when it opens the dialog and sends the same key again on a retry, so a retry
 * after a lost answer cannot post the movement twice.
 */

/** A warehouse as the service answers it. The name is its identity; no code. */
export interface InventoryWarehouse {
  readonly id: string;
  readonly name: string;
  readonly isDefault: boolean;
  readonly isActive: boolean;
  /** Bumps on every change; a write carrying an older one is refused. */
  readonly version: number;
}

export interface WarehouseListResponse {
  readonly items: readonly InventoryWarehouse[];
  readonly total: number;
}

export interface CreateWarehouseInput {
  readonly name: string;
  readonly isDefault: boolean;
}

export interface UpdateWarehouseInput {
  readonly id: string;
  readonly name: string;
  readonly isDefault: boolean;
  /** The version the caller read; the service refuses a stale one. */
  readonly version: number;
}

export interface WarehouseStateInput {
  readonly id: string;
  readonly version: number;
}

export type StockBalanceSortField = 'sku' | 'product' | 'warehouse' | 'onHand' | 'available';

/** The one non-default status selection: archived products that hold stock. */
export type StockBalanceStatusFilter = 'archivedWithStock';

export interface ListStockBalancesParams {
  readonly search?: string;
  readonly warehouseId?: string;
  /** The product-level low-stock selection. */
  readonly lowStockOnly?: boolean;
  readonly status?: StockBalanceStatusFilter;
  readonly page?: number;
  readonly pageSize?: number;
  readonly sortBy?: StockBalanceSortField;
  readonly sortOrder?: 'asc' | 'desc';
}

/**
 * One balance row.
 *
 * The list has two shapes that share these fields: a real balance row
 * (`hasStockRow` true, one per warehouse and product) and a product-level row
 * of the low-stock selection (possibly `hasStockRow` false: the product holds
 * nothing anywhere yet, the quantities read zero and the warehouse named is the
 * organization's default one).
 */
export interface StockBalanceRow {
  readonly productId: string;
  readonly sku: string;
  readonly productName: string;
  readonly warehouseId: string | null;
  readonly warehouseName: string | null;
  readonly onHand: string;
  readonly reserved: string;
  readonly available: string;
  readonly archived: boolean;
  readonly status: 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK' | null;
  readonly hasStockRow: boolean;
}

export interface StockBalanceListResponse {
  readonly items: readonly StockBalanceRow[];
  /**
   * What `total` counts: balance ROWS in the default selection, PRODUCTS in the
   * low-stock and archived selections. The interface labels which one it is, so
   * the two are never confused.
   */
  readonly totalKind: 'rows' | 'products';
  readonly total: number;
  /** How many products the low-stock rule selects under the same search. */
  readonly lowStockCount: number;
}

export type MovementType = 'RECEIPT' | 'SHIPMENT' | 'ADJUSTMENT';

export type MovementSortField = 'createdAt' | 'product' | 'warehouse' | 'quantity';

export interface ListStockMovementsParams {
  readonly search?: string;
  readonly productId?: string;
  readonly warehouseId?: string;
  readonly type?: MovementType;
  /** Calendar days, `YYYY-MM-DD`; the end date includes its day. */
  readonly startDate?: string;
  readonly endDate?: string;
  readonly page?: number;
  readonly pageSize?: number;
  readonly sortBy?: MovementSortField;
  readonly sortOrder?: 'asc' | 'desc';
}

/** One movement of the ledger. Append-only: a posted one is never changed. */
export interface StockMovementRow {
  readonly id: string;
  readonly createdAt: string;
  readonly type: MovementType;
  /** Signed: a receipt adds, a shipment or a write-off removes. */
  readonly quantityDelta: string;
  readonly reason: string | null;
  readonly note: string | null;
  readonly sourceType: string;
  readonly sourceId: string | null;
  readonly sourceNumber: string | null;
  readonly productId: string;
  readonly sku: string;
  readonly productName: string;
  /** The movements of an archived product stay listed, and say so. */
  readonly archived: boolean;
  readonly warehouseId: string;
  readonly warehouseName: string;
  readonly userId: string | null;
}

export interface StockMovementListResponse {
  readonly items: readonly StockMovementRow[];
  readonly total: number;
}

export type AdjustmentReason = 'DAMAGE' | 'LOSS' | 'FOUND' | 'COUNT_CORRECTION' | 'OTHER';

export interface PostAdjustmentInput {
  /** Generated when the dialog opens; reused on a retry, changed on a re-edit. */
  readonly idempotencyKey: string;
  readonly warehouseId: string;
  readonly productId: string;
  /** Signed decimal string: positive adds stock, negative removes it. */
  readonly quantity: string;
  readonly reason: AdjustmentReason;
  readonly note?: string;
}

export interface PostedMovement {
  readonly id: string;
  readonly sourceNumber: string;
  readonly quantityDelta: string;
  readonly type: 'ADJUSTMENT';
}

export interface PostedBalance {
  readonly warehouseId: string;
  readonly productId: string;
  readonly onHand: string;
  readonly reserved: string;
  readonly available: string;
}

export interface PostAdjustmentResponse {
  readonly movement: PostedMovement;
  readonly balance: PostedBalance;
}

/**
 * Builds a query string from the parameters the caller actually gave: a filter
 * that was not chosen is absent, so the service applies its own default rather
 * than being told "all" by a client that never asked.
 */
function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    query.set(key, String(value));
  }
  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
}

// --- Warehouses -------------------------------------------------------------

export async function listWarehouses(): Promise<ApiResult<WarehouseListResponse>> {
  return requestJson<WarehouseListResponse>(`${API_BASE}/warehouses`, { method: 'GET' });
}

export async function createWarehouse(input: CreateWarehouseInput): Promise<ApiResult<InventoryWarehouse>> {
  return requestJson<InventoryWarehouse>(`${API_BASE}/warehouses`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: input.name, isDefault: input.isDefault }),
  });
}

export async function updateWarehouse(input: UpdateWarehouseInput): Promise<ApiResult<InventoryWarehouse>> {
  return requestJson<InventoryWarehouse>(`${API_BASE}/warehouses/${input.id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      isDefault: input.isDefault,
      version: input.version,
    }),
  });
}

export async function deactivateWarehouse(input: WarehouseStateInput): Promise<ApiResult<InventoryWarehouse>> {
  return requestJson<InventoryWarehouse>(`${API_BASE}/warehouses/${input.id}/deactivate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ version: input.version }),
  });
}

export async function reactivateWarehouse(input: WarehouseStateInput): Promise<ApiResult<InventoryWarehouse>> {
  return requestJson<InventoryWarehouse>(`${API_BASE}/warehouses/${input.id}/reactivate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ version: input.version }),
  });
}

// --- Stock balances -----------------------------------------------------------

export async function listStockBalances(
  params: ListStockBalancesParams = {},
): Promise<ApiResult<StockBalanceListResponse>> {
  const query = buildQuery({
    search: params.search,
    warehouseId: params.warehouseId,
    lowStockOnly: params.lowStockOnly === undefined ? undefined : String(params.lowStockOnly),
    status: params.status,
    page: params.page,
    pageSize: params.pageSize,
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
  });
  return requestJson<StockBalanceListResponse>(`${API_BASE}/inventory/stock-balances${query}`, {
    method: 'GET',
  });
}

// --- Stock movements -----------------------------------------------------------

export async function listStockMovements(
  params: ListStockMovementsParams = {},
): Promise<ApiResult<StockMovementListResponse>> {
  const query = buildQuery({
    search: params.search,
    productId: params.productId,
    warehouseId: params.warehouseId,
    type: params.type,
    startDate: params.startDate,
    endDate: params.endDate,
    page: params.page,
    pageSize: params.pageSize,
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
  });
  return requestJson<StockMovementListResponse>(`${API_BASE}/inventory/stock-movements${query}`, {
    method: 'GET',
  });
}

// --- Adjustments ---------------------------------------------------------------

export async function postAdjustment(input: PostAdjustmentInput): Promise<ApiResult<PostAdjustmentResponse>> {
  return requestJson<PostAdjustmentResponse>(`${API_BASE}/inventory/adjustments`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Idempotency-Key': input.idempotencyKey,
    },
    body: JSON.stringify({
      warehouseId: input.warehouseId,
      productId: input.productId,
      quantity: input.quantity,
      reason: input.reason,
      ...(input.note === undefined ? {} : { note: input.note }),
    }),
  });
}
