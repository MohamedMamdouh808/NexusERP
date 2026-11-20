/**
 * Shared fixtures for the Overview (dashboard) specs.
 *
 * One canned answer per endpoint the dashboard consumes, so every spec file
 * declares only the deltas it cares about. The shapes mirror the backend's
 * own DTOs (KpiSummaryResponse, OverTimeResponse, DocumentStatusesResponse,
 * ReceivablesAgingResponse, ReconciliationResponse, and the module list
 * pages), never the sample service.
 */

import { vi } from 'vitest';

import { jsonResponse } from '../../../test/render';

export const KPI_SUMMARY_FIXTURE = {
  filters: { start: '2026-11-01', end: '2026-11-16' },
  asOf: '2026-11-16T10:00:00.000Z',
  kpis: [
    { key: 'salesTotal', label: 'Sales', value: '100.00', unit: 'money', previousValue: '80.00', change: '20.00' },
    { key: 'invoiceCount', label: 'Invoices issued', value: '1', unit: 'count', previousValue: '2', change: '-1' },
    { key: 'purchasesTotal', label: 'Purchases', value: '100.00', unit: 'money', previousValue: '130.00', change: '-30.00' },
    { key: 'purchaseOrderCount', label: 'Purchase orders', value: '1', unit: 'count', previousValue: '1', change: '0' },
    { key: 'paymentsReceived', label: 'Payments received', value: '25.00', unit: 'money', previousValue: '10.00', change: '15.00' },
    { key: 'salesOrderCount', label: 'Sales orders created', value: '1', unit: 'count', previousValue: '3', change: '-2' },
    { key: 'purchaseOrderCreatedCount', label: 'Purchase orders created', value: '1', unit: 'count', previousValue: '1', change: '0' },
    { key: 'lowStockProductCount', label: 'Products low stock', value: '1', unit: 'count', previousValue: '1', change: '0' },
    { key: 'outOfStockProductCount', label: 'Products out of stock', value: '0', unit: 'count', previousValue: '1', change: '-1' },
    { key: 'outstanding', label: 'Outstanding receivables', value: '75.00', unit: 'money', asOf: 'today' },
    { key: 'outstandingInvoiceCount', label: 'Outstanding invoices', value: '1', unit: 'count', asOf: 'today' },
    { key: 'overdue', label: 'Overdue receivables', value: '75.00', unit: 'money', asOf: 'today' },
    { key: 'overdueInvoiceCount', label: 'Overdue invoices', value: '2', unit: 'count', asOf: 'today' },
  ],
} as const;

export const SALES_OVER_TIME_FIXTURE = {
  filters: { start: '2026-11-01', end: '2026-11-16' },
  asOf: '2026-11-16T10:00:00.000Z',
  granularity: 'day',
  buckets: [
    { label: '2026-11-02', value: '40.00', count: 1 },
    { label: '2026-11-09', value: '60.00', count: 1 },
  ],
} as const;

export const DOCUMENTS_BY_STATUS_FIXTURE = {
  purchaseOrders: { DRAFT: { count: 1, totalAmount: '10.00' } },
  salesOrders: {
    DRAFT: { count: 1, totalAmount: '10.00' },
    CONFIRMED: { count: 2, totalAmount: '250.00' },
    SHIPPED: { count: 1, totalAmount: '100.00' },
  },
  invoices: {},
  payments: {},
  shipments: 1,
  goodsReceipts: 1,
  dateRange: { start: '2026-11-01', end: '2026-11-16' },
} as const;

export const RECEIVABLES_AGING_FIXTURE = {
  filters: { start: null, end: null },
  asOf: '2026-11-16T10:00:00.000Z',
  aging: {
    current: { count: 1, balance: '50.00' },
    d1_30: { count: 1, balance: '25.00' },
    d31_60: { count: 0, balance: '0.00' },
    d61_90: { count: 0, balance: '0.00' },
    over90: { count: 0, balance: '0.00' },
  },
} as const;

export const STOCK_RECONCILIATION_FIXTURE = {
  items: [],
  total: 0,
  checkedAt: '2026-11-16T10:00:00.000Z',
} as const;

