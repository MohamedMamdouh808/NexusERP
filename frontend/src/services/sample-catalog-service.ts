/**
 * The sample implementation of the service interface (T014).
 *
 * It exists so the interface's LIST, DETAIL and MUTATION halves are exercised in
 * memory rather than only declared, and so the gallery can be reviewed without a
 * backend (FR-068). Swapping it for the REST client later changes no component
 * (FR-036, FR-037).
 *
 * **Nothing persists.** The store is module-scoped, a mutation changes it and
 * nothing else, and there is no `localStorage`, `sessionStorage`, IndexedDB or
 * cookie anywhere in this file. A reload restores the initial rows, which is the
 * point: a demonstration that wrote to browser storage would be indistinguishable
 * from a saved change (FR-068, Principle III).
 *
 * Two rules that are easy to get wrong and are load-bearing here:
 *
 *  - **Sorting money never converts it to a number.** `compareDecimal` compares
 *    the strings digit by digit, because `Number('0.1') + Number('0.2')` is not
 *    `0.3` and an ordering that disagrees with the server's is a defect
 *    (Principle IV, FR-039).
 *  - **The simulated 429 is recognisable by the same rule as a real one.** The
 *    failing code and its status come from the shared `ERROR_CODE_STATUS` table
 *    rather than being written out here, and `catalog-service.spec.ts` asserts
 *    that `isRateLimited` - the one definition of "this is a rate limit", shared
 *    with the health panel - classifies it, so the error state the gallery
 *    reviews is the one the real client produces (research.md R-007, FR-069).
 */

import { DEFAULT_ERROR_MESSAGES, ERROR_CODES, ERROR_CODE_STATUS, PERMISSION_CATALOG, ROLE_TEMPLATES, type ErrorCode } from '@nexuserp/shared';

import type { ApiFailure } from '../lib/api-client';
import { compareDecimal } from '../lib/format';
import {
  addQuantities,
  centsToString,
  compactQuantity,
  compareQuantities,
  formatQuantity,
  fromThousandths,
  multiplyQuantities,
  subtractQuantities,
  sumMoney,
  toCents,
  toThousandths,
} from '../lib/quantity';
import {
  SAMPLE_CONTACTS,
  SAMPLE_DASHBOARD_SUMMARIES,
  SAMPLE_GOODS_RECEIPTS,
  SAMPLE_INVOICES,
  SAMPLE_MOVEMENTS,
  SAMPLE_SETTINGS_ORGANIZATION,
  SAMPLE_MODULES,
  SAMPLE_USERS,
  SAMPLE_AUDIT_ENTRIES,
  SAMPLE_PAYMENTS,
  SAMPLE_PRODUCTS,
  SAMPLE_PURCHASE_ORDERS,
  SAMPLE_RECORDS,
  SAMPLE_RESERVATIONS,
  SAMPLE_SALES_ORDERS,
  SAMPLE_SHIPMENTS,
  SAMPLE_WAREHOUSES,
} from '../mocks/sample-data';
import type {
  ArchiveContactInput,
  ArchiveProductInput,
  CatalogService,
  ConfirmSalesOrderInput,
  Contact,
  ContactPage,
  ContactQuery,
  ContactMutationResult,
  CreateInvoiceFromOrderInput,
  CreateInvoiceFromOrderResult,
  CreatePurchaseOrderInput,
  CreateSalesOrderInput,
  CreateWarehouseInput,
  DashboardPeriod,
  DashboardSummary,
  GoodsReceipt,
  GoodsReceiptPage,
  GoodsReceiptQuery,
  Invoice,
  InvoiceAllocation,
  InvoiceLine,
  InvoicableOrder,
  InvoicePage,
  InvoiceQuery,
  InvoiceStatus,
  IssueInvoiceInput,
  IssueInvoiceResult,
  ListQuery,
  Movement,
  MovementPage,
  MovementQuery,
  MovementType,
  Page,
  PostAdjustmentInput,
  PostAdjustmentResult,
  Product,
  ProductPage,
  ProductMutationResult,
  ProductQuery,
  PurchaseOrder,
  PurchaseOrderActionResult,
  PurchaseOrderLine,
  PurchaseOrderLineInput,
  PurchaseOrderPage,
  PurchaseOrderQuery,
  ReceiveGoodsInput,
  ReceiveGoodsResult,
  RemoveRecordInput,
  RemoveRecordResult,
  SalesOrder,
  SalesOrderActionResult,
  SalesOrderLine,
  SalesOrderLineInput,
  SalesOrderPage,
  SalesOrderQuery,
  SalesOrderStatus,
  SampleRecord,
  ShipSalesOrderInput,
  ShipSalesOrderResult,
  Shipment,
  ShipmentPage,
  ShipmentQuery,
  StockBalance,
  StockBalancePage,
  StockBalanceQuery,
  OpenInvoice,
  OpenInvoiceCustomer,
  OrganizationSettings,
  Organization,
  ModuleSetting,
  ModuleKey,
  ToggleModuleInput,
  UpdateOrganizationSettingsInput,
  SampleUser,
  UserPage,
  UserQuery,
  CreateUserInput,
  UpdateUserRolesInput,
  SampleRole,
  CreateRoleInput,
  UpdateRolePermissionsInput,
  PermissionGroup,
  AuditEntry,
  AuditPage,
  AuditQuery,
  Payment,
  PaymentPage,
  PaymentQuery,
  PaymentAllocation,
  RecordPaymentInput,
  RecordPaymentResult,
  ReversePaymentInput,
  ReversePaymentResult,
  UpdateInvoiceDueDateInput,
  UpdatePurchaseOrderInput,
  UpdateSalesOrderInput,
  UpdateWarehouseInput,
  VoidInvoiceInput,
  VoidInvoiceResult,
  Warehouse,
  WarehouseMutationResult,
} from './catalog-service';

/** Service operations recorded in the call log. */
export type CatalogOperation =
  | 'getDashboardSummary'
  | 'listRecords'
  | 'getRecord'
  | 'removeRecord'
  | 'listProducts'
  | 'getProduct'
  | 'createProduct'
  | 'updateProduct'
  | 'archiveProduct'
  | 'listContacts'
  | 'getContact'
  | 'createContact'
  | 'updateContact'
  | 'archiveContact'
  | 'restoreContact'
  | 'listWarehouses'
  | 'getWarehouse'
  | 'createWarehouse'
  | 'updateWarehouse'
  | 'deactivateWarehouse'
  | 'listStockBalances'
  | 'listMovements'
  | 'postAdjustment'
  | 'getLowStockCount'
  | 'listPurchaseOrders'
  | 'getPurchaseOrder'
  | 'createPurchaseOrder'
  | 'updatePurchaseOrder'
  | 'confirmPurchaseOrder'
  | 'cancelPurchaseOrder'
  | 'receiveGoods'
  | 'listGoodsReceipts'
  | 'listSalesOrders'
  | 'getSalesOrder'
  | 'createSalesOrder'
  | 'updateSalesOrder'
  | 'confirmSalesOrder'
  | 'cancelSalesOrder'
  | 'shipSalesOrder'
  | 'listShipments'
  | 'listInvoices'
  | 'getInvoice'
  | 'getInvoiceBalances'
  | 'listInvoicableOrders'
  | 'createInvoiceFromOrder'
  | 'updateInvoiceDueDate'
  | 'issueInvoice'
  | 'voidInvoice'
  | 'listPayments'
  | 'getPayment'
  | 'recordPayment'
  | 'reversePayment'
  | 'listOpenInvoicesForCustomer'
  | 'listOpenInvoiceCustomers'
  | 'getOrganizationSettings'
  | 'getOrganization'
  | 'updateOrganizationSettings'
  | 'listModules'
  | 'toggleModule'
  | 'listUsers'
  | 'getUser'
  | 'createUser'
  | 'updateUserRoles'
  | 'deactivateUser'
  | 'reactivateUser'
  | 'listRoles'
  | 'getRole'
  | 'createRole'
  | 'updateRolePermissions'
  | 'deleteRole'
  | 'listPermissions'
  | 'listAuditEntries'
  | 'getAuditEntry';

/** One recorded call. Read by the every-enabled-control guard (FR-071). */
export interface CallRecord {
  readonly operation: CatalogOperation;
  /** Monotonic, so a guard can assert that a NEW call happened, not just that one exists. */
  readonly sequence: number;
  /** What was asked for, e.g. `page 2 size 5` or the record id. */
  readonly detail: string;
}

/**
 * Which failure `simulateFailure` produces.
 *
 * A rate limit is a distinct kind rather than a second switch, because FR-069
 * asks for two labelled controls and the 429 is a case of "the call failed", not
 * a separate demonstration.
 */
export type FailureKind = 'error' | 'rate-limit';

/** How long `simulateSlowResponse` delays a call, in milliseconds. */
const SLOW_RESPONSE_MS = 600;

/** What the simulated rate limit tells the caller to wait. Not a real limit. */
const RATE_LIMIT_RETRY_AFTER_SECONDS = 30;

/**
 * A rejection that is also an `ApiFailure`.
 *
 * It extends `Error` so test tooling and `rejects.toThrow` behave normally, and it
 * carries the failure's own fields so a caller reads `status` and `requestId`
 * directly rather than unwrapping a property. That is what makes "the rejection
 * carries `status: 429`" literally true (FR-069).
 */
export class SampleServiceFailure extends Error implements ApiFailure {
  readonly code: ApiFailure['code'];
  readonly details: ApiFailure['details'];
  readonly requestId: string;
  readonly status: number;
  readonly retryAfterSeconds: number | null;

  constructor(failure: ApiFailure) {
    super(failure.message);
    this.name = 'SampleServiceFailure';
    this.code = failure.code;
    this.details = failure.details;
    this.requestId = failure.requestId;
    this.status = failure.status;
    this.retryAfterSeconds = failure.retryAfterSeconds;
  }
}

/** The sample implementation's own surface: the interface plus the review-only extras. */
export interface SampleCatalogService extends CatalogService {
  /** When on, the next call rejects (FR-069). */
  simulateFailure: boolean;
  /** Which failure `simulateFailure` produces (FR-069). */
  failureKind: FailureKind;
  /** When on, the next call is delayed so the loading state is visible (FR-069). */
  simulateSlowResponse: boolean;
  /** When on, dashboard reads return an empty first-use result. */
  simulateEmptyData: boolean;
  /** Every call made, oldest first. Read by the guard (FR-071). */
  readonly calls: readonly CallRecord[];
  /** Restores the initial rows and switches. Used by tests; nothing is persisted. */
  reset(): void;
}

// --- module-scoped in-memory state -----------------------------------------

let rows: SampleRecord[] = SAMPLE_RECORDS.map((record) => ({ ...record }));
let products: Product[] = SAMPLE_PRODUCTS.map((product) => ({ ...product }));
let contacts: Contact[] = SAMPLE_CONTACTS.map((contact) => ({ ...contact }));
let warehouses: Warehouse[] = SAMPLE_WAREHOUSES.map((warehouse) => ({ ...warehouse }));
let movements: Movement[] = SAMPLE_MOVEMENTS.map((movement) => ({ ...movement }));
/** Reserved quantities keyed by `productId|warehouseId`. */
const reservations = new Map<string, string>(
  SAMPLE_RESERVATIONS.map((r) => [`${r.productId}|${r.warehouseId}`, r.reserved]),
);
/** Posted adjustments keyed by idempotency key, for idempotent retries. */
const postedAdjustments = new Map<string, PostAdjustmentResult>();
let purchaseOrders: PurchaseOrder[] = SAMPLE_PURCHASE_ORDERS.map((order) => ({ ...order }));
let goodsReceipts: GoodsReceipt[] = SAMPLE_GOODS_RECEIPTS.map((receipt) => ({ ...receipt }));
/** Posted receipts keyed by idempotency key, for idempotent retries. */
const postedReceipts = new Map<string, ReceiveGoodsResult>();
let salesOrders: SalesOrder[] = SAMPLE_SALES_ORDERS.map((order) => ({ ...order }));
let shipments: Shipment[] = SAMPLE_SHIPMENTS.map((shipment) => ({ ...shipment }));
/** Posted sales confirmations keyed by idempotency key, for idempotent retries. */
const postedSalesConfirmations = new Map<string, SalesOrderActionResult>();
/** Posted shipments keyed by idempotency key, for idempotent retries. */
const postedShipments = new Map<string, ShipSalesOrderResult>();
let invoices: Invoice[] = SAMPLE_INVOICES.map((invoice) => ({ ...invoice }));
let payments: Payment[] = SAMPLE_PAYMENTS.map((payment) => ({ ...payment }));
let organization: Organization = { ...SAMPLE_SETTINGS_ORGANIZATION, currencyLocked: false };
let modules: ModuleSetting[] = SAMPLE_MODULES.map((entry) => ({ ...entry }));
let users: SampleUser[] = SAMPLE_USERS.map((entry) => ({ ...entry, roleIds: [...entry.roleIds] }));
let roles: SampleRole[] = ROLE_TEMPLATES.map((role) => ({ id: `role-${role.key}`, name: role.name, description: role.description, permissions: [...role.permissions], system: true }));
let auditEntries: AuditEntry[] = SAMPLE_AUDIT_ENTRIES.map((entry) => ({ ...entry, changes: entry.changes.map((change) => ({ ...change })) }));
let auditSequence = auditEntries.length;
/** Posted invoice actions keyed by idempotency key, for idempotent retries. */
const postedInvoiceCreations = new Map<string, CreateInvoiceFromOrderResult>();
const postedInvoiceIssues = new Map<string, IssueInvoiceResult>();
const postedInvoiceVoids = new Map<string, VoidInvoiceResult>();
const editedInvoiceDueDates = new Set<string>();
/** Posted payments and reversals keyed by idempotency key, for idempotent retries. */
const postedPayments = new Map<string, RecordPaymentResult>();
const postedReversals = new Map<string, ReversePaymentResult>();
let callLog: CallRecord[] = [];
let callSequence = 0;
let requestSequence = 0;

const controls = {
  simulateFailure: false,
  failureKind: 'error' as FailureKind,
  simulateSlowResponse: false,
  simulateEmptyData: false,
};

