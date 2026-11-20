import { requestJson } from '../lib/api-client';

const API_BASE = '/api/v1';

export interface StockOnHandRow {
  readonly productId: string;
  readonly productSku: string;
  readonly productName: string;
  readonly isArchived: boolean;
  readonly warehouseId: string;
  readonly warehouseName: string;
  readonly unitOfMeasure: string;
  readonly onHand: string;
  readonly reserved: string;
  readonly available: string;
}

export interface StockOnHandResponse {
  readonly items: readonly StockOnHandRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totals: { readonly onHand?: string; readonly reserved?: string; readonly available?: string; readonly rowCount?: number };
}

export interface StockMovementRow {
  readonly id: string;
  readonly createdAt: string;
  readonly type: string;
  readonly quantityDelta: string;
  readonly reason: string | null;
  readonly note: string | null;
  readonly sourceType: string | null;
  readonly sourceId: string | null;
  readonly sourceNumber: string | null;
  readonly productId: string;
  readonly sku: string;
  readonly productName: string;
  readonly archived: boolean;
  readonly warehouseId: string;
  readonly warehouseName: string;
  readonly userId: string | null;
}

export interface StockMovementsResponse {
  readonly items: readonly StockMovementRow[];
  readonly total: number;
}

export interface OutstandingInvoiceRow {
  readonly invoiceId: string;
  readonly number: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly issueDate: string;
  readonly dueDate: string;
  readonly total: string;
  readonly paid: string;
  readonly balance: string;
  readonly daysOverdue: number;
}

export interface OutstandingInvoicesResponse {
  readonly items: readonly OutstandingInvoiceRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totals: { readonly total: string; readonly paid: string; readonly balance: string };
  readonly aging: {
    readonly current: { readonly count: number; readonly balance: string };
    readonly d1_30: { readonly count: number; readonly balance: string };
    readonly d31_60: { readonly count: number; readonly balance: string };
    readonly d61_90: { readonly count: number; readonly balance: string };
    readonly over90: { readonly count: number; readonly balance: string };
  };
}

export interface DocumentStatusesResponse {
  readonly purchaseOrders: Record<string, { count: number; totalAmount: string }>;
  readonly salesOrders: Record<string, { count: number; totalAmount: string }>;
  readonly invoices: Record<string, { count: number; totalAmount: string }>;
  readonly payments: Record<string, { count: number; totalAmount: string }>;
  readonly shipments: number;
  readonly goodsReceipts: number;
  readonly dateRange: { readonly start: string; readonly end: string };
}

export interface ReconciliationRow {
  readonly warehouseId: string;
  readonly warehouseName: string;
  readonly productId: string;
  readonly productName: string;
  readonly unitOfMeasure: string;
  readonly onHand: string;
  readonly movementSum: string;
  readonly reserved: string;
  readonly reservationSum: string;
  readonly kinds: readonly string[];
}

export interface ReconciliationResponse {
  readonly items: readonly ReconciliationRow[];
  readonly total: number;
  readonly checkedAt: string;
}

/** One KPI figure in the KPI summary: a decimal string the member reads, never arithmetic. */
export interface KpiEntry {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly unit: 'money' | 'count';
  /** The same figure for the previous period; absent on the as-of figures. */
  readonly previousValue?: string;
  /** The server's own change against the previous period; null when there is none. */
  readonly change?: string | null;
  /** Set on the figures that are not bound to the range. */
  readonly asOf?: 'today';
}

export interface KpiSummaryResponse {
  readonly filters: { readonly start: string; readonly end: string };
  readonly asOf: string;
  readonly kpis: readonly KpiEntry[];
}

/** One bucket of a zero-filled time series; `label` is a calendar date (YYYY-MM-DD). */
export interface OverTimeBucket {
  readonly label: string;
  readonly value: string;
  readonly count: number;
}

export interface OverTimeResponse {
  readonly filters: { readonly start: string; readonly end: string };
  readonly asOf: string;
  readonly granularity: string;
  readonly buckets: readonly OverTimeBucket[];
}

export interface StockMovementsOverTimeBucket {
  readonly label: string;
  readonly receiptCount: number;
  readonly shipmentCount: number;
  readonly adjustmentCount: number;
}

export interface StockMovementsOverTimeResponse {
  readonly filters: { readonly start: string; readonly end: string };
  readonly asOf: string;
  readonly granularity: string;
  readonly buckets: readonly StockMovementsOverTimeBucket[];
}

export interface TopProductRow {
  readonly productId: string;
  readonly productName: string;
  readonly sku: string;
  readonly revenue: string;
  readonly quantity: string;
  readonly unit: string | null;
}

export interface TopProductsResponse {
  readonly filters: { readonly start: string; readonly end: string };
  readonly asOf: string;
  readonly rows: readonly TopProductRow[];
}

export interface TopCustomerRow {
  readonly customerId: string;
  readonly customerName: string;
  readonly total: string;
}

export interface TopCustomersResponse {
  readonly filters: { readonly start: string; readonly end: string };
  readonly asOf: string;
  readonly rows: readonly TopCustomerRow[];
}

/** One category row in the sales-by-category report: a decimal string the member reads, never arithmetic. */
export interface SalesByCategoryRow {
  readonly category: string;
  readonly revenue: string;
  readonly quantity: string;
}

export interface SalesByCategoryResponse {
  readonly filters: { readonly start: string; readonly end: string };
  readonly asOf: string;
  readonly rows: readonly SalesByCategoryRow[];
}