export const OVERDUE_INVOICES_FIXTURE = {
  items: [
    {
      id: 'inv-1',
      number: 'INV-000001',
      orderId: 'so-1',
      orderNumber: 'SO-000001',
      customerId: 'cust-1',
      customerName: 'Acme Retail',
      status: 'ISSUED',
      issueDate: '2026-11-01',
      dueDate: '2026-11-30',
      total: '100.00',
      balance: '75.00',
      isOverdue: false,
      version: 1,
      label: 'Operational invoice - not a tax invoice',
    },
  ],
  total: 1,
  page: 1,
  pageSize: 5,
  outstanding: '75.00',
  overdue: '75.00',
} as const;

export const CONFIRMED_SALES_ORDERS_FIXTURE = {
  items: [
    {
      id: 'so-1',
      number: 'SO-000001',
      customerId: 'cust-1',
      customerName: 'Acme Retail',
      warehouseId: 'wh-1',
      warehouseName: 'Main Warehouse',
      status: 'CONFIRMED',
      orderDate: '2026-11-14',
      total: '100.00',
      version: 1,
    },
  ],
  total: 1,
  page: 1,
  pageSize: 5,
} as const;

export const PURCHASE_ORDERS_AWAITING_FIXTURE = {
  items: [
    {
      id: 'po-1',
      number: 'PO-000001',
      supplierId: 'sup-1',
      supplierName: 'Acme Supplies',
      warehouseId: 'wh-1',
      warehouseName: 'Main Warehouse',
      status: 'CONFIRMED',
      orderDate: '2026-11-14',
      total: '100.00',
      version: 1,
      progress: { kind: 'LINES', fullyReceivedLineCount: 0, lineCount: 1 },
    },
  ],
  total: 1,
  page: 1,
  pageSize: 5,
} as const;

export const LOW_STOCK_FIXTURE = {
  items: [
    {
      productId: 'p-1',
      sku: 'SKU-LOW-1',
      productName: 'Low stock bolt',
      warehouseId: 'wh-1',
      warehouseName: 'Main Warehouse',
      onHand: '2.000',
      reserved: '0.000',
      available: '2.000',
      reorderLevel: '5.000',
    },
  ],
  total: 1,
  page: 1,
  pageSize: 5,
} as const;

export const AUDIT_FIXTURE = {
  entries: [
    { id: 'audit-1', organizationId: 'org-1', userId: 'u-1', action: 'INVOICE_ISSUED', recordType: 'invoice', recordId: 'inv-1', before: null, after: null, clientAddress: null, reasonCode: null, createdAt: '2026-11-16T09:00:00.000Z' },
    { id: 'audit-2', organizationId: 'org-1', userId: 'u-1', action: 'PAYMENT_RECORDED', recordType: 'payment', recordId: 'pay-1', before: null, after: null, clientAddress: null, reasonCode: null, createdAt: '2026-11-16T09:30:00.000Z' },
    { id: 'audit-3', organizationId: 'org-1', userId: 'u-2', action: 'SALES_ORDER_CONFIRMED', recordType: 'sales_order', recordId: 'so-1', before: null, after: null, clientAddress: null, reasonCode: null, createdAt: '2026-11-16T09:45:00.000Z' },
    { id: 'audit-4', organizationId: 'org-1', userId: 'u-1', action: 'STOCK_ADJUSTED', recordType: 'stock_movement', recordId: null, before: null, after: null, clientAddress: null, reasonCode: null, createdAt: '2026-11-16T10:00:00.000Z' },
    { id: 'audit-5', organizationId: 'org-1', userId: 'u-2', action: 'PURCHASE_ORDER_CONFIRMED', recordType: 'purchase_order', recordId: 'po-1', before: null, after: null, clientAddress: null, reasonCode: null, createdAt: '2026-11-16T10:15:00.000Z' },
    { id: 'audit-6', organizationId: 'org-1', userId: 'u-1', action: 'PRODUCT_UPDATED', recordType: 'product', recordId: 'p-1', before: null, after: null, clientAddress: null, reasonCode: null, createdAt: '2026-11-16T10:30:00.000Z' },
    { id: 'audit-7', organizationId: 'org-1', userId: 'u-1', action: 'CONTACT_CREATED', recordType: 'contact', recordId: 'c-1', before: { passwordHash: 'supersecret' }, after: null, clientAddress: null, reasonCode: null, createdAt: '2026-11-16T10:45:00.000Z' },
    { id: 'audit-8', organizationId: 'org-1', userId: 'u-2', action: 'MEMBERSHIP_DEACTIVATED', recordType: 'membership', recordId: null, before: null, after: null, clientAddress: null, reasonCode: null, createdAt: '2026-11-16T11:00:00.000Z' },
  ],
  total: 8,
  page: 1,
  pageSize: 8,
} as const;