function appendAudit(input: Omit<AuditEntry, 'id' | 'time'>): void {
  auditSequence += 1;
  auditEntries.push({ ...input, id: `audit-${String(auditSequence).padStart(4, '0')}`, time: new Date().toISOString(), changes: input.changes.map((change) => ({ ...change })) });
}
function auditMutation(input: { action: string; actionLabel: string; recordType: string; recordId: string | null; recordNumber: string; summary: string; changes: readonly { field: string; before: string; after: string }[] }): void {
  appendAudit({ userId: null, userName: 'Preview user (sample)', ...input });
}
function getRolePermissions(roleIds: readonly string[]): string[] {
  return [...new Set(roles.filter((role) => roleIds.includes(role.id)).flatMap((role) => role.permissions))].sort();
}
function canChangeCurrency(): boolean {
  return salesOrders.length > 0 || purchaseOrders.length > 0 || invoices.length > 0;
}
function hasOpenWork(module: ModuleKey): string | undefined {
  if (module === 'sales') {
    const drafts = salesOrders.filter((order) => order.status === 'DRAFT').length;
    const confirmed = salesOrders.filter((order) => order.status === 'CONFIRMED').length;
    return drafts + confirmed ? `Sales has open documents: ${drafts} drafts and ${confirmed} confirmed orders` : undefined;
  }
  if (module === 'purchasing') {
    const drafts = purchaseOrders.filter((order) => order.status === 'DRAFT').length;
    const confirmed = purchaseOrders.filter((order) => order.status === 'CONFIRMED').length;
    const partial = purchaseOrders.filter((order) => order.status === 'PARTIALLY_RECEIVED').length;
    return drafts + confirmed + partial ? `Purchasing has open documents: ${drafts} drafts, ${confirmed} confirmed orders and ${partial} partially received orders` : undefined;
  }
  if (module === 'invoicing') {
    const drafts = invoices.filter((invoice) => invoice.status === 'DRAFT').length;
    const issued = invoices.filter((invoice) => invoice.status === 'ISSUED').length;
    const partial = invoices.map(invoiceView).filter((invoice) => invoice.status === 'PARTIALLY_PAID').length;
    return drafts + issued + partial ? `Invoicing has open documents: ${drafts} drafts, ${issued} issued and ${partial} partially paid invoices` : undefined;
  }
  if (module === 'inventory') {
    const count = [...reservations.values()].filter((quantity) => compareQuantities(quantity, '0.000') > 0).length;
    return count ? `Inventory has active reservations: ${count}` : undefined;
  }
  return undefined;
}

function nextRequestId(): string {
  requestSequence += 1;
  return `sample-request-${requestSequence}`;
}

/**
 * A failure with a request identifier and a message safe to display - the same
 * shape `src/lib/api-client.ts` produces, so the UI has one thing to handle
 * (FR-021, FR-026).
 */
function buildFailure(kind: FailureKind): ApiFailure {
  const requestId = nextRequestId();

  if (kind === 'rate-limit') {
    return {
      code: ERROR_CODES.TOO_MANY_REQUESTS,
      message: DEFAULT_ERROR_MESSAGES[ERROR_CODES.TOO_MANY_REQUESTS],
      details: [],
      requestId,
      // The status comes from the shared table rather than being written beside
      // the code, so a code can never travel with the wrong status.
      status: ERROR_CODE_STATUS[ERROR_CODES.TOO_MANY_REQUESTS],
      retryAfterSeconds: RATE_LIMIT_RETRY_AFTER_SECONDS,
    };
  }

  return {
    code: ERROR_CODES.INTERNAL_ERROR,
    message: DEFAULT_ERROR_MESSAGES[ERROR_CODES.INTERNAL_ERROR].replace('{requestId}', requestId),
    details: [],
    requestId,
    status: ERROR_CODE_STATUS[ERROR_CODES.INTERNAL_ERROR],
    retryAfterSeconds: null,
  };
}

function notFound(requestId: string): ApiFailure {
  return {
    code: ERROR_CODES.NOT_FOUND,
    message: DEFAULT_ERROR_MESSAGES[ERROR_CODES.NOT_FOUND],
    details: [],
    requestId,
    status: ERROR_CODE_STATUS[ERROR_CODES.NOT_FOUND],
    retryAfterSeconds: null,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Records the call before it can fail, so a rejected call is still observable. */
function record(operation: CatalogOperation, detail: string): void {
  callSequence += 1;
  callLog.push({ operation, sequence: callSequence, detail });
}

/**
 * The one gate every operation passes through, so the switches cannot be honoured
 * by one operation and forgotten by another.
 */
async function beforeCall(operation: CatalogOperation, detail: string): Promise<void> {
  record(operation, detail);

  if (controls.simulateSlowResponse) {
    await delay(SLOW_RESPONSE_MS);
  }

  if (controls.simulateFailure) {
    throw new SampleServiceFailure(buildFailure(controls.failureKind));
  }
}

async function getDashboardSummary(period: DashboardPeriod): Promise<DashboardSummary> {
  await beforeCall('getDashboardSummary', period);

  const summary = copyDashboardSummary(SAMPLE_DASHBOARD_SUMMARIES[period]);
  if (!controls.simulateEmptyData) {
    // Derive the low stock count from the same inventory sample data the
    // Inventory feature uses, so the dashboard and the balances page agree.
    const lowStockCount = computeLowStockCount();
    // Derive the active orders and the status breakdown from the same sales
    // sample data the Sales feature uses, so the dashboard and the sales
    // screen stay one story after a confirm, ship or cancel.
    const salesOrderByStatus = new Map<SalesOrderStatus, number>([
      ['DRAFT', 0],
      ['CONFIRMED', 0],
      ['SHIPPED', 0],
      ['CANCELLED', 0],
    ]);
    for (const order of salesOrders) {
      salesOrderByStatus.set(order.status, (salesOrderByStatus.get(order.status) ?? 0) + 1);
    }
    const now = new Date();

    // Calendar windows in UTC, matching the ISO dates the sample helper writes.
    // `this-month` is the month the app loads in; `last-month` the one before it.
    // Everything the period figures show derives from these two windows and the
    // one before that (the basis of the last-month comparison), so the numbers
    // on one screen cannot contradict each other: the Sales KPI, the trend
    // slices, the donut and the top-products chart all total the same records.
    const monthWindow = (back: number): { start: string; end: string } => ({
      start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1)).toISOString().slice(0, 10),
      end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back + 1, 0)).toISOString().slice(0, 10),
    });
    const window = monthWindow(period === 'last-month' ? 1 : 0);

    // Revenue window totals: issued (incl. paid and partially paid, never void
    // or draft) invoice totals by issue date. Sums are scaled-integer cents
    // (Principle IV); the string conversion happens once at the edge.
    const issuedInvoicesIn = (start: string, end: string) =>
      invoices
        .map(invoiceView)
        .filter((invoice) => invoice.status !== 'DRAFT' && invoice.status !== 'VOID' && invoice.issueDate !== null && invoice.issueDate >= start && invoice.issueDate <= end);
    const salesCentsIn = (start: string, end: string) =>
      issuedInvoicesIn(start, end).reduce((total, invoice) => total + toCents(invoice.total), 0n);
    const windowSalesCents = salesCentsIn(window.start, window.end);
    const priorWindow = monthWindow(period === 'last-month' ? 2 : 1);
    const priorSalesCents = salesCentsIn(priorWindow.start, priorWindow.end);

    // The Sales change is derived from the same two windows, never stated
    // alongside figures the derivation cannot support.
    let salesChange: { direction: 'up' | 'down'; percent: number } | null = null;
    if (priorSalesCents > 0n) {
      const percent = Math.round(((Number(windowSalesCents) - Number(priorSalesCents)) / Number(priorSalesCents)) * 1000) / 10;
      salesChange = { direction: windowSalesCents >= priorSalesCents ? 'up' : 'down', percent };
    }

    // The trend splits the window into five slices and counts issued sales and
    // orders placed in each, so a slice's orders agree with the donut's counts.
    const daysInWindow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (period === 'last-month' ? 1 : 0) + 1, 0)).getUTCDate();
    const sliceSize = Math.ceil(daysInWindow / 5);
    const windowStartDate = new Date(`${window.start}T00:00:00Z`);
    const salesOrdersTrend: { date: string; sales: string; orders: number }[] = [];
    for (let slice = 0; slice < 5; slice += 1) {
      const sliceStart = new Date(windowStartDate.getUTCFullYear(), windowStartDate.getUTCMonth(), windowStartDate.getUTCDate() + slice * sliceSize);
      const sliceEnd = new Date(windowStartDate.getUTCFullYear(), windowStartDate.getUTCMonth(), windowStartDate.getUTCDate() + Math.min((slice + 1) * sliceSize, daysInWindow) - 1);
      const start = sliceStart.toISOString().slice(0, 10);
      const end = sliceEnd.toISOString().slice(0, 10);
      salesOrdersTrend.push({
        date: `Week ${slice + 1}`,
        sales: centsToString(salesCentsIn(start, end)),
        orders: salesOrders.filter((order) => order.orderDate >= start && order.orderDate <= end).length,
      });
    }

    // Orders placed in the window, by status (the donut); their total and the
    // trend's total are the same number by construction.
    const inWindowOrders = salesOrders.filter((order) => order.orderDate >= window.start && order.orderDate <= window.end);
    const ordersByStatus = summary.ordersByStatus.map((entry) => ({
      ...entry,
      count: inWindowOrders.filter((order) => order.status === entry.status).length,
    }));

    // Units ordered in the window by product, aggregated in scaled thousandths
    // and converted once at the edge (quantities carry three decimals).
    const unitsByProduct = new Map<string, { product: string; scaled: bigint }>();
    for (const order of inWindowOrders) {
      for (const line of order.lines) {
        const entry = unitsByProduct.get(line.productId) ?? { product: line.productName, scaled: 0n };
        entry.scaled += toThousandths(line.quantity);
        unitsByProduct.set(line.productId, entry);
      }
    }
    const topSellingProducts = [...unitsByProduct.values()]
      .map((entry) => ({ product: entry.product, unitsSold: Number(entry.scaled) / 1000 }))
      .sort((left, right) => right.unitsSold - left.unitsSold || left.product.localeCompare(right.product))
      .slice(0, 5);

    const outstanding = invoices
      .map(invoiceView)
      .filter((invoice) => invoice.status === 'ISSUED' || invoice.status === 'PARTIALLY_PAID')
      .map((invoice) => invoice.balance);
    const recentActivity = [...auditEntries]
      .sort((left, right) => right.time.localeCompare(left.time))
      .slice(0, 5)
      .map((entry) => ({
        id: entry.id,
        time: new Date(entry.time).toLocaleString(),
        activity: `${entry.actionLabel}: ${entry.summary}`,
        category: entry.recordType === 'Inventory' || entry.recordType === 'Adjustment' || entry.recordType === 'Shipment' || entry.recordType === 'Goods receipt'
          ? 'Inventory' as const
          : entry.recordType === 'Sales order'
            ? 'Sales' as const
            : entry.recordType === 'Purchase order'
              ? 'Orders' as const
              : entry.recordType === 'Invoice' || entry.recordType === 'Payment'
                ? 'Invoices' as const
                : 'Administration' as const,
        user: entry.userName,
        status: entry.changes.find((change) => change.field === 'Status')?.after ?? entry.action,
      }));
    return {
      ...summary,
      recentActivity,
      sales: {
        ...summary.sales,
        value: centsToString(windowSalesCents),
        changeDirection: salesChange?.direction ?? null,
        changePercent: salesChange?.percent ?? null,
      },
      // Without a comparable earlier period these three measures get no change:
      // a number next to a percentage the interface did not derive the same way
      // is the contradiction this screen is not allowed to produce.
      activeOrders: {
        ...summary.activeOrders,
        value: salesOrderByStatus.get('CONFIRMED') ?? 0,
      },
      lowStockItems: {
        ...summary.lowStockItems,
        value: lowStockCount,
      },
      outstandingInvoices: {
        ...summary.outstandingInvoices,
        value: sumMoney(...outstanding),
      },
      topSellingProducts,
      salesOrdersTrend,
      ordersByStatus,
    };
  }

  return {
    ...summary,
    topSellingProducts: [],
    salesOrdersTrend: [],
    ordersByStatus: [],
    recentActivity: [],
    empty: true,
  };
}

/** Computes the count of balances at or below their reorder level, without recording a call. */
function computeLowStockCount(): number {
  const balances = computeStockBalances();
  return balances.filter((b) => {
    if (b.reorderLevel === null) return false;
    return compareQuantities(b.available, b.reorderLevel) <= 0;
  }).length;
}

function copyDashboardSummary(summary: DashboardSummary): DashboardSummary {
  return {
    ...summary,
    sales: { ...summary.sales },
    activeOrders: { ...summary.activeOrders },
    lowStockItems: { ...summary.lowStockItems },
    outstandingInvoices: { ...summary.outstandingInvoices },
    topSellingProducts: summary.topSellingProducts.map((item) => ({ ...item })),
    salesOrdersTrend: summary.salesOrdersTrend.map((item) => ({ ...item })),
    ordersByStatus: summary.ordersByStatus.map((item) => ({ ...item })),
    recentActivity: summary.recentActivity.map((item) => ({ ...item })),
  };
}

/** Sorts a copy of the rows. Money is compared as a decimal string (Principle IV). */
function sorted(records: readonly SampleRecord[], query: ListQuery): SampleRecord[] {
  const sort = query.sort;
  if (sort === undefined || sort === '') return [...records];

  const sign = query.direction === 'desc' ? -1 : 1;
  const key = sort as keyof SampleRecord;

  return [...records].sort((a, b) => {
    if (key === 'amount') return compareDecimal(a.amount, b.amount, 2) * sign;
    return String(a[key]).localeCompare(String(b[key]), undefined, { sensitivity: 'base' }) * sign;
  });
}

async function listRecords(query: ListQuery): Promise<Page<SampleRecord>> {
  await beforeCall('listRecords', `page ${query.page} size ${query.pageSize}`);

  const ordered = sorted(rows, query);
  const start = Math.max(0, (query.page - 1) * query.pageSize);

  return {
    items: ordered.slice(start, start + query.pageSize),
    // The count of the whole set, not of the page. A pager given the page's own
    // length cannot render a total or decide whether a next page exists (FR-025).
    total: ordered.length,
  };
}

async function getRecord(id: string): Promise<SampleRecord> {
  await beforeCall('getRecord', id);

  const found = rows.find((record) => record.id === id);
  if (found === undefined) {
    throw new SampleServiceFailure(notFound(nextRequestId()));
  }

  return { ...found };
}

async function removeRecord(input: RemoveRecordInput): Promise<RemoveRecordResult> {
  await beforeCall('removeRecord', input.id);

  const index = rows.findIndex((record) => record.id === input.id);
  if (index === -1) {
    throw new SampleServiceFailure(notFound(nextRequestId()));
  }

  // Removed from the module-scoped list and nothing else. A resolved mutation
  // returns a label, never the record, so nothing here reads as committed.
  const [removed] = rows.splice(index, 1);
  return { removedLabel: removed.name };
}

async function listProducts(query: ProductQuery): Promise<ProductPage> {
  await beforeCall('listProducts', `page ${query.page} size ${query.pageSize}`);

  let filtered = products;

  if (query.search) {
    const term = query.search.toLowerCase();
    filtered = filtered.filter(
      (p) => p.sku.toLowerCase().includes(term) || p.name.toLowerCase().includes(term) || p.category.toLowerCase().includes(term),
    );
  }

  if (query.category) {
    filtered = filtered.filter((p) => p.category === query.category);
  }

  if (query.status) {
    filtered = filtered.filter((p) => p.status === query.status);
  }

  const sign = query.direction === 'desc' ? -1 : 1;
  const sort = query.sort;
  if (sort) {
    filtered = [...filtered].sort((a, b) => {
      const av = a[sort as keyof Product];
      const bv = b[sort as keyof Product];
      if (typeof av === 'string' && typeof bv === 'string') {
        return av.localeCompare(bv, undefined, { sensitivity: 'base' }) * sign;
      }
      return 0;
    });
  }

  const start = Math.max(0, (query.page - 1) * query.pageSize);

  return {
    items: filtered.slice(start, start + query.pageSize),
    total: filtered.length,
  };
}