/** One aging bucket: how many invoices, and their combined balance. */
export interface AgingBucket {
  readonly count: number;
  readonly balance: string;
}

export interface AgingBuckets {
  readonly current: AgingBucket;
  readonly d1_30: AgingBucket;
  readonly d31_60: AgingBucket;
  readonly d61_90: AgingBucket;
  readonly over90: AgingBucket;
}

export interface ReceivablesAgingResponse {
  readonly filters: { readonly start: string | null; readonly end: string | null };
  readonly asOf: string;
  readonly aging: AgingBuckets;
}

export interface StockHealthProduct {
  readonly id: string;
  readonly name: string;
  readonly sku: string;
  readonly available: string;
  readonly threshold?: string;
}

export interface StockHealthResponse {
  readonly asOf: string;
  readonly inStock: number;
  readonly lowStock: number;
  readonly outOfStock: number;
  readonly lowStockProducts: readonly StockHealthProduct[];
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  }
  return p.toString();
}

export async function getStockOnHand(params: Record<string, any>): Promise<StockOnHandResponse> {
  const res = await requestJson<StockOnHandResponse>(`${API_BASE}/reports/stock-on-hand?${qs(params)}`);
  if (!res.ok) throw new Error(res.failure.message);
  return res.data;
}

export async function getStockMovements(params: Record<string, any>): Promise<StockMovementsResponse> {
  const res = await requestJson<StockMovementsResponse>(`${API_BASE}/reports/stock-movements?${qs(params)}`);
  if (!res.ok) throw new Error(res.failure.message);
  return res.data;
}

export async function getOutstandingInvoices(params: Record<string, any>): Promise<OutstandingInvoicesResponse> {
  const res = await requestJson<OutstandingInvoicesResponse>(`${API_BASE}/reports/outstanding-invoices?${qs(params)}`);
  if (!res.ok) throw new Error(res.failure.message);
  return res.data;
}

export async function getKpiSummary(start: string, end: string): Promise<KpiSummaryResponse> {
  const res = await requestJson<KpiSummaryResponse>(`${API_BASE}/reports/kpi-summary?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
  if (!res.ok) throw new Error(res.failure.message);
  return res.data;
}

export async function getSalesOverTime(start: string, end: string): Promise<OverTimeResponse> {
  const res = await requestJson<OverTimeResponse>(`${API_BASE}/reports/sales-over-time?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
  if (!res.ok) throw new Error(res.failure.message);
  return res.data;
}

export async function getPurchasesOverTime(start: string, end: string): Promise<OverTimeResponse> {
  const res = await requestJson<OverTimeResponse>(`${API_BASE}/reports/purchases-over-time?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
  if (!res.ok) throw new Error(res.failure.message);
  return res.data;
}

export async function getPaymentsReceivedOverTime(start: string, end: string): Promise<OverTimeResponse> {
  const res = await requestJson<OverTimeResponse>(`${API_BASE}/reports/payments-received-over-time?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
  if (!res.ok) throw new Error(res.failure.message);
  return res.data;
}

export async function getTopProducts(start: string, end: string): Promise<TopProductsResponse> {
  const res = await requestJson<TopProductsResponse>(`${API_BASE}/reports/top-products?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
  if (!res.ok) throw new Error(res.failure.message);
  return res.data;
}

export async function getSalesByCategory(start: string, end: string): Promise<SalesByCategoryResponse> {
  const res = await requestJson<SalesByCategoryResponse>(`${API_BASE}/reports/sales-by-category?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
  if (!res.ok) throw new Error(res.failure.message);
  return res.data;
}

export async function getTopCustomers(start: string, end: string): Promise<TopCustomersResponse> {
  const res = await requestJson<TopCustomersResponse>(`${API_BASE}/reports/top-customers?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
  if (!res.ok) throw new Error(res.failure.message);
  return res.data;
}

export async function getDocumentsByStatus(start: string, end: string): Promise<DocumentStatusesResponse> {
  const res = await requestJson<DocumentStatusesResponse>(`${API_BASE}/reports/documents-by-status?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
  if (!res.ok) throw new Error(res.failure?.message ?? 'Request failed');
  return res.data;
}

export async function getReceivablesAging(): Promise<ReceivablesAgingResponse> {
  const res = await requestJson<ReceivablesAgingResponse>(`${API_BASE}/reports/receivables-aging`);
  if (!res.ok) throw new Error(res.failure.message);
  return res.data;
}

export async function getStockHealth(): Promise<StockHealthResponse> {
  const res = await requestJson<StockHealthResponse>(`${API_BASE}/reports/stock-health`);
  if (!res.ok) throw new Error(res.failure.message);
  return res.data;
}

export async function getStockMovementsOverTime(start: string, end: string): Promise<StockMovementsOverTimeResponse> {
  const res = await requestJson<StockMovementsOverTimeResponse>(`${API_BASE}/reports/stock-movements-over-time?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
  if (!res.ok) throw new Error(res.failure.message);
  return res.data;
}

export async function getDocumentStatuses(start: string, end: string): Promise<DocumentStatusesResponse> {
  const res = await requestJson<DocumentStatusesResponse>(`${API_BASE}/reports/document-statuses?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
  if (!res.ok) throw new Error(res.failure.message);
  return res.data;
}

export async function getStockReconciliation(): Promise<ReconciliationResponse> {
  const res = await requestJson<ReconciliationResponse>(`${API_BASE}/reports/stock-reconciliation`);
  if (!res.ok) throw new Error(res.failure.message);
  return res.data;
}