export const PRODUCTS_PAGE_FIXTURE = { items: [], total: 0, page: 1, pageSize: 1 } as const;
export const CONTACTS_PAGE_FIXTURE = { items: [{ id: 'c-1' }], total: 3, page: 1, pageSize: 1 } as const;
export const STOCK_PAGE_FIXTURE = { items: [], total: 0, page: 1, pageSize: 1 } as const;

export interface DashboardFetchOptions {
  /** Overrides for any endpoint, matched by the request's pathname. */
  readonly respond?: (url: string, init: RequestInit) => Response | undefined;
}

/**
 * The canned answers the dashboard consumes, wired as a fetch router.
 * Each entry matches on the pathname (ignoring the query string), because the
 * dashboard's range parameters are irrelevant to what the test asserts.
 */
export const dashboardFetch = () => {
  const handlers: Array<{ match: (url: string) => boolean; respond: () => Response }> = [
    { match: (url) => url.startsWith('/api/v1/reports/kpi-summary'), respond: () => jsonResponse(KPI_SUMMARY_FIXTURE) },
    { match: (url) => url.startsWith('/api/v1/reports/sales-over-time'), respond: () => jsonResponse(SALES_OVER_TIME_FIXTURE) },
    { match: (url) => url.startsWith('/api/v1/reports/documents-by-status'), respond: () => jsonResponse(DOCUMENTS_BY_STATUS_FIXTURE) },
    { match: (url) => url.startsWith('/api/v1/reports/receivables-aging'), respond: () => jsonResponse(RECEIVABLES_AGING_FIXTURE) },
    { match: (url) => url.startsWith('/api/v1/reports/stock-reconciliation'), respond: () => jsonResponse(STOCK_RECONCILIATION_FIXTURE) },
    { match: (url) => url.startsWith('/api/v1/invoices?'), respond: () => jsonResponse(OVERDUE_INVOICES_FIXTURE) },
    { match: (url) => url.startsWith('/api/v1/sales-orders?'), respond: () => jsonResponse(CONFIRMED_SALES_ORDERS_FIXTURE) },
    { match: (url) => url.startsWith('/api/v1/purchase-orders?'), respond: () => jsonResponse(PURCHASE_ORDERS_AWAITING_FIXTURE) },
    {
      match: (url) => url.startsWith('/api/v1/inventory/stock-balances') && url.includes('lowStockOnly=true'),
      respond: () => jsonResponse(LOW_STOCK_FIXTURE),
    },
    {
      match: (url) => url.startsWith('/api/v1/inventory/stock-balances'),
      respond: () => jsonResponse(STOCK_PAGE_FIXTURE),
    },
    { match: (url) => url.startsWith('/api/v1/audit-logs'), respond: () => jsonResponse(AUDIT_FIXTURE) },
    { match: (url) => url.startsWith('/api/v1/products?'), respond: () => jsonResponse(PRODUCTS_PAGE_FIXTURE) },
    { match: (url) => url.startsWith('/api/v1/contacts?'), respond: () => jsonResponse(CONTACTS_PAGE_FIXTURE) },
  ];

  return handlers;
};

/** A fetch spy that answers from the canned handlers and refuses anything else. */
export function fetchRouter(handlers: ReadonlyArray<{ match: (url: string) => boolean; respond: () => Response }>) {
  return vi.fn(async (input: RequestInfo | URL, _init: RequestInit = {}) => {
    const url = String(input);
    const handler = handlers.find((entry) => entry.match(url));
    if (handler === undefined) {
      throw new Error(`unexpected fetch: ${url}`);
    }
    return handler.respond();
  });
}