async function getProduct(id: string): Promise<Product> {
  await beforeCall('getProduct', id);

  const found = products.find((product) => product.id === id);
  if (found === undefined) {
    throw new SampleServiceFailure(notFound(nextRequestId()));
  }

  return { ...found };
}

async function createProduct(input: Omit<Product, 'id'>): Promise<{ readonly sku: string }> {
  await beforeCall('createProduct', input.sku);

  const id = `prod-${String(products.length + 1).padStart(4, '0')}`;
  const product: Product = { ...input, id };
  products.push(product);
  return { sku: product.sku };
}

async function updateProduct(input: Product): Promise<{ readonly sku: string }> {
  await beforeCall('updateProduct', input.id);

  const index = products.findIndex((product) => product.id === input.id);
  if (index === -1) {
    throw new SampleServiceFailure(notFound(nextRequestId()));
  }

  products[index] = { ...input };
  return { sku: products[index].sku };
}

async function archiveProduct(input: ArchiveProductInput): Promise<ProductMutationResult> {
  await beforeCall('archiveProduct', input.id);

  const index = products.findIndex((product) => product.id === input.id);
  if (index === -1) {
    throw new SampleServiceFailure(notFound(nextRequestId()));
  }

  products[index] = { ...products[index], status: 'ARCHIVED' };
  return { removedLabel: products[index].name };
}

async function listContacts(query: ContactQuery): Promise<ContactPage> {
  await beforeCall('listContacts', `page ${query.page} size ${query.pageSize}`);

  let filtered = contacts;

  if (query.search) {
    const term = query.search.toLowerCase();
    filtered = filtered.filter(
      (c) =>
        c.code.toLowerCase().includes(term) ||
        c.name.toLowerCase().includes(term) ||
        c.email.toLowerCase().includes(term),
    );
  }

  if (query.role) {
    filtered = filtered.filter((c) => c.role === query.role);
  }

  if (query.status) {
    filtered = filtered.filter((c) => c.status === query.status);
  }

  const sign = query.direction === 'desc' ? -1 : 1;
  const sort = query.sort;
  if (sort) {
    filtered = [...filtered].sort((a, b) => {
      const av = a[sort as keyof Contact];
      const bv = b[sort as keyof Contact];
      if (typeof av === 'string' && typeof bv === 'string') {
        return av.localeCompare(bv, undefined, { sensitivity: 'base' }) * sign;
      }
      return 0;
    });
  }

  const start = Math.max(0, (query.page - 1) * query.pageSize);

  return {
    items: filtered.slice(start, start + query.pageSize),
    total: filtered.length,
  };
}

async function getContact(id: string): Promise<Contact> {
  await beforeCall('getContact', id);

  const found = contacts.find((contact) => contact.id === id);
  if (found === undefined) {
    throw new SampleServiceFailure(notFound(nextRequestId()));
  }

  return { ...found };
}

async function createContact(input: Omit<Contact, 'id'>): Promise<{ readonly code: string }> {
  await beforeCall('createContact', input.code);

  const id = `contact-${String(contacts.length + 1).padStart(4, '0')}`;
  const contact: Contact = { ...input, id };
  contacts.push(contact);
  return { code: contact.code };
}

async function updateContact(input: Contact): Promise<{ readonly code: string }> {
  await beforeCall('updateContact', input.id);

  const index = contacts.findIndex((contact) => contact.id === input.id);
  if (index === -1) {
    throw new SampleServiceFailure(notFound(nextRequestId()));
  }

  contacts[index] = { ...input };
  return { code: contacts[index].code };
}

async function archiveContact(input: ArchiveContactInput): Promise<ContactMutationResult> {
  await beforeCall('archiveContact', input.id);

  const index = contacts.findIndex((contact) => contact.id === input.id);
  if (index === -1) {
    throw new SampleServiceFailure(notFound(nextRequestId()));
  }

  const hasOpenOrder = salesOrders.some((order) => order.customerId === input.id && (order.status === 'DRAFT' || order.status === 'CONFIRMED'));
  const hasUnpaidInvoice = invoices.some((invoice) => invoice.customerId === input.id && invoice.status !== 'VOID' && invoice.status !== 'DRAFT' && compareDecimal(invoiceBalance(invoice.id), '0.00', 2) > 0);
  if (hasOpenOrder || hasUnpaidInvoice) {
    throw new SampleServiceFailure(buildFailureWithCode(ERROR_CODES.CONFLICT, nextRequestId(), 'This customer has open orders or unpaid invoices.'));
  }
  contacts[index] = { ...contacts[index], status: 'ARCHIVED' };
  return { removedLabel: contacts[index].name };
}

async function restoreContact(input: ArchiveContactInput): Promise<ContactMutationResult> {
  await beforeCall('restoreContact', input.id);

  const index = contacts.findIndex((contact) => contact.id === input.id);
  if (index === -1) {
    throw new SampleServiceFailure(notFound(nextRequestId()));
  }

  contacts[index] = { ...contacts[index], status: 'ACTIVE' };
  return { removedLabel: contacts[index].name };
}

/** Stock movement source number sequences. They continue after the highest
 *  number the sample ledger already uses, so a number the service assigns can
 *  never collide with a sample number (GR-000005 follows the sample receipts). */
function maxSourceSequence(prefix: string): number {
  return movements.reduce((max, movement) => {
    if (!movement.source.startsWith(prefix)) return max;
    const parsed = Number.parseInt(movement.source.slice(prefix.length), 10);
    return Number.isNaN(parsed) ? max : Math.max(max, parsed);
  }, 0);
}

let receiptSequence = maxSourceSequence('GR-');
let shipmentSequence = maxSourceSequence('SH-');
let adjustmentSequence = maxSourceSequence('ADJ-');
/** Purchase order numbers continue after the sample orders. */
let poSequence = SAMPLE_PURCHASE_ORDERS.length;
/** Sales order numbers continue after the sample orders. */
let soSequence = SAMPLE_SALES_ORDERS.length;

/**
 * The highest numbered document the sample arrays already carry, so a sequence
 * the service assigns can never collide with a sample number (INV-000006
 * follows INV-000005; unnumbered drafts contribute nothing).
 */
function maxDocumentSequence(prefix: string, numbers: readonly (string | null)[]): number {
  return numbers.reduce((max, number) => {
    if (number === null || !number.startsWith(prefix)) return max;
    const parsed = Number.parseInt(number.slice(prefix.length), 10);
    return Number.isNaN(parsed) ? max : Math.max(max, parsed);
  }, 0);
}

/** Invoice and payment numbers continue after the sample documents. */
let invoiceSequence = maxDocumentSequence(
  'INV-',
  SAMPLE_INVOICES.map((invoice) => invoice.number),
);
let paySequence = maxDocumentSequence(
  'PAY-',
  SAMPLE_PAYMENTS.map((payment) => payment.number),
);

function nextSource(type: MovementType): string {
  switch (type) {
    case 'RECEIPT':
      receiptSequence += 1;
      return `GR-${String(receiptSequence).padStart(6, '0')}`;
    case 'SHIPMENT':
      shipmentSequence += 1;
      return `SH-${String(shipmentSequence).padStart(6, '0')}`;
    case 'ADJUSTMENT':
      adjustmentSequence += 1;
      return `ADJ-${String(adjustmentSequence).padStart(6, '0')}`;
  }
}

/** Computes stock balances from the module-scoped movements and reservations. */
function computeStockBalances(): StockBalance[] {
  const byKey = new Map<string, bigint>();

  for (const movement of movements) {
    const key = `${movement.productId}|${movement.warehouseId}`;
    const existing = byKey.get(key);
    if (existing === undefined) {
      byKey.set(key, toThousandths(movement.quantity));
    } else {
      byKey.set(key, existing + toThousandths(movement.quantity));
    }
  }

  const balances: StockBalance[] = [];
  for (const [key, onHandThousandths] of byKey) {
    const [productId, warehouseId] = key.split('|');
    const product = products.find((p) => p.id === productId);
    const warehouse = warehouses.find((w) => w.id === warehouseId);
    if (product === undefined || warehouse === undefined) continue;

    const reserved = reservations.get(key) ?? '0.000';
    const onHand = fromThousandths(onHandThousandths);
    const available = subtractQuantities(onHand, reserved);

    balances.push({
      productId,
      productSku: product.sku,
      productName: product.name,
      warehouseId,
      warehouseName: warehouse.name,
      onHand,
      reserved,
      available,
      reorderLevel: product.lowStockThreshold,
    });
  }

  return balances;
}

async function listWarehouses(): Promise<readonly Warehouse[]> {
  await beforeCall('listWarehouses', '');
  return [...warehouses];
}

async function getWarehouse(id: string): Promise<Warehouse> {
  await beforeCall('getWarehouse', id);

  const found = warehouses.find((warehouse) => warehouse.id === id);
  if (found === undefined) {
    throw new SampleServiceFailure(notFound(nextRequestId()));
  }

  return { ...found };
}

async function createWarehouse(input: CreateWarehouseInput): Promise<{ readonly code: string }> {
  await beforeCall('createWarehouse', input.code);

  const existing = warehouses.find(
    (warehouse) => warehouse.code.toLowerCase() === input.code.toLowerCase(),
  );
  if (existing !== undefined) {
    throw new SampleServiceFailure(
      buildFailureWithCode(ERROR_CODES.DUPLICATE_RECORD, nextRequestId()),
    );
  }

  const warehouse: Warehouse = {
    id: `warehouse-${String(warehouses.length + 1).padStart(4, '0')}`,
    ...input,
    status: 'ACTIVE',
  };

  if (input.isDefault) {
    warehouses = warehouses.map((w) =>
      w.isDefault ? { ...w, isDefault: false } : w,
    );
  }

  warehouses.push(warehouse);
  return { code: warehouse.code };
}

async function updateWarehouse(input: UpdateWarehouseInput): Promise<{ readonly code: string }> {
  await beforeCall('updateWarehouse', input.id);

  const index = warehouses.findIndex((warehouse) => warehouse.id === input.id);
  if (index === -1) {
    throw new SampleServiceFailure(notFound(nextRequestId()));
  }

  const existing = warehouses.find(
    (warehouse) =>
      warehouse.id !== input.id &&
      warehouse.code.toLowerCase() === input.code.toLowerCase(),
  );
  if (existing !== undefined) {
    throw new SampleServiceFailure(
      buildFailureWithCode(ERROR_CODES.DUPLICATE_RECORD, nextRequestId()),
    );
  }

  const previous = warehouses[index];
  const warehouse: Warehouse = { ...input };

  if (input.isDefault && !previous.isDefault) {
    warehouses = warehouses.map((w) =>
      w.id !== input.id ? { ...w, isDefault: false } : w,
    );
  }

  warehouses[index] = warehouse;
  return { code: warehouse.code };
}

async function deactivateWarehouse(id: string): Promise<WarehouseMutationResult> {
  await beforeCall('deactivateWarehouse', id);

  const index = warehouses.findIndex((warehouse) => warehouse.id === id);
  if (index === -1) {
    throw new SampleServiceFailure(notFound(nextRequestId()));
  }

  const warehouse = warehouses[index];

  if (warehouse.isDefault) {
    throw new SampleServiceFailure(
      buildFailureWithCode(ERROR_CODES.CONFLICT, nextRequestId()),
    );
  }

  const balances = computeStockBalances();
  const holdsStock = balances.some(
    (balance) => balance.warehouseId === id && compareQuantities(balance.onHand, '0.000') > 0,
  );
  if (holdsStock) {
    throw new SampleServiceFailure(
      buildFailureWithCode(ERROR_CODES.INSUFFICIENT_STOCK, nextRequestId()),
    );
  }

  warehouses[index] = { ...warehouse, status: 'INACTIVE' };
  return { removedLabel: warehouse.name };
}

async function listStockBalances(query: StockBalanceQuery): Promise<StockBalancePage> {
  await beforeCall('listStockBalances', `page ${query.page} size ${query.pageSize}`);

  let balances = computeStockBalances();

  if (query.search) {
    const term = query.search.toLowerCase();
    balances = balances.filter(
      (b) =>
        b.productSku.toLowerCase().includes(term) ||
        b.productName.toLowerCase().includes(term) ||
        b.warehouseName.toLowerCase().includes(term),
    );
  }

  if (query.warehouseId) {
    balances = balances.filter((b) => b.warehouseId === query.warehouseId);
  }

  if (query.lowStockOnly) {
    balances = balances.filter((b) => {
      if (b.reorderLevel === null) return false;
      return compareQuantities(b.available, b.reorderLevel) <= 0;
    });
  }

  const sign = query.direction === 'desc' ? -1 : 1;
  const sort = query.sort;
  if (sort) {
    balances = [...balances].sort((a, b) => {
      const av = a[sort as keyof StockBalance];
      const bv = b[sort as keyof StockBalance];
      if (typeof av === 'string' && typeof bv === 'string') {
        return av.localeCompare(bv, undefined, { sensitivity: 'base' }) * sign;
      }
      return 0;
    });
  }

  const start = Math.max(0, (query.page - 1) * query.pageSize);
  const pageItems = balances.slice(start, start + query.pageSize);

  return {
    items: pageItems,
    total: balances.length,
  };
}

async function listMovements(query: MovementQuery): Promise<MovementPage> {
  await beforeCall('listMovements', `page ${query.page} size ${query.pageSize}`);

  let filtered = movements;

  if (query.search) {
    const term = query.search.toLowerCase();
    filtered = filtered.filter(
      (m) =>
        m.productSku.toLowerCase().includes(term) ||
        m.productName.toLowerCase().includes(term),
    );
  }

  if (query.warehouseId) {
    filtered = filtered.filter((m) => m.warehouseId === query.warehouseId);
  }

  if (query.type) {
    filtered = filtered.filter((m) => m.type === query.type);
  }

  if (query.startDate) {
    // Date-only filter: compare the calendar day, so a movement on the end
    // date is inside a range the picker includes (createdAt is an ISO timestamp).
    filtered = filtered.filter((m) => m.createdAt.slice(0, 10) >= query.startDate!);
  }

  if (query.endDate) {
    filtered = filtered.filter((m) => m.createdAt.slice(0, 10) <= query.endDate!);
  }

  const sign = query.direction === 'desc' ? -1 : 1;
  const sort = query.sort;
  if (sort) {
    filtered = [...filtered].sort((a, b) => {
      const av = a[sort as keyof Movement];
      const bv = b[sort as keyof Movement];
      if (typeof av === 'string' && typeof bv === 'string') {
        return av.localeCompare(bv, undefined, { sensitivity: 'base' }) * sign;
      }
      return 0;
    });
  }

  const start = Math.max(0, (query.page - 1) * query.pageSize);

  return {
    items: filtered.slice(start, start + query.pageSize),
    total: filtered.length,
  };
}

async function postAdjustment(input: PostAdjustmentInput): Promise<PostAdjustmentResult> {
  await beforeCall('postAdjustment', input.idempotencyKey);

  // Idempotency: return the original result if this key was already posted.
  const existing = postedAdjustments.get(input.idempotencyKey);
  if (existing !== undefined) {
    return existing;
  }

  const product = products.find((p) => p.id === input.productId);
  const warehouse = warehouses.find((w) => w.id === input.warehouseId);
  if (product === undefined || warehouse === undefined) {
    throw new SampleServiceFailure(notFound(nextRequestId()));
  }

  // Compute current on hand for this product/warehouse.
  const balances = computeStockBalances();
  const balance = balances.find(
    (b) => b.productId === input.productId && b.warehouseId === input.warehouseId,
  );
  const currentOnHand = balance === undefined ? '0.000' : balance.onHand;

  const newOnHand = addQuantities(currentOnHand, input.quantity);

  // Reject if the result would be negative or below the reserved quantity.
  const reserved = reservations.get(`${input.productId}|${input.warehouseId}`) ?? '0.000';
  if (compareQuantities(newOnHand, '0.000') < 0) {
    throw new SampleServiceFailure(
      buildFailureWithCode(ERROR_CODES.INSUFFICIENT_STOCK, nextRequestId()),
    );
  }
  if (compareQuantities(newOnHand, reserved) < 0) {
    throw new SampleServiceFailure(
      buildFailureWithCode(
        ERROR_CODES.INSUFFICIENT_STOCK,
        nextRequestId(),
        `Adjustment would reduce stock below the reserved quantity of ${formatQuantity(reserved)}.`,
      ),
    );
  }

  const source = nextSource('ADJUSTMENT');
  const now = new Date().toISOString();
  const movement: Movement = {
    id: `adjustment-${String(movements.length + 1).padStart(4, '0')}`,
    source,
    type: 'ADJUSTMENT',
    productId: input.productId,
    productSku: product.sku,
    productName: product.name,
    warehouseId: input.warehouseId,
    warehouseName: warehouse.name,
    quantity: input.quantity,
    reason: input.reason,
    user: 'Preview user',
    createdAt: now,
  };

  movements.push(movement);
  auditMutation({ action: 'STOCK_ADJUSTED', actionLabel: 'Stock adjusted', recordType: 'Adjustment', recordId: movement.id, recordNumber: source, summary: `${product.name} stock was adjusted.`, changes: [{ field: 'Quantity', before: '0.000', after: input.quantity }, { field: 'Reason', before: '—', after: input.reason }] });
  const result: PostAdjustmentResult = { source, movement };
  postedAdjustments.set(input.idempotencyKey, result);
  return result;
}

async function getLowStockCount(): Promise<number> {
  await beforeCall('getLowStockCount', '');
  return computeLowStockCount();
}

// --- Purchasing --------------------------------------------------------------

/**
 * Sums the receipted quantity of each line of one order, straight from the
 * receipts themselves. The receipt is the single source of truth; the stored
 * order's own received values are never trusted.
 */
function receivedByLine(orderId: string): Map<string, string> {
  const sums = new Map<string, bigint>();
  for (const receipt of goodsReceipts) {
    if (receipt.orderId !== orderId) continue;
    for (const line of receipt.lines) {
      const existing = sums.get(line.lineId);
      sums.set(line.lineId, (existing ?? 0n) + toThousandths(line.quantity));
    }
  }

  const received = new Map<string, string>();
  for (const [lineId, total] of sums) {
    received.set(lineId, fromThousandths(total));
  }
  return received;
}

/** Builds the derived view of an order: received, outstanding, line totals, total. */
function buildOrderView(order: PurchaseOrder): PurchaseOrder {
  const received = receivedByLine(order.id);
  const lines: PurchaseOrderLine[] = order.lines.map((line) => {
    const receivedQty = received.get(line.id) ?? '0.000';
    return {
      ...line,
      received: receivedQty,
      outstanding: subtractQuantities(line.quantity, receivedQty),
      lineTotal: multiplyQuantities(line.quantity, line.unitCost),
    };
  });
  return {
    ...order,
    lines,
    total: sumMoney(...lines.map((line) => line.lineTotal)),
  };
}

/** Validates line input shared by create and update: real products, positive quantities, non-negative costs, duplicate products refused. */
function validateLines(lines: readonly PurchaseOrderLineInput[]): readonly { productId: string; product: Product; quantity: string; unitCost: string }[] {
  if (lines.length === 0) {
    throw new SampleServiceFailure(
      buildFailureWithCode(
        ERROR_CODES.VALIDATION_FAILED,
        nextRequestId(),
        'A purchase order needs at least one line.',
      ),
    );
  }

  const resolved: { productId: string; product: Product; quantity: string; unitCost: string }[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const product = products.find((p) => p.id === line.productId);
    if (product === undefined) {
      throw new SampleServiceFailure(notFound(nextRequestId()));
    }
    if (seen.has(product.id)) {
      throw new SampleServiceFailure(
        buildFailureWithCode(
          ERROR_CODES.DUPLICATE_RECORD,
          nextRequestId(),
          `${product.name} appears on more than one line. Use one line per product.`,
        ),
      );
    }
    seen.add(product.id);

    if (compareQuantities(line.quantity, '0.000') <= 0 || !/^\d+(\.\d{1,3})?$/.test(line.quantity)) {
      throw new SampleServiceFailure(
        buildFailureWithCode(
          ERROR_CODES.VALIDATION_FAILED,
          nextRequestId(),
          'Line quantities must be greater than zero.',
        ),
      );
    }

    if (compareQuantities(line.unitCost, '0.0000') < 0 || !/^\d+(\.\d{1,4})?$/.test(line.unitCost)) {
      throw new SampleServiceFailure(
        buildFailureWithCode(
          ERROR_CODES.VALIDATION_FAILED,
          nextRequestId(),
          'Unit costs must not be negative and carry up to 4 decimal places.',
        ),
      );
    }

    resolved.push({ productId: product.id, product, quantity: line.quantity, unitCost: line.unitCost });
  }
  return resolved;
}

/** Builds stored lines for a create or update, resolving the product fields from the catalogue. */
function buildStoredLines(orderId: string, lines: readonly PurchaseOrderLineInput[]): PurchaseOrderLine[] {
  return validateLines(lines).map((resolved, index) => ({
    id: `${orderId}-line-${index + 1}`,
    productId: resolved.product.id,
    productSku: resolved.product.sku,
    productName: resolved.product.name,
    quantity: resolved.quantity,
    received: '0.000',
    outstanding: resolved.quantity,
    unitCost: resolved.unitCost,
    lineTotal: multiplyQuantities(resolved.quantity, resolved.unitCost),
  }));
}

function orderSorter(query: PurchaseOrderQuery, views: PurchaseOrder[]): PurchaseOrder[] {
  const sign = query.direction === 'desc' ? -1 : 1;
  const sort = query.sort;
  if (sort === undefined || sort === '') return views;
  return [...views].sort((a, b) => {
    const key = sort as keyof PurchaseOrder;
    if (key === 'total') return compareDecimal(a.total, b.total, 2) * sign;
    return String(a[key]).localeCompare(String(b[key]), undefined, { sensitivity: 'base' }) * sign;
  });
}

async function listPurchaseOrders(query: PurchaseOrderQuery): Promise<PurchaseOrderPage> {
  await beforeCall('listPurchaseOrders', `page ${query.page} size ${query.pageSize}`);

  let orders = purchaseOrders.map((order) => buildOrderView(order));

  if (query.search) {
    const term = query.search.toLowerCase();
    orders = orders.filter(
      (order) =>
        order.number.toLowerCase().includes(term) ||
        order.supplierName.toLowerCase().includes(term) ||
        order.lines.some((line) => line.productSku.toLowerCase().includes(term) || line.productName.toLowerCase().includes(term)),
    );
  }

  if (query.status) {
    orders = orders.filter((order) => order.status === query.status);
  }

  const ordered = orderSorter(query, orders);
  const start = Math.max(0, (query.page - 1) * query.pageSize);

  return {
    items: ordered.slice(start, start + query.pageSize),
    total: ordered.length,
  };
}

async function getPurchaseOrder(id: string): Promise<PurchaseOrder> {
  await beforeCall('getPurchaseOrder', id);

  const found = purchaseOrders.find((order) => order.id === id);
  if (found === undefined) {
    throw new SampleServiceFailure(notFound(nextRequestId()));
  }

  return buildOrderView(found);
}

async function createPurchaseOrder(input: CreatePurchaseOrderInput): Promise<{ readonly id: string; readonly number: string }> {
  await beforeCall('createPurchaseOrder', input.supplierId);

  const supplier = contacts.find((contact) => contact.id === input.supplierId);
  const warehouse = warehouses.find((w) => w.id === input.warehouseId);
  if (supplier === undefined || warehouse === undefined) {
    throw new SampleServiceFailure(notFound(nextRequestId()));
  }

  poSequence += 1;
  const id = `po-${String(purchaseOrders.length + 1).padStart(4, '0')}`;
  const order: PurchaseOrder = {
    id,
    number: `PO-${String(poSequence).padStart(6, '0')}`,
    supplierId: supplier.id,
    supplierName: supplier.name,
    warehouseId: warehouse.id,
    warehouseName: warehouse.name,
    status: 'DRAFT',
    orderDate: input.orderDate,
    expectedDate: input.expectedDate,
    notes: input.notes,
    lines: buildStoredLines(id, input.lines),
    total: '0.00',
  };

  purchaseOrders.push(order);
  return { id: order.id, number: order.number };
}

async function updatePurchaseOrder(input: UpdatePurchaseOrderInput): Promise<{ readonly number: string }> {
  await beforeCall('updatePurchaseOrder', input.id);

  const index = purchaseOrders.findIndex((order) => order.id === input.id);
  if (index === -1) {
    throw new SampleServiceFailure(notFound(nextRequestId()));
  }

  const order = purchaseOrders[index];
  if (order.status !== 'DRAFT') {
    throw new SampleServiceFailure(
      buildFailureWithCode(
        ERROR_CODES.INVALID_STATE_TRANSITION,
        nextRequestId(),
        'Only draft purchase orders can be edited. To change a confirmed order, cancel it and create a new one.',
      ),
    );
  }

  const supplier = contacts.find((contact) => contact.id === input.supplierId);
  const warehouse = warehouses.find((w) => w.id === input.warehouseId);
  if (supplier === undefined || warehouse === undefined) {
    throw new SampleServiceFailure(notFound(nextRequestId()));
  }

  const updated: PurchaseOrder = {
    ...order,
    supplierId: supplier.id,
    supplierName: supplier.name,
    warehouseId: warehouse.id,
    warehouseName: warehouse.name,
    orderDate: input.orderDate,
    expectedDate: input.expectedDate,
    notes: input.notes,
    lines: buildStoredLines(order.id, input.lines),
  };

  purchaseOrders[index] = updated;
  return { number: updated.number };
}

async function confirmPurchaseOrder(id: string): Promise<PurchaseOrderActionResult> {
  await beforeCall('confirmPurchaseOrder', id);

  const index = purchaseOrders.findIndex((order) => order.id === id);
  if (index === -1) {
    throw new SampleServiceFailure(notFound(nextRequestId()));
  }

  const order = purchaseOrders[index];
  if (order.status !== 'DRAFT') {
    throw new SampleServiceFailure(
      buildFailureWithCode(
        ERROR_CODES.INVALID_STATE_TRANSITION,
        nextRequestId(),
        'Only draft purchase orders can be confirmed.',
      ),
    );
  }

  if (order.lines.length === 0) {
    throw new SampleServiceFailure(
      buildFailureWithCode(
        ERROR_CODES.VALIDATION_FAILED,
        nextRequestId(),
        'A purchase order needs at least one line before it can be confirmed.',
      ),
    );
  }

  purchaseOrders[index] = { ...order, status: 'CONFIRMED' };
  auditMutation({ action: 'PURCHASE_ORDER_CONFIRMED', actionLabel: 'Purchase order confirmed', recordType: 'Purchase order', recordId: order.id, recordNumber: order.number, summary: `Purchase order ${order.number} was confirmed.`, changes: [{ field: 'Status', before: 'DRAFT', after: 'CONFIRMED' }] });
  return { number: order.number, status: 'CONFIRMED' };
}

async function cancelPurchaseOrder(id: string): Promise<PurchaseOrderActionResult> {
  await beforeCall('cancelPurchaseOrder', id);

  const index = purchaseOrders.findIndex((order) => order.id === id);
  if (index === -1) {
    throw new SampleServiceFailure(notFound(nextRequestId()));
  }

  const order = purchaseOrders[index];
  if (order.status === 'CANCELLED') {
    throw new SampleServiceFailure(
      buildFailureWithCode(
        ERROR_CODES.INVALID_STATE_TRANSITION,
        nextRequestId(),
        'This order is already cancelled.',
      ),
    );
  }

  if (order.status === 'RECEIVED') {
    throw new SampleServiceFailure(
      buildFailureWithCode(
        ERROR_CODES.INVALID_STATE_TRANSITION,
        nextRequestId(),
        'This order is fully received and cannot be cancelled.',
      ),
    );
  }

  const hasReceipts = goodsReceipts.some((receipt) => receipt.orderId === id);
  if (hasReceipts) {
    throw new SampleServiceFailure(
      buildFailureWithCode(
        ERROR_CODES.CONFLICT,
        nextRequestId(),
        'This order already has receipts.',
      ),
    );
  }

  purchaseOrders[index] = { ...order, status: 'CANCELLED' };
  auditMutation({ action: 'PURCHASE_ORDER_CANCELLED', actionLabel: 'Purchase order cancelled', recordType: 'Purchase order', recordId: order.id, recordNumber: order.number, summary: `Purchase order ${order.number} was cancelled.`, changes: [{ field: 'Status', before: order.status, after: 'CANCELLED' }] });
  return { number: order.number, status: 'CANCELLED' };
}

async function receiveGoods(input: ReceiveGoodsInput): Promise<ReceiveGoodsResult> {
  await beforeCall('receiveGoods', input.idempotencyKey);

  // Idempotency: return the original result if this key was already posted, so a
  // double click or a retried request creates one receipt, never two.
  const existing = postedReceipts.get(input.idempotencyKey);
  if (existing !== undefined) {
    return existing;
  }

  const index = purchaseOrders.findIndex((order) => order.id === input.orderId);
  if (index === -1) {
    throw new SampleServiceFailure(notFound(nextRequestId()));
  }

  const order = purchaseOrders[index];
  if (order.status !== 'CONFIRMED' && order.status !== 'PARTIALLY_RECEIVED') {
    throw new SampleServiceFailure(
      buildFailureWithCode(
        ERROR_CODES.INVALID_STATE_TRANSITION,
        nextRequestId(),
        'Goods can be received against confirmed or partially received orders only.',
      ),
    );
  }

  const view = buildOrderView(order);
  const outstanding = new Map<string, string>(
    view.lines.map((line) => [line.id, line.outstanding]),
  );

  let anyQuantity = false;
  const quantities = new Map<string, string>();
  for (const entry of input.quantities) {
    const lineOutstanding = outstanding.get(entry.lineId);
    if (lineOutstanding === undefined) {
      throw new SampleServiceFailure(notFound(nextRequestId()));
    }

    const quantity = entry.quantity === '' ? '0.000' : entry.quantity;
    if (!/^\d+(\.\d{1,3})?$/.test(quantity)) {
      throw new SampleServiceFailure(
        buildFailureWithCode(
          ERROR_CODES.VALIDATION_FAILED,
          nextRequestId(),
          'Received quantities carry up to 3 decimal places.',
        ),
      );
    }

    if (compareQuantities(quantity, lineOutstanding) > 0) {
      throw new SampleServiceFailure(
        buildFailureWithCode(
          ERROR_CODES.OVER_RECEIPT,
          nextRequestId(),
          `Received quantity exceeds the outstanding quantity of ${formatQuantity(lineOutstanding)}.`,
        ),
      );
    }

    if (compareQuantities(quantity, '0.000') > 0) {
      anyQuantity = true;
      quantities.set(entry.lineId, quantity);
    }
  }

  if (!anyQuantity) {
    throw new SampleServiceFailure(
      buildFailureWithCode(
        ERROR_CODES.VALIDATION_FAILED,
        nextRequestId(),
        'Enter at least one quantity.',
      ),
    );
  }

  // One goods receipt document, one GR number, one movement per received line.
  const number = nextSource('RECEIPT');
  const supplier = contacts.find((contact) => contact.id === order.supplierId);
  const warehouse = warehouses.find((w) => w.id === order.warehouseId);
  const now = new Date().toISOString();

  const receiptLines: GoodsReceipt['lines'][number][] = [];
  for (const [lineId, quantity] of quantities) {
    const line = view.lines.find((entry) => entry.id === lineId);
    if (line === undefined) continue;

    receiptLines.push({
      lineId: line.id,
      productId: line.productId,
      productSku: line.productSku,
      productName: line.productName,
      quantity,
      unitCost: line.unitCost,
    });

    movements.push({
      id: `movement-${String(movements.length + 1).padStart(4, '0')}`,
      source: number,
      type: 'RECEIPT',
      productId: line.productId,
      productSku: line.productSku,
      productName: line.productName,
      warehouseId: order.warehouseId,
      warehouseName: warehouse?.name ?? order.warehouseName,
      quantity,
      reason: `Received against ${order.number}`,
      user: 'Preview user',
      createdAt: now,
    });
  }

  const receipt: GoodsReceipt = {
    id: `receipt-${String(goodsReceipts.length + 1).padStart(4, '0')}`,
    number,
    orderId: order.id,
    orderNumber: order.number,
    supplierId: order.supplierId,
    supplierName: supplier?.name ?? order.supplierName,
    warehouseId: order.warehouseId,
    warehouseName: warehouse?.name ?? order.warehouseName,
    receiptDate: now,
    lines: receiptLines,
    user: 'Preview user',
  };
  goodsReceipts.push(receipt);

  // A derived status: fully received when every line's outstanding is zero.
  const after = buildOrderView(order);
  const fullyReceived = after.lines.every((line) => compareQuantities(line.outstanding, '0.000') === 0);
  purchaseOrders[index] = { ...order, status: fullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED' };
  auditMutation({ action: 'GOODS_RECEIVED', actionLabel: 'Goods received', recordType: 'Goods receipt', recordId: receipt.id, recordNumber: receipt.number, summary: `Goods were received against ${order.number}.`, changes: [{ field: 'Status', before: order.status, after: fullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED' }] });

  const result: ReceiveGoodsResult = {
    number,
    status: purchaseOrders[index].status,
  };
  postedReceipts.set(input.idempotencyKey, result);
  return result;
}

async function listGoodsReceipts(query: GoodsReceiptQuery): Promise<GoodsReceiptPage> {
  await beforeCall('listGoodsReceipts', `page ${query.page} size ${query.pageSize}`);

  let filtered = goodsReceipts;

  if (query.search) {
    const term = query.search.toLowerCase();
    filtered = filtered.filter(
      (receipt) =>
        receipt.number.toLowerCase().includes(term) ||
        receipt.orderNumber.toLowerCase().includes(term) ||
        receipt.supplierName.toLowerCase().includes(term) ||
        receipt.lines.some((line) => line.productSku.toLowerCase().includes(term) || line.productName.toLowerCase().includes(term)),
    );
  }

  if (query.startDate) {
    // Date-only filter: compare the calendar day, so a receipt on the end
    // date is inside a range the picker includes (receiptDate is an ISO timestamp).
    filtered = filtered.filter((receipt) => receipt.receiptDate.slice(0, 10) >= query.startDate!);
  }

  if (query.endDate) {
    filtered = filtered.filter((receipt) => receipt.receiptDate.slice(0, 10) <= query.endDate!);
  }

  const sign = query.direction === 'desc' ? -1 : 1;
  const sort = query.sort;
  if (sort) {
    filtered = [...filtered].sort((a, b) => {
      const av = a[sort as keyof GoodsReceipt];
      const bv = b[sort as keyof GoodsReceipt];
      if (typeof av === 'string' && typeof bv === 'string') {
        // Document numbers and dates compare lexically (zero-padded and ISO).
        return av.localeCompare(bv, undefined, { sensitivity: 'base' }) * sign;
      }
      return 0;
    });
  }

  const start = Math.max(0, (query.page - 1) * query.pageSize);

  return {
    items: filtered.slice(start, start + query.pageSize),
    total: filtered.length,
  };
}

// --- Sales -------------------------------------------------------------------

/** Builds the derived view of a sales order: line totals and the total are recomputed, never trusted. */
function buildSalesOrderView(order: SalesOrder): SalesOrder {
  const lines: SalesOrderLine[] = order.lines.map((line) => ({
    ...line,
    lineTotal: multiplyQuantities(line.quantity, line.unitPrice),
  }));
  return {
    ...order,
    lines,
    total: sumMoney(...lines.map((line) => line.lineTotal)),
  };
}

/** Validates line input shared by create and update: real products, positive quantities, non-negative prices, duplicate products refused. */
function validateSalesLines(
  lines: readonly SalesOrderLineInput[],
): readonly { productId: string; product: Product; quantity: string; unitPrice: string }[] {
  if (lines.length === 0) {
    throw new SampleServiceFailure(
      buildFailureWithCode(
        ERROR_CODES.VALIDATION_FAILED,
        nextRequestId(),
        'A sales order needs at least one line.',
      ),
    );
  }

  const resolved: { productId: string; product: Product; quantity: string; unitPrice: string }[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const product = products.find((p) => p.id === line.productId);
    if (product === undefined) {
      throw new SampleServiceFailure(notFound(nextRequestId()));
    }
    if (seen.has(product.id)) {
      throw new SampleServiceFailure(
        buildFailureWithCode(
          ERROR_CODES.DUPLICATE_RECORD,
          nextRequestId(),
          `${product.name} appears on more than one line. Use one line per product.`,
        ),
      );
    }
    seen.add(product.id);

    if (compareQuantities(line.quantity, '0.000') <= 0 || !/^\d+(\.\d{1,3})?$/.test(line.quantity)) {
      throw new SampleServiceFailure(
        buildFailureWithCode(
          ERROR_CODES.VALIDATION_FAILED,
          nextRequestId(),
          'Line quantities must be greater than zero.',
        ),
      );
    }

    if (compareQuantities(line.unitPrice, '0.0000') < 0 || !/^\d+(\.\d{1,4})?$/.test(line.unitPrice)) {
      throw new SampleServiceFailure(
        buildFailureWithCode(
          ERROR_CODES.VALIDATION_FAILED,
          nextRequestId(),
          'Unit prices must not be negative and carry up to 4 decimal places.',
        ),
      );
    }

    resolved.push({ productId: product.id, product, quantity: line.quantity, unitPrice: line.unitPrice });
  }
  return resolved;
}

/** Builds stored sales lines for a create or update, resolving the product fields from the catalogue. */
function buildStoredSalesLines(orderId: string, lines: readonly SalesOrderLineInput[]): SalesOrderLine[] {
  return validateSalesLines(lines).map((resolved, index) => ({
    id: `${orderId}-line-${index + 1}`,
    productId: resolved.product.id,
    productSku: resolved.product.sku,
    productName: resolved.product.name,
    quantity: resolved.quantity,
    unitPrice: resolved.unitPrice,
    lineTotal: multiplyQuantities(resolved.quantity, resolved.unitPrice),
  }));
}

function salesOrderSorter(query: SalesOrderQuery, views: SalesOrder[]): SalesOrder[] {
  const sign = query.direction === 'desc' ? -1 : 1;
  const sort = query.sort;
  if (sort === undefined || sort === '') return views;
  return [...views].sort((a, b) => {
    const key = sort as keyof SalesOrder;
    if (key === 'total') return compareDecimal(a.total, b.total, 2) * sign;
    return String(a[key]).localeCompare(String(b[key]), undefined, { sensitivity: 'base' }) * sign;
  });
}

async function listSalesOrders(query: SalesOrderQuery): Promise<SalesOrderPage> {
  await beforeCall('listSalesOrders', `page ${query.page} size ${query.pageSize}`);

  let orders = salesOrders.map((order) => buildSalesOrderView(order));

  if (query.search) {
    const term = query.search.toLowerCase();
    orders = orders.filter(
      (order) =>
        order.number.toLowerCase().includes(term) ||
        order.customerName.toLowerCase().includes(term) ||
        order.lines.some((line) => line.productSku.toLowerCase().includes(term) || line.productName.toLowerCase().includes(term)),
    );
  }

  if (query.status) {
    orders = orders.filter((order) => order.status === query.status);
  }

  const ordered = salesOrderSorter(query, orders);
  const start = Math.max(0, (query.page - 1) * query.pageSize);

  return {
    items: ordered.slice(start, start + query.pageSize),
    total: ordered.length,
  };
}

async function getSalesOrder(id: string): Promise<SalesOrder> {
  await beforeCall('getSalesOrder', id);

  const found = salesOrders.find((order) => order.id === id);
  if (found === undefined) {
    throw new SampleServiceFailure(notFound(nextRequestId()));
  }

  return buildSalesOrderView(found);
}

async function createSalesOrder(input: CreateSalesOrderInput): Promise<{ readonly id: string; readonly number: string }> {
  await beforeCall('createSalesOrder', input.customerId);

  const customer = contacts.find((contact) => contact.id === input.customerId);
  const warehouse = warehouses.find((w) => w.id === input.warehouseId);
  if (customer === undefined || warehouse === undefined) {
    throw new SampleServiceFailure(notFound(nextRequestId()));
  }

  soSequence += 1;
  const id = `so-${String(salesOrders.length + 1).padStart(4, '0')}`;
  const order: SalesOrder = {
    id,
    number: `SO-${String(soSequence).padStart(6, '0')}`,
    customerId: customer.id,
    customerName: customer.name,
    warehouseId: warehouse.id,
    warehouseName: warehouse.name,
    status: 'DRAFT',
    orderDate: input.orderDate,
    notes: input.notes,
    lines: buildStoredSalesLines(id, input.lines),
    total: '0.00',
  };

  salesOrders.push(order);
  return { id: order.id, number: order.number };
}

async function updateSalesOrder(input: UpdateSalesOrderInput): Promise<{ readonly number: string }> {
  await beforeCall('updateSalesOrder', input.id);

  const index = salesOrders.findIndex((order) => order.id === input.id);
  if (index === -1) {
    throw new SampleServiceFailure(notFound(nextRequestId()));
  }

  const order = salesOrders[index];
  if (order.status !== 'DRAFT') {
    throw new SampleServiceFailure(
      buildFailureWithCode(
        ERROR_CODES.INVALID_STATE_TRANSITION,
        nextRequestId(),
        'Only draft sales orders can be edited. To change a confirmed order, cancel it and create a new one.',
      ),
    );
  }

  const customer = contacts.find((contact) => contact.id === input.customerId);
  const warehouse = warehouses.find((w) => w.id === input.warehouseId);
  if (customer === undefined || warehouse === undefined) {
    throw new SampleServiceFailure(notFound(nextRequestId()));
  }

  const updated: SalesOrder = {
    ...order,
    customerId: customer.id,
    customerName: customer.name,
    warehouseId: warehouse.id,
    warehouseName: warehouse.name,
    orderDate: input.orderDate,
    notes: input.notes,
    lines: buildStoredSalesLines(order.id, input.lines),
  };

  salesOrders[index] = updated;
  return { number: updated.number };
}

/**
 * The availability of one product in one warehouse right now. Confirming never
 * trusts the numbers the form showed: the check reads movements and
 * reservations at the moment of confirmation.
 */
function availableFor(productId: string, warehouseId: string): string {
  const balance = computeStockBalances().find(
    (b) => b.productId === productId && b.warehouseId === warehouseId,
  );
  if (balance === undefined) return '0.000';
  return subtractQuantities(balance.onHand, balance.reserved);
}

async function confirmSalesOrder(input: ConfirmSalesOrderInput): Promise<SalesOrderActionResult> {
  await beforeCall('confirmSalesOrder', input.orderId);

  // Idempotency: return the original result if this key was already posted, so a
  // double click or a retried request creates one reservation set, never two.
  const existing = postedSalesConfirmations.get(input.idempotencyKey);
  if (existing !== undefined) {
    return existing;
  }

  const index = salesOrders.findIndex((order) => order.id === input.orderId);
  if (index === -1) {
    throw new SampleServiceFailure(notFound(nextRequestId()));
  }

  const order = salesOrders[index];
  if (order.status !== 'DRAFT') {
    throw new SampleServiceFailure(
      buildFailureWithCode(
        ERROR_CODES.INVALID_STATE_TRANSITION,
        nextRequestId(),
        'Only draft sales orders can be confirmed.',
      ),
    );
  }

  if (order.lines.length === 0) {
    throw new SampleServiceFailure(
      buildFailureWithCode(
        ERROR_CODES.VALIDATION_FAILED,
        nextRequestId(),
        'A sales order needs at least one line before it can be confirmed.',
      ),
    );
  }

  // All or nothing: every line is checked FIRST, and nothing is reserved
  // unless every line fits. The message names each short product with its
  // available and required quantities.
  const shortages: string[] = [];
  for (const line of order.lines) {
    const available = availableFor(line.productId, order.warehouseId);
    if (compareQuantities(available, line.quantity) < 0) {
      shortages.push(
        `${line.productName} - available ${compactQuantity(available)}, required ${compactQuantity(line.quantity)}`,
      );
    }
  }
  if (shortages.length > 0) {
    throw new SampleServiceFailure(
      buildFailureWithCode(
        ERROR_CODES.INSUFFICIENT_STOCK,
        nextRequestId(),
        `Not enough stock: ${shortages.join('; ')}`,
      ),
    );
  }

  for (const line of order.lines) {
    const key = `${line.productId}|${order.warehouseId}`;
    const reserved = reservations.get(key) ?? '0.000';
    reservations.set(key, addQuantities(reserved, line.quantity));
  }

  salesOrders[index] = { ...order, status: 'CONFIRMED' };
  auditMutation({ action: 'SALES_ORDER_CONFIRMED', actionLabel: 'Sales order confirmed', recordType: 'Sales order', recordId: order.id, recordNumber: order.number, summary: `Sales order ${order.number} was confirmed.`, changes: [{ field: 'Status', before: 'DRAFT', after: 'CONFIRMED' }] });
  const result: SalesOrderActionResult = { number: order.number, status: 'CONFIRMED' };
  postedSalesConfirmations.set(input.idempotencyKey, result);
  return result;
}

async function cancelSalesOrder(id: string): Promise<SalesOrderActionResult> {
  await beforeCall('cancelSalesOrder', id);

  const index = salesOrders.findIndex((order) => order.id === id);
  if (index === -1) {
    throw new SampleServiceFailure(notFound(nextRequestId()));
  }

  const order = salesOrders[index];
  if (order.status === 'CANCELLED') {
    throw new SampleServiceFailure(
      buildFailureWithCode(
        ERROR_CODES.INVALID_STATE_TRANSITION,
        nextRequestId(),
        'This sales order is already cancelled.',
      ),
    );
  }

  if (order.status === 'SHIPPED') {
    throw new SampleServiceFailure(
      buildFailureWithCode(
        ERROR_CODES.INVALID_STATE_TRANSITION,
        nextRequestId(),
        'A shipped order cannot be cancelled.',
      ),
    );
  }

  // Cancelling a confirmed order releases its reservations: available rises
  // again, on hand does not change.
  if (order.status === 'CONFIRMED') {
    for (const line of order.lines) {
      const key = `${line.productId}|${order.warehouseId}`;
      const reserved = reservations.get(key) ?? '0.000';
      reservations.set(key, subtractQuantities(reserved, line.quantity));
    }
  }

  salesOrders[index] = { ...order, status: 'CANCELLED' };
  auditMutation({ action: 'SALES_ORDER_CANCELLED', actionLabel: 'Sales order cancelled', recordType: 'Sales order', recordId: order.id, recordNumber: order.number, summary: `Sales order ${order.number} was cancelled.`, changes: [{ field: 'Status', before: order.status, after: 'CANCELLED' }] });
  return { number: order.number, status: 'CANCELLED' };
}

async function shipSalesOrder(input: ShipSalesOrderInput): Promise<ShipSalesOrderResult> {
  await beforeCall('shipSalesOrder', input.orderId);

  // Idempotency: return the original result if this key was already posted, so
  // a double click or a retried request ships once, never twice.
  const existing = postedShipments.get(input.idempotencyKey);
  if (existing !== undefined) {
    return existing;
  }

  const index = salesOrders.findIndex((order) => order.id === input.orderId);
  if (index === -1) {
    throw new SampleServiceFailure(notFound(nextRequestId()));
  }

  const order = salesOrders[index];
  if (order.status !== 'CONFIRMED') {
    throw new SampleServiceFailure(
      buildFailureWithCode(
        ERROR_CODES.INVALID_STATE_TRANSITION,
        nextRequestId(),
        'Only confirmed sales orders can be shipped.',
      ),
    );
  }

  // One shipment ships the whole order: one document, one SH number, one
  // movement per line.
  const number = nextSource('SHIPMENT');
  const customer = contacts.find((contact) => contact.id === order.customerId);
  const warehouse = warehouses.find((w) => w.id === order.warehouseId);
  const now = new Date().toISOString();

  const shipmentLines: Shipment['lines'][number][] = [];
  for (const line of order.lines) {
    shipmentLines.push({
      productId: line.productId,
      productSku: line.productSku,
      productName: line.productName,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
    });

    movements.push({
      id: `movement-${String(movements.length + 1).padStart(4, '0')}`,
      source: number,
      type: 'SHIPMENT',
      productId: line.productId,
      productSku: line.productSku,
      productName: line.productName,
      warehouseId: order.warehouseId,
      warehouseName: warehouse?.name ?? order.warehouseName,
      quantity: subtractQuantities('0.000', line.quantity),
      reason: `Shipped to customer ${customer?.code ?? order.customerName}`,
      user: 'Preview user',
      createdAt: now,
    });

    // Shipping consumes the reservation the confirmation created: on hand and
    // reserved both drop by the shipped quantity.
    const key = `${line.productId}|${order.warehouseId}`;
    const reserved = reservations.get(key) ?? '0.000';
    reservations.set(key, subtractQuantities(reserved, line.quantity));
  }

  const shipment: Shipment = {
    id: `shipment-${String(shipments.length + 1).padStart(4, '0')}`,
    number,
    orderId: order.id,
    orderNumber: order.number,
    customerId: order.customerId,
    customerName: customer?.name ?? order.customerName,
    warehouseId: order.warehouseId,
    warehouseName: warehouse?.name ?? order.warehouseName,
    shipmentDate: now,
    lines: shipmentLines,
    user: 'Preview user',
  };
  shipments.push(shipment);

  salesOrders[index] = { ...order, status: 'SHIPPED' };
  auditMutation({ action: 'SHIPMENT_POSTED', actionLabel: 'Shipment posted', recordType: 'Shipment', recordId: order.id, recordNumber: number, summary: `Sales order ${order.number} was shipped.`, changes: [{ field: 'Status', before: 'CONFIRMED', after: 'SHIPPED' }] });
  const result: ShipSalesOrderResult = {
    number: order.number,
    status: 'SHIPPED',
    shipmentNumber: number,
  };
  postedShipments.set(input.idempotencyKey, result);
  return result;
}

async function listShipments(query: ShipmentQuery): Promise<ShipmentPage> {
  await beforeCall('listShipments', `page ${query.page} size ${query.pageSize}`);

  let filtered = shipments;

  if (query.search) {
    const term = query.search.toLowerCase();
    filtered = filtered.filter(
      (shipment) =>
        shipment.number.toLowerCase().includes(term) ||
        shipment.orderNumber.toLowerCase().includes(term) ||
        shipment.customerName.toLowerCase().includes(term) ||
        shipment.lines.some((line) => line.productSku.toLowerCase().includes(term) || line.productName.toLowerCase().includes(term)),
    );
  }

  if (query.startDate) {
    // Date-only filter: compare the calendar day, so a shipment on the end
    // date is inside a range the picker includes (shipmentDate is an ISO timestamp).
    filtered = filtered.filter((shipment) => shipment.shipmentDate.slice(0, 10) >= query.startDate!);
  }

  if (query.endDate) {
    filtered = filtered.filter((shipment) => shipment.shipmentDate.slice(0, 10) <= query.endDate!);
  }

  const sign = query.direction === 'desc' ? -1 : 1;
  const sort = query.sort;
  if (sort) {
    filtered = [...filtered].sort((a, b) => {
      const av = a[sort as keyof Shipment];
      const bv = b[sort as keyof Shipment];
      if (typeof av === 'string' && typeof bv === 'string') {
        // Document numbers and dates compare lexically (zero-padded and ISO).
        return av.localeCompare(bv, undefined, { sensitivity: 'base' }) * sign;
      }
      return 0;
    });
  }

  const start = Math.max(0, (query.page - 1) * query.pageSize);

  return {
    items: filtered.slice(start, start + query.pageSize),
    total: filtered.length,
  };
}

// --- Invoicing and payments -------------------------------------------------
const today = () => new Date().toISOString().slice(0, 10);
function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function invoiceActiveAllocations(invoiceId: string) {
  return payments.filter((payment) => payment.status !== 'REVERSED').flatMap((payment) =>
    payment.allocations.filter((allocation) => allocation.invoiceId === invoiceId).map((allocation) => ({ payment, allocation })),
  );
}
function invoiceBalance(invoiceId: string): string {
  const invoice = invoices.find((entry) => entry.id === invoiceId);
  if (!invoice) return '0.00';
  const paid = invoiceActiveAllocations(invoiceId).reduce((sum, row) => sum + toCents(row.allocation.amount), 0n);
  return centsToString(toCents(invoice.total) - paid);
}
function invoicePaid(invoiceId: string): string {
  return centsToString(invoiceActiveAllocations(invoiceId).reduce((sum, row) => sum + toCents(row.allocation.amount), 0n));
}
function invoiceView(invoice: Invoice): Invoice {
  const applied: InvoiceAllocation[] = payments.flatMap((payment) => payment.allocations
    .filter((allocation) => allocation.invoiceId === invoice.id)
    .map((allocation) => ({ paymentId: payment.id, paymentNumber: payment.number, paymentDate: payment.date, amount: allocation.amount, paymentStatus: payment.status })))
    .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  const paid = invoicePaid(invoice.id);
  const balance = centsToString(toCents(invoice.total) - toCents(paid));
  const activePayments = invoiceActiveAllocations(invoice.id).length > 0;
  const status: InvoiceStatus = invoice.status === 'VOID' || invoice.status === 'DRAFT' ? invoice.status
    : toCents(balance) <= 0n ? 'PAID' : activePayments ? 'PARTIALLY_PAID' : 'ISSUED';
  return { ...invoice, paid, balance, status, paymentsApplied: applied };
}
function activeInvoice(id: string): Invoice | undefined { const invoice = invoices.find((entry) => entry.id === id); return invoice ? invoiceView(invoice) : undefined; }
function fail(code: ErrorCode, message: string): SampleServiceFailure { return new SampleServiceFailure(buildFailureWithCode(code, nextRequestId(), message)); }
function compareInvoiceValue(a: Invoice, b: Invoice, sort: string, sign: number): number {
  const key = sort as keyof Invoice;
  const av = a[key]; const bv = b[key];
  if (['total', 'paid', 'balance'].includes(sort)) return compareDecimal(String(av), String(bv), 2) * sign;
  return String(av ?? '').localeCompare(String(bv ?? ''), undefined, { sensitivity: 'base' }) * sign;
}
async function listInvoices(query: InvoiceQuery): Promise<InvoicePage> {
  await beforeCall('listInvoices', `page ${query.page} size ${query.pageSize}`);
  let values = controls.simulateEmptyData ? [] : invoices.map(invoiceView);
  if (query.search) { const term = query.search.toLowerCase(); values = values.filter((v) => (v.number ?? '').toLowerCase().includes(term) || v.customerName.toLowerCase().includes(term)); }
  if (query.status) values = values.filter((v) => v.status === query.status);
  if (query.overdueOnly) values = values.filter((v) => v.dueDate < today() && toCents(v.balance) > 0n && v.status !== 'VOID' && v.status !== 'DRAFT');
  if (query.sort) values.sort((a, b) => compareInvoiceValue(a, b, query.sort!, query.direction === 'desc' ? -1 : 1));
  const start = Math.max(0, (query.page - 1) * query.pageSize);
  return { items: values.slice(start, start + query.pageSize), total: values.length };
}
async function getInvoice(id: string): Promise<Invoice> { await beforeCall('getInvoice', id); const value = activeInvoice(id); if (!value) throw new SampleServiceFailure(notFound(nextRequestId())); return value; }
async function listInvoicableOrders(): Promise<InvoicableOrder[]> {
  await beforeCall('listInvoicableOrders', '');
  return salesOrders.filter((order) => order.status === 'SHIPPED' && !invoices.some((invoice) => invoice.orderId === order.id && invoice.status !== 'VOID'))
    .map((order) => ({ orderId: order.id, orderNumber: order.number, customerId: order.customerId, customerName: order.customerName, total: buildSalesOrderView(order).total }));
}
async function createInvoiceFromOrder(input: CreateInvoiceFromOrderInput): Promise<CreateInvoiceFromOrderResult> {
  await beforeCall('createInvoiceFromOrder', input.orderId);
  const retry = postedInvoiceCreations.get(input.idempotencyKey); if (retry) return retry;
  const order = salesOrders.find((entry) => entry.id === input.orderId);
  if (!order || order.status !== 'SHIPPED' || invoices.some((entry) => entry.orderId === order.id && entry.status !== 'VOID')) throw fail(ERROR_CODES.CONFLICT, 'Only shipped orders without an active invoice can be invoiced.');
  const customer = contacts.find((entry) => entry.id === order.customerId);
  const source = buildSalesOrderView(order);
  const date = today(); const settings = organization;
  const id = `inv-${String(invoices.length + 1).padStart(4, '0')}`;
  const lines: InvoiceLine[] = source.lines.map((line) => ({ id: `${id}-${line.id}`, productId: line.productId, productSku: line.productSku, productName: line.productName, quantity: line.quantity, unitPrice: line.unitPrice, lineTotal: line.lineTotal }));
  const invoice: Invoice = { id, number: null, orderId: order.id, orderNumber: order.number, customerId: order.customerId, customerName: customer?.name ?? order.customerName, customerAddress: customer?.address ?? '', warehouseName: order.warehouseName, status: 'DRAFT', issueDate: null, dueDate: addDays(date, settings.defaultPaymentTermDays), lines, total: source.total, paid: '0.00', balance: source.total, paymentsApplied: [], voidedDate: null, voidReason: null };
  invoices.push(invoice); const result = { id, status: 'DRAFT' as const, dueDate: invoice.dueDate }; postedInvoiceCreations.set(input.idempotencyKey, result); return result;
}
async function updateInvoiceDueDate(input: UpdateInvoiceDueDateInput): Promise<{ dueDate: string }> {
  await beforeCall('updateInvoiceDueDate', input.id); const idx = invoices.findIndex((entry) => entry.id === input.id); if (idx < 0) throw new SampleServiceFailure(notFound(nextRequestId()));
  const invoice = invoices[idx]; if (invoice.status !== 'DRAFT') throw fail(ERROR_CODES.INVALID_STATE_TRANSITION, 'Only draft invoices can be edited.');
  if (input.dueDate < today() || (invoice.issueDate && input.dueDate < invoice.issueDate)) throw fail(ERROR_CODES.VALIDATION_FAILED, 'Due date cannot be before today or the issue date.');
  invoices[idx] = { ...invoice, dueDate: input.dueDate }; editedInvoiceDueDates.add(input.id); return { dueDate: input.dueDate };
}
async function issueInvoice(input: IssueInvoiceInput): Promise<IssueInvoiceResult> {
  await beforeCall('issueInvoice', input.id); const retry = postedInvoiceIssues.get(input.idempotencyKey); if (retry) return retry;
  const idx = invoices.findIndex((entry) => entry.id === input.id); if (idx < 0) throw new SampleServiceFailure(notFound(nextRequestId()));
  const invoice = invoices[idx]; if (invoice.status !== 'DRAFT') throw fail(ERROR_CODES.INVALID_STATE_TRANSITION, 'Only draft invoices can be issued.');
  invoiceSequence += 1; const number = `INV-${String(invoiceSequence).padStart(6, '0')}`; const date = today();
  invoices[idx] = { ...invoice, number, status: 'ISSUED', issueDate: date, dueDate: editedInvoiceDueDates.has(invoice.id) ? invoice.dueDate : addDays(date, organization.defaultPaymentTermDays) };
  auditMutation({ action: 'INVOICE_ISSUED', actionLabel: 'Invoice issued', recordType: 'Invoice', recordId: invoice.id, recordNumber: number, summary: `Invoice ${number} was issued.`, changes: [{ field: 'Status', before: 'DRAFT', after: 'ISSUED' }, { field: 'Due date', before: invoice.dueDate, after: invoices[idx].dueDate }] });
  const result = { number, dueDate: invoices[idx].dueDate }; postedInvoiceIssues.set(input.idempotencyKey, result); return result;
}
async function voidInvoice(input: VoidInvoiceInput): Promise<VoidInvoiceResult> {
  await beforeCall('voidInvoice', input.id); const retry = postedInvoiceVoids.get(input.idempotencyKey); if (retry) return retry;
  const idx = invoices.findIndex((entry) => entry.id === input.id); if (idx < 0) throw new SampleServiceFailure(notFound(nextRequestId()));
  const invoice = invoices[idx]; if (!['DRAFT', 'ISSUED'].includes(invoice.status)) throw fail(ERROR_CODES.INVALID_STATE_TRANSITION, 'Only draft or unpaid issued invoices can be voided.');
  if (invoiceActiveAllocations(invoice.id).length > 0) throw fail(ERROR_CODES.CONFLICT, 'This invoice has payments applied. Reverse the payments first');
  if (!input.reason.trim()) throw fail(ERROR_CODES.VALIDATION_FAILED, 'A reason is required.');
  invoices[idx] = { ...invoice, status: 'VOID', voidedDate: today(), voidReason: input.reason.trim() };
  auditMutation({ action: 'INVOICE_VOIDED', actionLabel: 'Invoice voided', recordType: 'Invoice', recordId: invoice.id, recordNumber: invoice.number ?? invoice.orderNumber, summary: `${invoice.number ?? 'Draft invoice'} was voided.`, changes: [{ field: 'Status', before: invoice.status, after: 'VOID' }, { field: 'Reason', before: '—', after: input.reason.trim() }] });
  const result: VoidInvoiceResult = { number: invoice.number, status: 'VOID' }; postedInvoiceVoids.set(input.idempotencyKey, result); return result;
}
async function listPayments(query: PaymentQuery): Promise<PaymentPage> {
  await beforeCall('listPayments', `page ${query.page} size ${query.pageSize}`); let values = controls.simulateEmptyData ? [] : [...payments];
  if (query.search) { const term = query.search.toLowerCase(); values = values.filter((p) => p.number.toLowerCase().includes(term) || p.customerName.toLowerCase().includes(term)); }
  if (query.status) values = values.filter((p) => p.status === query.status);
  if (query.startDate) values = values.filter((p) => p.date >= query.startDate!);
  if (query.endDate) values = values.filter((p) => p.date <= query.endDate!);
  if (query.sort) { const sign = query.direction === 'desc' ? -1 : 1; const key = query.sort as keyof Payment; values.sort((a, b) => key === 'amount' ? compareDecimal(a.amount, b.amount, 2) * sign : key === 'allocations' ? (a.allocations.length - b.allocations.length) * sign : String(a[key] ?? '').localeCompare(String(b[key] ?? ''), undefined, { sensitivity: 'base' }) * sign); }
  const start = Math.max(0, (query.page - 1) * query.pageSize); return { items: values.slice(start, start + query.pageSize), total: values.length };
}
async function getPayment(id: string): Promise<Payment> { await beforeCall('getPayment', id); const value = payments.find((p) => p.id === id); if (!value) throw new SampleServiceFailure(notFound(nextRequestId())); return value; }
async function listOpenInvoicesForCustomer(customerId: string): Promise<OpenInvoice[]> {
  await beforeCall('listOpenInvoicesForCustomer', customerId); return invoices.map(invoiceView).filter((i) => i.customerId === customerId && ['ISSUED', 'PARTIALLY_PAID'].includes(i.status) && toCents(i.balance) > 0n).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || (a.issueDate ?? '').localeCompare(b.issueDate ?? '')).map((i) => ({ id: i.id, number: i.number, issueDate: i.issueDate ?? '', dueDate: i.dueDate, total: i.total, paid: i.paid, balance: i.balance, status: i.status }));
}
async function listOpenInvoiceCustomers(): Promise<OpenInvoiceCustomer[]> {
  await beforeCall('listOpenInvoiceCustomers', ''); const ids = new Set(invoices.map(invoiceView).filter((i) => ['ISSUED', 'PARTIALLY_PAID'].includes(i.status) && toCents(i.balance) > 0n).map((i) => i.customerId)); return contacts.filter((c) => ids.has(c.id)).map((c) => ({ customerId: c.id, customerName: c.name }));
}
async function recordPayment(input: RecordPaymentInput): Promise<RecordPaymentResult> {
  await beforeCall('recordPayment', input.idempotencyKey); const retry = postedPayments.get(input.idempotencyKey); if (retry) return retry;
  if (!/^\d+(\.\d{1,2})?$/.test(input.amount) || toCents(input.amount) <= 0n || input.allocations.length === 0) throw fail(ERROR_CODES.VALIDATION_FAILED, 'A payment amount and at least one allocation are required.');
  const allocationSum = input.allocations.reduce((sum, row) => sum + toCents(row.amount), 0n); if (allocationSum !== toCents(input.amount)) throw fail(ERROR_CODES.VALIDATION_FAILED, 'Allocations must equal the payment amount');
  const open = awaitOpenInvoices(input.customerId); const openTotal = open.reduce((sum, i) => sum + toCents(i.balance), 0n); if (toCents(input.amount) > openTotal) throw fail(ERROR_CODES.VALIDATION_FAILED, 'Payment exceeds the open balance; overpayments are not accepted');
  const resolved: PaymentAllocation[] = [];
  const byInvoice = new Map<string, bigint>();
  for (const row of input.allocations) {
    const invoice = activeInvoice(row.invoiceId);
    if (!invoice || invoice.customerId !== input.customerId || !['ISSUED', 'PARTIALLY_PAID'].includes(invoice.status)) throw fail(ERROR_CODES.CONFLICT, `Invoice ${invoice?.number ?? row.invoiceId} balance is now ${invoice?.balance ?? '0.00'}. Refresh and try again.`);
    if (row.expectedBalance !== undefined && toCents(row.expectedBalance) !== toCents(invoice.balance)) throw fail(ERROR_CODES.CONFLICT, `Invoice ${invoice.number} balance is now ${invoice.balance}. Refresh and try again.`);
    if (!/^\d+(\.\d{1,2})?$/.test(row.amount) || toCents(row.amount) <= 0n) throw fail(ERROR_CODES.VALIDATION_FAILED, `Allocated amount exceeds the invoice balance of ${invoice.balance}`);
    byInvoice.set(row.invoiceId, (byInvoice.get(row.invoiceId) ?? 0n) + toCents(row.amount));
    if (byInvoice.get(row.invoiceId)! > toCents(invoice.balance)) throw fail(ERROR_CODES.VALIDATION_FAILED, `Allocated amount exceeds the invoice balance of ${invoice.balance}`);
    resolved.push({ invoiceId: invoice.id, invoiceNumber: invoice.number, amount: centsToString(toCents(row.amount)) });
  }
  paySequence += 1; const customer = contacts.find((c) => c.id === input.customerId); const id = `pay-${String(payments.length + 1).padStart(4, '0')}`; const payment: Payment = { id, number: `PAY-${String(paySequence).padStart(6, '0')}`, customerId: input.customerId, customerName: customer?.name ?? '', date: input.date, method: input.method, reference: input.reference, amount: centsToString(toCents(input.amount)), status: 'RECORDED', allocations: resolved, reversedDate: null, reversalReason: null }; payments.push(payment); const result = { id, number: payment.number }; postedPayments.set(input.idempotencyKey, result);
  auditMutation({ action: 'PAYMENT_RECORDED', actionLabel: 'Payment recorded', recordType: 'Payment', recordId: payment.id, recordNumber: payment.number, summary: `Payment ${payment.number} was recorded.`, changes: [{ field: 'Status', before: '—', after: 'RECORDED' }, { field: 'Amount', before: '—', after: payment.amount }, { field: 'Allocation count', before: '—', after: String(payment.allocations.length) }] });
  return result;
}
function awaitOpenInvoices(customerId: string): OpenInvoice[] { return invoices.map(invoiceView).filter((i) => i.customerId === customerId && ['ISSUED', 'PARTIALLY_PAID'].includes(i.status) && toCents(i.balance) > 0n).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || (a.issueDate ?? '').localeCompare(b.issueDate ?? '')).map((i) => ({ id: i.id, number: i.number, issueDate: i.issueDate ?? '', dueDate: i.dueDate, total: i.total, paid: i.paid, balance: i.balance, status: i.status })); }
async function reversePayment(input: ReversePaymentInput): Promise<ReversePaymentResult> {
  await beforeCall('reversePayment', input.paymentId); const retry = postedReversals.get(input.idempotencyKey); if (retry) return retry; const idx = payments.findIndex((p) => p.id === input.paymentId); if (idx < 0) throw new SampleServiceFailure(notFound(nextRequestId())); const payment = payments[idx]; if (payment.status === 'REVERSED') throw fail(ERROR_CODES.INVALID_STATE_TRANSITION, 'This payment has already been reversed.'); if (!input.reason.trim()) throw fail(ERROR_CODES.VALIDATION_FAILED, 'A reason is required.'); payments[idx] = { ...payment, status: 'REVERSED', reversedDate: today(), reversalReason: input.reason.trim() }; auditMutation({ action: 'PAYMENT_REVERSED', actionLabel: 'Payment reversed', recordType: 'Payment', recordId: payment.id, recordNumber: payment.number, summary: `Payment ${payment.number} was reversed.`, changes: [{ field: 'Status', before: 'RECORDED', after: 'REVERSED' }, { field: 'Reason', before: '—', after: input.reason.trim() }] }); const result = { number: payment.number, status: 'REVERSED' as const }; postedReversals.set(input.idempotencyKey, result); return result;
}
async function getOrganizationSettings(): Promise<OrganizationSettings> { await beforeCall('getOrganizationSettings', ''); return { currency: organization.currency, defaultPaymentTermDays: organization.defaultPaymentTermDays }; }

async function getOrganization(): Promise<Organization> {
  await beforeCall('getOrganization', organization.id);
  return { ...organization, currencyLocked: canChangeCurrency() };
}
async function updateOrganizationSettings(input: UpdateOrganizationSettingsInput): Promise<Organization> {
  await beforeCall('updateOrganizationSettings', 'organization settings');
  if (!input.name.trim()) throw fail(ERROR_CODES.VALIDATION_FAILED, 'Organization name is required.');
  if (!Number.isInteger(input.defaultPaymentTermDays) || input.defaultPaymentTermDays < 0 || input.defaultPaymentTermDays > 365) throw fail(ERROR_CODES.VALIDATION_FAILED, 'Payment terms must be a whole number from 0 to 365.');
  if (!/^[A-Z]{3}$/.test(input.currency)) throw fail(ERROR_CODES.VALIDATION_FAILED, 'Choose a valid ISO 4217 currency code.');
  if (canChangeCurrency() && input.currency !== organization.currency) throw fail(ERROR_CODES.CONFLICT, 'Currency is locked once orders or invoices exist.');
  const previous = organization;
  organization = { ...organization, name: input.name.trim(), currency: input.currency, defaultPaymentTermDays: input.defaultPaymentTermDays, currencyLocked: canChangeCurrency() };
  const changes = [
    ...(previous.name !== organization.name ? [{ field: 'Name', before: previous.name, after: organization.name }] : []),
    ...(previous.currency !== organization.currency ? [{ field: 'Currency', before: previous.currency, after: organization.currency }] : []),
    ...(previous.defaultPaymentTermDays !== organization.defaultPaymentTermDays ? [{ field: 'Default payment terms', before: String(previous.defaultPaymentTermDays), after: String(organization.defaultPaymentTermDays) }] : []),
  ];
  if (changes.length) auditMutation({ action: 'ORGANIZATION_SETTINGS_CHANGED', actionLabel: 'Organization settings changed', recordType: 'Organization', recordId: organization.id, recordNumber: organization.name, summary: 'Organization settings were saved.', changes });
  return { ...organization, currencyLocked: canChangeCurrency() };
}
async function listModules(): Promise<readonly ModuleSetting[]> { await beforeCall('listModules', ''); return modules.map((entry) => ({ ...entry })); }
async function toggleModule(input: ToggleModuleInput): Promise<ModuleSetting> {
  await beforeCall('toggleModule', input.key);
  const module = modules.find((entry) => entry.key === input.key);
  if (!module) throw new SampleServiceFailure(notFound(nextRequestId()));
  if (module.locked) throw fail(ERROR_CODES.CONFLICT, `${module.label} is a core module and cannot be turned off.`);
  if (module.enabled === input.enabled) return { ...module };
  const dependencies: Partial<Record<ModuleKey, ModuleKey[]>> = { inventory: ['sales', 'purchasing'], sales: ['invoicing'] };
  if (!input.enabled) {
    const dependent = (dependencies[input.key] ?? []).find((key) => modules.find((entry) => entry.key === key)?.enabled);
    if (dependent) { const dependentLabel = modules.find((entry) => entry.key === dependent)!.label; throw fail(ERROR_CODES.CONFLICT, `${dependentLabel} needs ${module.label}. Turn ${dependentLabel} off first.`); }
    const open = hasOpenWork(input.key);
    if (open) throw fail(ERROR_CODES.CONFLICT, open);
  } else {
    const required = input.key === 'sales' || input.key === 'purchasing' ? 'inventory' : input.key === 'invoicing' ? 'sales' : null;
    if (required && !modules.find((entry) => entry.key === required)?.enabled) { const requiredLabel = modules.find((entry) => entry.key === required)!.label; throw fail(ERROR_CODES.CONFLICT, `${module.label} needs ${requiredLabel}. Turn ${requiredLabel} on first.`); }
  }
  const index = modules.findIndex((entry) => entry.key === input.key); modules[index] = { ...module, enabled: input.enabled };
  auditMutation({ action: 'MODULE_TOGGLED', actionLabel: 'Module setting changed', recordType: 'Module', recordId: module.key, recordNumber: module.label, summary: `${module.label} was turned ${input.enabled ? 'on' : 'off'}.`, changes: [{ field: 'Enabled', before: module.enabled ? 'On' : 'Off', after: input.enabled ? 'On' : 'Off' }] });
  return { ...modules[index] };
}
async function listUsers(query: UserQuery): Promise<UserPage> {
  await beforeCall('listUsers', `page ${query.page} size ${query.pageSize}`); let values = [...users];
  if (query.search) { const term = query.search.toLowerCase(); values = values.filter((user) => user.name.toLowerCase().includes(term) || user.email.toLowerCase().includes(term)); }
  if (query.roleId) values = values.filter((user) => user.roleIds.includes(query.roleId!));
  if (query.status) values = values.filter((user) => user.status === query.status);
  if (query.sort) { const sign = query.direction === 'desc' ? -1 : 1; const key = query.sort as keyof SampleUser; values.sort((a, b) => String(a[key] ?? '').localeCompare(String(b[key] ?? ''), undefined, { sensitivity: 'base' }) * sign); }
  const start = Math.max(0, (query.page - 1) * query.pageSize); return { items: values.slice(start, start + query.pageSize).map((user) => ({ ...user, roleIds: [...user.roleIds] })), total: values.length };
}
async function getUser(id: string): Promise<SampleUser> { await beforeCall('getUser', id); const user = users.find((entry) => entry.id === id); if (!user) throw new SampleServiceFailure(notFound(nextRequestId())); return { ...user, roleIds: [...user.roleIds] }; }
async function createUser(input: CreateUserInput): Promise<{ id: string; name: string }> {
  await beforeCall('createUser', input.name);
  const email = input.email.trim(); const existing = users.find((user) => user.email.toLowerCase() === email.toLowerCase());
  if (existing) throw fail(ERROR_CODES.DUPLICATE_RECORD, `Email already belongs to ${existing.name}.`);
  if (!email.includes('@') || input.name.trim() === '' || input.initialPassword.length < 12 || input.roleIds.length === 0) throw fail(ERROR_CODES.VALIDATION_FAILED, 'Name, a valid email, a 12-character initial password and at least one role are required.');
  if (input.roleIds.some((roleId) => !roles.some((role) => role.id === roleId))) throw new SampleServiceFailure(notFound(nextRequestId()));
  const id = `user-${String(users.length + 1).padStart(4, '0')}`; const user: SampleUser = { id, name: input.name.trim(), email, roleIds: [...new Set(input.roleIds)], status: 'USER_ACTIVE', passwordChangeRequired: true, createdAt: new Date().toISOString() }; users.push(user);
  auditMutation({ action: 'USER_CREATED', actionLabel: 'User created', recordType: 'User', recordId: id, recordNumber: email, summary: `${user.name} was added.`, changes: [{ field: 'Status', before: '—', after: 'USER_ACTIVE' }, { field: 'Password change required', before: '—', after: 'Yes' }] });
  return { id, name: user.name };
}
async function updateUserRoles(input: UpdateUserRolesInput): Promise<{ name: string; permissionCount: number }> {
  await beforeCall('updateUserRoles', input.id); const index = users.findIndex((user) => user.id === input.id); if (index < 0) throw new SampleServiceFailure(notFound(nextRequestId()));
  if (input.roleIds.length === 0 || input.roleIds.some((roleId) => !roles.some((role) => role.id === roleId))) throw fail(ERROR_CODES.VALIDATION_FAILED, 'Assign at least one valid role.');
  const user = users[index]; const adminId = 'role-administrator'; const hadAdmin = user.roleIds.includes(adminId); const willHaveAdmin = input.roleIds.includes(adminId);
  if (user.status === 'USER_ACTIVE' && hadAdmin && !willHaveAdmin && users.filter((entry) => entry.status === 'USER_ACTIVE' && entry.roleIds.includes(adminId)).length <= 1) throw fail(ERROR_CODES.CONFLICT, 'At least one active Administrator is required');
  const previousRoles = user.roleIds.map((id) => roles.find((role) => role.id === id)?.name ?? id).join(', '); users[index] = { ...user, roleIds: [...new Set(input.roleIds)] };
  const newRoles = users[index].roleIds.map((id) => roles.find((role) => role.id === id)?.name ?? id).join(', ');
  auditMutation({ action: 'USER_ROLES_CHANGED', actionLabel: 'User roles changed', recordType: 'User', recordId: user.id, recordNumber: user.email, summary: `${user.name} role assignments were changed.`, changes: [{ field: 'Roles', before: previousRoles, after: newRoles }] });
  return { name: user.name, permissionCount: getRolePermissions(users[index].roleIds).length };
}
async function deactivateUser(id: string): Promise<{ name: string }> {
  await beforeCall('deactivateUser', id); const index = users.findIndex((user) => user.id === id); if (index < 0) throw new SampleServiceFailure(notFound(nextRequestId())); const user = users[index];
  if (user.status === 'USER_DEACTIVATED') return { name: user.name };
  if (user.roleIds.includes('role-administrator') && users.filter((entry) => entry.status === 'USER_ACTIVE' && entry.roleIds.includes('role-administrator')).length <= 1) throw fail(ERROR_CODES.CONFLICT, 'At least one active Administrator is required');
  users[index] = { ...user, status: 'USER_DEACTIVATED' }; auditMutation({ action: 'USER_DEACTIVATED', actionLabel: 'User deactivated', recordType: 'User', recordId: user.id, recordNumber: user.email, summary: `${user.name} was deactivated.`, changes: [{ field: 'Status', before: 'USER_ACTIVE', after: 'USER_DEACTIVATED' }] }); return { name: user.name };
}
async function reactivateUser(id: string): Promise<{ name: string }> { await beforeCall('reactivateUser', id); const index = users.findIndex((user) => user.id === id); if (index < 0) throw new SampleServiceFailure(notFound(nextRequestId())); const user = users[index]; users[index] = { ...user, status: 'USER_ACTIVE' }; auditMutation({ action: 'USER_REACTIVATED', actionLabel: 'User reactivated', recordType: 'User', recordId: user.id, recordNumber: user.email, summary: `${user.name} was reactivated.`, changes: [{ field: 'Status', before: 'USER_DEACTIVATED', after: 'USER_ACTIVE' }] }); return { name: user.name }; }
async function listRoles(): Promise<readonly SampleRole[]> { await beforeCall('listRoles', ''); return roles.map((role) => ({ ...role, permissions: [...role.permissions] })); }
async function getRole(id: string): Promise<SampleRole> { await beforeCall('getRole', id); const role = roles.find((entry) => entry.id === id); if (!role) throw new SampleServiceFailure(notFound(nextRequestId())); return { ...role, permissions: [...role.permissions] }; }
async function createRole(input: CreateRoleInput): Promise<{ id: string; name: string }> { await beforeCall('createRole', input.name); const name = input.name.trim(); if (!name) throw fail(ERROR_CODES.VALIDATION_FAILED, 'Role name is required.'); if (roles.some((role) => role.name.toLowerCase() === name.toLowerCase())) throw fail(ERROR_CODES.DUPLICATE_RECORD, `A role named ${name} already exists.`); if (input.permissions.some((code) => !PERMISSION_CATALOG.some((entry) => entry.code === code))) throw fail(ERROR_CODES.VALIDATION_FAILED, 'Choose valid permissions.'); const id = `role-custom-${roles.filter((role) => !role.system).length + 1}`; const role: SampleRole = { id, name, description: 'Custom organization role.', permissions: [...new Set(input.permissions)], system: false }; roles.push(role); auditMutation({ action: 'ROLE_CREATED', actionLabel: 'Role created', recordType: 'Role', recordId: id, recordNumber: name, summary: `Role ${name} was created.`, changes: [{ field: 'Type', before: '—', after: 'Custom' }, { field: 'Permissions', before: '—', after: String(role.permissions.length) }] }); return { id, name }; }
async function updateRolePermissions(input: UpdateRolePermissionsInput): Promise<{ name: string }> { await beforeCall('updateRolePermissions', input.id); const index = roles.findIndex((role) => role.id === input.id); if (index < 0) throw new SampleServiceFailure(notFound(nextRequestId())); const role = roles[index]; if (role.system) throw fail(ERROR_CODES.INVALID_STATE_TRANSITION, 'System roles cannot be edited.'); if (input.permissions.some((code) => !PERMISSION_CATALOG.some((entry) => entry.code === code))) throw fail(ERROR_CODES.VALIDATION_FAILED, 'Choose valid permissions.'); roles[index] = { ...role, permissions: [...new Set(input.permissions)] }; auditMutation({ action: 'ROLE_PERMISSIONS_CHANGED', actionLabel: 'Role permissions changed', recordType: 'Role', recordId: role.id, recordNumber: role.name, summary: `Permissions for ${role.name} were changed.`, changes: [{ field: 'Permission count', before: String(role.permissions.length), after: String(roles[index].permissions.length) }] }); return { name: role.name }; }
async function deleteRole(id: string): Promise<{ name: string }> { await beforeCall('deleteRole', id); const index = roles.findIndex((role) => role.id === id); if (index < 0) throw new SampleServiceFailure(notFound(nextRequestId())); const role = roles[index]; if (role.system) throw fail(ERROR_CODES.INVALID_STATE_TRANSITION, 'System roles cannot be deleted.'); const members = users.filter((user) => user.roleIds.includes(id)).length; if (members) throw fail(ERROR_CODES.CONFLICT, `This role is assigned to ${members} users`); roles.splice(index, 1); auditMutation({ action: 'ROLE_DELETED', actionLabel: 'Role deleted', recordType: 'Role', recordId: role.id, recordNumber: role.name, summary: `Role ${role.name} was deleted.`, changes: [{ field: 'Status', before: 'Custom', after: 'Deleted' }] }); return { name: role.name }; }
async function listPermissions(): Promise<readonly PermissionGroup[]> { await beforeCall('listPermissions', ''); const grouped = new Map<string, { module: PermissionGroup['module']; label: string; permissions: { code: string; description: string }[] }>(); for (const permission of PERMISSION_CATALOG) { const label = permission.module[0].toUpperCase() + permission.module.slice(1); const group = grouped.get(permission.module) ?? { module: permission.module, label, permissions: [] }; group.permissions.push({ code: permission.code, description: permission.description }); grouped.set(permission.module, group); } return [...grouped.values()]; }
async function listAuditEntries(query: AuditQuery): Promise<AuditPage> { await beforeCall('listAuditEntries', `page ${query.page} size ${query.pageSize}`); let entries = [...auditEntries]; if (query.startDate) entries = entries.filter((entry) => entry.time.slice(0, 10) >= query.startDate!); if (query.endDate) entries = entries.filter((entry) => entry.time.slice(0, 10) <= query.endDate!); if (query.userId) entries = entries.filter((entry) => entry.userId === query.userId); if (query.action) entries = entries.filter((entry) => entry.action === query.action); if (query.recordType) entries = entries.filter((entry) => entry.recordType === query.recordType); if (query.search) entries = entries.filter((entry) => entry.recordNumber.toLowerCase().includes(query.search!.toLowerCase())); entries.sort((a, b) => b.time.localeCompare(a.time)); const start = Math.max(0, (query.page - 1) * query.pageSize); return { items: entries.slice(start, start + query.pageSize).map((entry) => ({ ...entry, changes: entry.changes.map((change) => ({ ...change })) })), total: entries.length }; }
async function getAuditEntry(id: string): Promise<AuditEntry> { await beforeCall('getAuditEntry', id); const entry = auditEntries.find((item) => item.id === id); if (!entry) throw new SampleServiceFailure(notFound(nextRequestId())); return { ...entry, changes: entry.changes.map((change) => ({ ...change })) }; }

/**
 * Builds a failure with a specific error code, used for business-rule refusals
 * that the shared `notFound` helper does not cover.
 */
function buildFailureWithCode(code: ErrorCode, requestId: string, message?: string): ApiFailure {
  return {
    code,
    message: message ?? DEFAULT_ERROR_MESSAGES[code],
    details: [],
    requestId,
    status: ERROR_CODE_STATUS[code],
    retryAfterSeconds: null,
  };
}

function reset(): void {
  rows = SAMPLE_RECORDS.map((record) => ({ ...record }));
  products = SAMPLE_PRODUCTS.map((product) => ({ ...product }));
  contacts = SAMPLE_CONTACTS.map((contact) => ({ ...contact }));
  warehouses = SAMPLE_WAREHOUSES.map((warehouse) => ({ ...warehouse }));
  movements = SAMPLE_MOVEMENTS.map((movement) => ({ ...movement }));
  purchaseOrders = SAMPLE_PURCHASE_ORDERS.map((order) => ({ ...order }));
  goodsReceipts = SAMPLE_GOODS_RECEIPTS.map((receipt) => ({ ...receipt }));
  salesOrders = SAMPLE_SALES_ORDERS.map((order) => ({ ...order }));
  shipments = SAMPLE_SHIPMENTS.map((shipment) => ({ ...shipment }));
  invoices = SAMPLE_INVOICES.map((invoice) => ({ ...invoice }));
  payments = SAMPLE_PAYMENTS.map((payment) => ({ ...payment }));
  organization = { ...SAMPLE_SETTINGS_ORGANIZATION, currencyLocked: false };
  modules = SAMPLE_MODULES.map((entry) => ({ ...entry }));
  users = SAMPLE_USERS.map((entry) => ({ ...entry, roleIds: [...entry.roleIds] }));
  roles = ROLE_TEMPLATES.map((role) => ({ id: `role-${role.key}`, name: role.name, description: role.description, permissions: [...role.permissions], system: true }));
  auditEntries = SAMPLE_AUDIT_ENTRIES.map((entry) => ({ ...entry, changes: entry.changes.map((change) => ({ ...change })) }));
  auditSequence = auditEntries.length;
  reservations.clear();
  for (const r of SAMPLE_RESERVATIONS) {
    reservations.set(`${r.productId}|${r.warehouseId}`, r.reserved);
  }
  postedAdjustments.clear();
  postedReceipts.clear();
  postedSalesConfirmations.clear();
  postedShipments.clear();
  postedInvoiceCreations.clear();
  postedInvoiceIssues.clear();
  postedInvoiceVoids.clear();
  editedInvoiceDueDates.clear();
  postedPayments.clear();
  postedReversals.clear();
  receiptSequence = maxSourceSequence('GR-');
  shipmentSequence = maxSourceSequence('SH-');
  adjustmentSequence = maxSourceSequence('ADJ-');
  poSequence = SAMPLE_PURCHASE_ORDERS.length;
  soSequence = SAMPLE_SALES_ORDERS.length;
  invoiceSequence = maxDocumentSequence('INV-', SAMPLE_INVOICES.map((invoice) => invoice.number));
  paySequence = maxDocumentSequence('PAY-', SAMPLE_PAYMENTS.map((payment) => payment.number));
  callLog = [];
  callSequence = 0;
  requestSequence = 0;
  controls.simulateFailure = false;
  controls.failureKind = 'error';
  controls.simulateSlowResponse = false;
  controls.simulateEmptyData = false;
}

/**
 * The one instance the application reads. The switches live on the instance so
 * the gallery can flip them without a setter per switch.
 */
export const sampleCatalogService: SampleCatalogService = {
  getDashboardSummary,
  listRecords,
  getRecord,
  removeRecord,
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  archiveProduct,
  listContacts,
  getContact,
  createContact,
  updateContact,
  archiveContact,
  restoreContact,
  listWarehouses,
  getWarehouse,
  createWarehouse,
  updateWarehouse,
  deactivateWarehouse,
  listStockBalances,
  listMovements,
  postAdjustment,
  getLowStockCount,
  listPurchaseOrders,
  getPurchaseOrder,
  createPurchaseOrder,
  updatePurchaseOrder,
  confirmPurchaseOrder,
  cancelPurchaseOrder,
  receiveGoods,
  listGoodsReceipts,
  listSalesOrders,
  getSalesOrder,
  createSalesOrder,
  updateSalesOrder,
  confirmSalesOrder,
  cancelSalesOrder,
  shipSalesOrder,
  listShipments,
  listInvoices,
  getInvoice,
  listInvoicableOrders,
  createInvoiceFromOrder,
  updateInvoiceDueDate,
  issueInvoice,
  voidInvoice,
  listPayments,
  getPayment,
  recordPayment,
  reversePayment,
  listOpenInvoicesForCustomer,
  listOpenInvoiceCustomers,
  getOrganizationSettings,
  getOrganization,
  updateOrganizationSettings,
  listModules,
  toggleModule,
  listUsers,
  getUser,
  createUser,
  updateUserRoles,
  deactivateUser,
  reactivateUser,
  listRoles,
  getRole,
  createRole,
  updateRolePermissions,
  deleteRole,
  listPermissions,
  listAuditEntries,
  getAuditEntry,
  get calls(): readonly CallRecord[] {
    return callLog;
  },
  get simulateFailure(): boolean {
    return controls.simulateFailure;
  },
  set simulateFailure(value: boolean) {
    controls.simulateFailure = value;
  },
  get failureKind(): FailureKind {
    return controls.failureKind;
  },
  set failureKind(value: FailureKind) {
    controls.failureKind = value;
  },
  get simulateSlowResponse(): boolean {
    return controls.simulateSlowResponse;
  },
  set simulateSlowResponse(value: boolean) {
    controls.simulateSlowResponse = value;
  },
  get simulateEmptyData(): boolean {
    return controls.simulateEmptyData;
  },
  set simulateEmptyData(value: boolean) {
    controls.simulateEmptyData = value;
  },
  reset,
};
