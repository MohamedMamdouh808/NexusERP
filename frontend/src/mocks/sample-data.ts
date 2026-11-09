/**
 * Every sample value the interface can show, in one place (T013).
 *
 * FR-036 and data-model.md section 7: sample data lives HERE and nowhere else,
 * and reaches a component only through `src/services/`. A component that imports
 * this module directly is a defect, checked by
 * `src/components/__tests__/no-direct-sample-imports.spec.ts` (T060).
 *
 * Two rules this file must not break:
 *
 *  1. **Money is a decimal string.** `'1250.00'`, never `1250.00`. A JavaScript
 *     number is IEEE-754 binary floating point and cannot represent most decimal
 *     fractions exactly, so an amount that passes through one can differ from the
 *     server's by a fraction of a unit (Principle IV, FR-039). The values here are
 *     strings all the way to the formatter, which does no arithmetic on them.
 *
 *  2. **A status is an API status name, verbatim.** The names below are the design
 *     system's status mapping and the values the API returns; the interface never
 *     invents, abbreviates or rewords one, and colour is never the only signal
 *     (FR-022, FR-044).
 *
 * Nothing here is real: no organization, person or document is represented
 * (FR-041). The honesty the surfaces owe the user comes from the session (the
 * top bar shows the real signed-in organization and user) and from the shared
 * sample-data banner on every sample surface - page descriptions describe the
 * page instead of repeating a disclaimer.
 */

import type {
  Contact,
  DashboardPeriod,
  DashboardSummary,
  GoodsReceipt,
  Invoice,
  Movement,
  OrganizationSettings,
  Payment,
  PaymentMethod,
  Product,
  PurchaseOrder,
  SalesOrder,
  SampleRecord,
  Shipment,
  Warehouse,
  SampleUser,
  Organization,
  ModuleSetting,
  AuditEntry,
} from '../services/catalog-service';

/**
 * Dates for the invoicing sample are relative to the day the app loads, so the
 * overdue marker and the Overview's period figures stay meaningful on any day
 * rather than drifting out of reach of the demo. The Overview figures compare
 * calendar months, so the documents the dashboard derives from are additionally
 * anchored to days of the current and previous months by `isoDateInMonth`, which
 * keeps those buckets populated on the first of any month as well. Sales orders,
 * shipments and payments carry anchored dates on the same schedule so that every
 * related record keeps a coherent order (order → shipment → invoice → payment).
 * Nothing else in this file is computed; these helpers exist for exactly those
 * documents.
 */
function isoDateDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * A calendar-anchored date: `day` (1–28) of the month `monthsBack` months before
 * the month the app loads in. For the current month a day later than today is
 * clamped to today, because a record may not be dated forward; on the first of a
 * month every such record therefore carries today's date, and the records keep a
 * valid relative order among themselves on every day of the month.
 */
function isoDateInMonth(monthsBack: number, day: number): string {
  const now = new Date();
  const clampedDay = monthsBack === 0 ? Math.min(day, now.getUTCDate()) : day;
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack, clampedDay),
  ).toISOString().slice(0, 10);
}

/** A full timestamp `days` from now, at a fixed pleasant hour, for ledger entries. */
function isoTimestampDaysFromNow(days: number, hour: number): string {
  return `${isoDateDaysFromNow(days)}T${String(hour).padStart(2, '0')}:30:00Z`;
}

/** A full timestamp at a fixed pleasant hour on an `isoDateInMonth` anchor day. */
function isoTimestampInMonth(monthsBack: number, day: number, hour: number): string {
  return `${isoDateInMonth(monthsBack, day)}T${String(hour).padStart(2, '0')}:30:00Z`;
}

/**
 * The organization and user shown in the shell are no longer mock data: they
 * come from the signed-in session via /auth/me and /auth/organizations
 * (services/auth-session.ts). The only sample organization left here is the
 * settings page's sample row and the audit entries' sample record reference,
 * both identified by the fixed sample id below.
 */
const SAMPLE_ORGANIZATION_ID = 'sample-org-alpha';

export const SAMPLE_SETTINGS_ORGANIZATION: Organization = { id: SAMPLE_ORGANIZATION_ID, name: 'Sample Organization (Alpha)', currency: 'USD', defaultPaymentTermDays: 30, currencyLocked: false };
export const SAMPLE_MODULES: readonly ModuleSetting[] = [
  { key: 'contacts', label: 'Contacts', enabled: true, locked: true, description: 'Customers and suppliers' },
  { key: 'products', label: 'Products', enabled: true, locked: true, description: 'Product catalogue' },
  { key: 'settings', label: 'Settings', enabled: true, locked: true, description: 'Organization configuration' },
  { key: 'audit', label: 'Audit Log', enabled: true, locked: true, description: 'Permanent activity history' },
  { key: 'inventory', label: 'Inventory', enabled: true, locked: false, description: 'Stock balances and movements' },
  { key: 'purchasing', label: 'Purchasing', enabled: true, locked: false, description: 'Purchase orders and receipts' },
  { key: 'sales', label: 'Sales', enabled: true, locked: false, description: 'Sales orders and shipments' },
  { key: 'invoicing', label: 'Invoicing', enabled: true, locked: false, description: 'Invoices and payments' },
  { key: 'reports', label: 'Reports', enabled: false, locked: false, description: 'Operational reports' },
];
export const SAMPLE_USERS: readonly SampleUser[] = [
  { id: 'user-0001', name: 'Amina Hassan', email: 'amina.hassan@example.test', roleIds: ['role-administrator'], status: 'USER_ACTIVE', passwordChangeRequired: false, createdAt: isoTimestampDaysFromNow(-100, 9) },
  { id: 'user-0002', name: 'Omar Nabil', email: 'omar.nabil@example.test', roleIds: ['role-manager'], status: 'USER_ACTIVE', passwordChangeRequired: false, createdAt: isoTimestampDaysFromNow(-90, 10) },
  { id: 'user-0003', name: 'Mariam Adel', email: 'mariam.adel@example.test', roleIds: ['role-sales'], status: 'USER_ACTIVE', passwordChangeRequired: false, createdAt: isoTimestampDaysFromNow(-80, 11) },
  { id: 'user-0004', name: 'Youssef Samir', email: 'youssef.samir@example.test', roleIds: ['role-inventory', 'role-purchasing'], status: 'USER_ACTIVE', passwordChangeRequired: false, createdAt: isoTimestampDaysFromNow(-70, 12) },
  { id: 'user-0005', name: 'Layla Farooq', email: 'layla.farooq@example.test', roleIds: ['role-sales'], status: 'USER_DEACTIVATED', passwordChangeRequired: false, createdAt: isoTimestampDaysFromNow(-50, 13) },
];

const SAMPLE_AUDIT_ITEMS: readonly Omit<AuditEntry, 'id' | 'time'>[] = [
  { userId: 'user-0001', userName: 'Amina Hassan', action: 'USER_CREATED', actionLabel: 'User created', recordType: 'User', recordId: 'user-0002', recordNumber: 'omar.nabil@example.test', summary: 'Omar Nabil was added.', changes: [{ field: 'Status', before: '—', after: 'USER_ACTIVE' }] },
  { userId: 'user-0002', userName: 'Omar Nabil', action: 'PURCHASE_ORDER_CONFIRMED', actionLabel: 'Purchase order confirmed', recordType: 'Purchase order', recordId: 'po-0001', recordNumber: 'PO-000001', summary: 'Purchase order confirmed.', changes: [{ field: 'Status', before: 'DRAFT', after: 'CONFIRMED' }] },
  { userId: 'user-0001', userName: 'Amina Hassan', action: 'SALES_ORDER_CONFIRMED', actionLabel: 'Sales order confirmed', recordType: 'Sales order', recordId: 'so-0001', recordNumber: 'SO-000001', summary: 'Sales order confirmed.', changes: [{ field: 'Status', before: 'DRAFT', after: 'CONFIRMED' }] },
  { userId: 'user-0003', userName: 'Mariam Adel', action: 'GOODS_RECEIVED', actionLabel: 'Goods received', recordType: 'Goods receipt', recordId: 'gr-0001', recordNumber: 'GR-000001', summary: 'Goods were received against PO-000001.', changes: [{ field: 'Receipt status', before: '—', after: 'RECEIVED' }] },
  { userId: 'user-0004', userName: 'Youssef Samir', action: 'STOCK_ADJUSTED', actionLabel: 'Stock adjusted', recordType: 'Adjustment', recordId: null, recordNumber: 'ADJ-000001', summary: 'Stock was adjusted after a count.', changes: [{ field: 'Reason', before: '—', after: 'Count correction' }] },
  { userId: 'user-0003', userName: 'Mariam Adel', action: 'SHIPMENT_POSTED', actionLabel: 'Shipment posted', recordType: 'Shipment', recordId: 'so-0001', recordNumber: 'SH-000001', summary: 'Sales order SO-000001 was shipped.', changes: [{ field: 'Status', before: 'CONFIRMED', after: 'SHIPPED' }] },
  { userId: 'user-0001', userName: 'Amina Hassan', action: 'INVOICE_ISSUED', actionLabel: 'Invoice issued', recordType: 'Invoice', recordId: 'inv-0001', recordNumber: 'INV-000001', summary: 'Invoice INV-000001 was issued.', changes: [{ field: 'Status', before: 'DRAFT', after: 'ISSUED' }] },
  { userId: 'user-0003', userName: 'Mariam Adel', action: 'PAYMENT_RECORDED', actionLabel: 'Payment recorded', recordType: 'Payment', recordId: 'pay-0001', recordNumber: 'PAY-000001', summary: 'Payment PAY-000001 was recorded.', changes: [{ field: 'Status', before: '—', after: 'RECORDED' }] },
  { userId: 'user-0002', userName: 'Omar Nabil', action: 'ORGANIZATION_SETTINGS_CHANGED', actionLabel: 'Organization settings changed', recordType: 'Organization', recordId: 'sample-org-alpha', recordNumber: 'Sample Organization', summary: 'Payment terms were updated.', changes: [{ field: 'Payment terms', before: '30', after: '30' }] },
  { userId: 'user-0001', userName: 'Amina Hassan', action: 'ROLE_PERMISSIONS_CHANGED', actionLabel: 'Role permissions changed', recordType: 'Role', recordId: 'role-sales', recordNumber: 'Sales', summary: 'Permissions for the Sales role were reviewed.', changes: [{ field: 'Permission count', before: '7', after: '7' }] },
  { userId: 'user-0004', userName: 'Youssef Samir', action: 'SALES_ORDER_CANCELLED', actionLabel: 'Sales order cancelled', recordType: 'Sales order', recordId: 'so-0005', recordNumber: 'SO-000005', summary: 'Sales order was cancelled.', changes: [{ field: 'Status', before: 'CONFIRMED', after: 'CANCELLED' }] },
  { userId: 'user-0002', userName: 'Omar Nabil', action: 'PURCHASE_ORDER_CANCELLED', actionLabel: 'Purchase order cancelled', recordType: 'Purchase order', recordId: 'po-0003', recordNumber: 'PO-000003', summary: 'Purchase order was cancelled.', changes: [{ field: 'Status', before: 'DRAFT', after: 'CANCELLED' }] },
  { userId: 'user-0001', userName: 'Amina Hassan', action: 'PAYMENT_REVERSED', actionLabel: 'Payment reversed', recordType: 'Payment', recordId: 'pay-0004', recordNumber: 'PAY-000004', summary: 'Payment was reversed.', changes: [{ field: 'Status', before: 'RECORDED', after: 'REVERSED' }] },
  { userId: 'user-0003', userName: 'Mariam Adel', action: 'INVOICE_VOIDED', actionLabel: 'Invoice voided', recordType: 'Invoice', recordId: 'inv-0004', recordNumber: 'INV-000004', summary: 'Invoice was voided.', changes: [{ field: 'Status', before: 'ISSUED', after: 'VOID' }] },
  { userId: 'user-0001', userName: 'Amina Hassan', action: 'USER_ROLES_CHANGED', actionLabel: 'User roles changed', recordType: 'User', recordId: 'user-0003', recordNumber: 'mariam.adel@example.test', summary: 'Mariam Adel role assignments were changed.', changes: [{ field: 'Roles', before: 'Sales', after: 'Sales' }] },
  { userId: 'user-0002', userName: 'Omar Nabil', action: 'USER_DEACTIVATED', actionLabel: 'User deactivated', recordType: 'User', recordId: 'user-0005', recordNumber: 'layla.farooq@example.test', summary: 'Layla Farooq was deactivated.', changes: [{ field: 'Status', before: 'USER_ACTIVE', after: 'USER_DEACTIVATED' }] },
  { userId: 'user-0001', userName: 'Amina Hassan', action: 'MODULE_TOGGLED', actionLabel: 'Module setting changed', recordType: 'Module', recordId: null, recordNumber: 'Reports', summary: 'The Reports module was turned off.', changes: [{ field: 'Enabled', before: 'On', after: 'Off' }] },
  { userId: 'user-0004', userName: 'Youssef Samir', action: 'GOODS_RECEIVED', actionLabel: 'Goods received', recordType: 'Goods receipt', recordId: 'gr-0002', recordNumber: 'GR-000002', summary: 'Goods were received against a purchase order.', changes: [{ field: 'Receipt status', before: '—', after: 'RECEIVED' }] },
  { userId: 'user-0003', userName: 'Mariam Adel', action: 'SHIPMENT_POSTED', actionLabel: 'Shipment posted', recordType: 'Shipment', recordId: 'so-0003', recordNumber: 'SH-000003', summary: 'Sales order SO-000003 was shipped.', changes: [{ field: 'Status', before: 'CONFIRMED', after: 'SHIPPED' }] },
  { userId: 'user-0001', userName: 'Amina Hassan', action: 'INVOICE_ISSUED', actionLabel: 'Invoice issued', recordType: 'Invoice', recordId: 'inv-0003', recordNumber: 'INV-000003', summary: 'Invoice INV-000003 was issued.', changes: [{ field: 'Status', before: 'DRAFT', after: 'ISSUED' }] },
  { userId: 'user-0003', userName: 'Mariam Adel', action: 'PAYMENT_RECORDED', actionLabel: 'Payment recorded', recordType: 'Payment', recordId: 'pay-0003', recordNumber: 'PAY-000003', summary: 'Payment PAY-000003 was recorded.', changes: [{ field: 'Status', before: '—', after: 'RECORDED' }] },
  { userId: 'user-0001', userName: 'Amina Hassan', action: 'ROLE_CREATED', actionLabel: 'Role created', recordType: 'Role', recordId: 'role-custom-1', recordNumber: 'Warehouse Lead', summary: 'A custom role was created.', changes: [{ field: 'Type', before: '—', after: 'Custom' }] },
  { userId: 'user-0002', userName: 'Omar Nabil', action: 'ORGANIZATION_SETTINGS_CHANGED', actionLabel: 'Organization settings changed', recordType: 'Organization', recordId: 'sample-org-alpha', recordNumber: 'Sample Organization', summary: 'Organization settings were saved.', changes: [{ field: 'Currency', before: 'USD', after: 'USD' }] },
  { userId: 'user-0004', userName: 'Youssef Samir', action: 'STOCK_ADJUSTED', actionLabel: 'Stock adjusted', recordType: 'Adjustment', recordId: null, recordNumber: 'ADJ-000002', summary: 'A stock count correction was recorded.', changes: [{ field: 'Reason', before: '—', after: 'Count correction' }] },
  { userId: 'user-0001', userName: 'Amina Hassan', action: 'USER_REACTIVATED', actionLabel: 'User reactivated', recordType: 'User', recordId: 'user-0005', recordNumber: 'layla.farooq@example.test', summary: 'A user was reactivated, then later deactivated.', changes: [{ field: 'Status', before: 'USER_DEACTIVATED', after: 'USER_ACTIVE' }] },
];
export const SAMPLE_AUDIT_ENTRIES: readonly AuditEntry[] = SAMPLE_AUDIT_ITEMS.map((entry, index) => ({ id: `audit-${String(index + 1).padStart(4, '0')}`, time: isoTimestampDaysFromNow(-(index % 14), 16 - (index % 7)), ...entry }));

/**
 * The sample rows. Twelve, so a page size of five produces three pages and the
 * pager and the "page after the first" state are reachable without special-casing.
 *
 * The statuses are chosen to cover the design system's status mapping rather than
 * to describe a plausible document history: every one of the five badge tones is
 * represented, so the mapping is demonstrated rather than asserted (FR-022, FR-044).
 */
export const SAMPLE_RECORDS: readonly SampleRecord[] = [
  { id: 'sample-0001', status: 'DRAFT', name: 'Heavy-duty shelving unit', amount: '1250.00' },
  { id: 'sample-0002', status: 'CONFIRMED', name: 'Pallet wrapping film', amount: '384.50' },
  {
    id: 'sample-0003',
    status: 'PARTIALLY_RECEIVED',
    name: 'Barcode scanner, cordless',
    amount: '2199.99',
  },
  { id: 'sample-0004', status: 'RECEIVED', name: 'Thermal label roll', amount: '96.00' },
  { id: 'sample-0005', status: 'CANCELLED', name: 'Forklift hire, one week', amount: '1875.00' },
  { id: 'sample-0006', status: 'PAID', name: 'Steel pallet, galvanised', amount: '4300.00' },
  { id: 'sample-0007', status: 'ISSUED', name: 'Safety glove, cut-resistant', amount: '612.75' },
  {
    id: 'sample-0008',
    status: 'PARTIALLY_PAID',
    name: 'Racking inspection service',
    amount: '780.40',
  },
  { id: 'sample-0009', status: 'VOID', name: 'Obsolete stock write-off', amount: '0.00' },
  { id: 'sample-0010', status: 'SHIPPED', name: 'Wooden pallet collar', amount: '145.20' },
  { id: 'sample-0011', status: 'ACTIVE', name: 'Reserved: dispatch crate', amount: '308.00' },
  { id: 'sample-0012', status: 'CONSUMED', name: 'Consumed: packing tape', amount: '57.85' },
];

/**
 * The sample dashboard summaries carry the shape and measure wording of each
 * period. The service derives every value and the Sales change from the live
 * records above (see `getDashboardSummary`), and the other three metrics carry
 * no fabricated percentage: a change is shown only when the same derivation can
 * produce it for the prior period.
 */
export const SAMPLE_DASHBOARD_SUMMARIES: Readonly<Record<DashboardPeriod, DashboardSummary>> = {
  'this-month': {
    period: 'this-month',
    sales: {
      value: '0.00',
      changeDirection: null,
      changePercent: null,
      measure: 'Issued invoice totals for this month',
    },
    activeOrders: {
      value: 0,
      changeDirection: null,
      changePercent: null,
      measure: 'Confirmed orders awaiting shipment',
    },
    lowStockItems: {
      value: 0,
      changeDirection: null,
      changePercent: null,
      measure: 'Items at or below their reorder threshold',
    },
    outstandingInvoices: {
      value: '0.00',
      changeDirection: null,
      changePercent: null,
      measure: 'Unpaid balance across issued invoices',
    },
    topSellingProducts: [],
    salesOrdersTrend: [
      { date: 'Week 1', sales: '0.00', orders: 0 },
      { date: 'Week 2', sales: '0.00', orders: 0 },
      { date: 'Week 3', sales: '0.00', orders: 0 },
      { date: 'Week 4', sales: '0.00', orders: 0 },
      { date: 'Week 5', sales: '0.00', orders: 0 },
    ],
    ordersByStatus: [
      { status: 'DRAFT', count: 0 },
      { status: 'CONFIRMED', count: 0 },
      { status: 'SHIPPED', count: 0 },
      { status: 'CANCELLED', count: 0 },
    ],
    recentActivity: [],
    empty: false,
  },
  'last-month': {
    period: 'last-month',
    sales: {
      value: '0.00',
      changeDirection: null,
      changePercent: null,
      measure: 'Issued invoice totals for last month',
    },
    activeOrders: {
      value: 0,
      changeDirection: null,
      changePercent: null,
      measure: 'Confirmed orders awaiting shipment',
    },
    lowStockItems: {
      value: 0,
      changeDirection: null,
      changePercent: null,
      measure: 'Items at or below their reorder threshold',
    },
    outstandingInvoices: {
      value: '0.00',
      changeDirection: null,
      changePercent: null,
      measure: 'Unpaid balance across issued invoices',
    },
    topSellingProducts: [],
    salesOrdersTrend: [
      { date: 'Week 1', sales: '0.00', orders: 0 },
      { date: 'Week 2', sales: '0.00', orders: 0 },
      { date: 'Week 3', sales: '0.00', orders: 0 },
      { date: 'Week 4', sales: '0.00', orders: 0 },
      { date: 'Week 5', sales: '0.00', orders: 0 },
    ],
    ordersByStatus: [
      { status: 'DRAFT', count: 0 },
      { status: 'CONFIRMED', count: 0 },
      { status: 'SHIPPED', count: 0 },
      { status: 'CANCELLED', count: 0 },
    ],
    recentActivity: [],
    empty: false,
  },
};

/** The two sample warehouses. */
export const SAMPLE_WAREHOUSES: readonly Warehouse[] = [
  {
    id: 'warehouse-0001',
    code: 'WH-001',
    name: 'Main Warehouse',
    isDefault: true,
    status: 'ACTIVE',
  },
  {
    id: 'warehouse-0002',
    code: 'WH-002',
    name: 'East Depot',
    isDefault: false,
    status: 'ACTIVE',
  },
];

/**
 * Reserved quantities keyed implicitly by productId|warehouseId.
 *
 * The rows are the baseline the demonstration starts from: prod-0004 in the
 * main warehouse already carries 5.000 from before, plus the 35.000 that
 * sample order SO-000005 (CONFIRMED) holds, hence 40.000. Confirming, shipping
 * or cancelling a live order changes these numbers in the in-memory store
 * (available drops or rises; on hand is only touched by movements).
 */
export const SAMPLE_RESERVATIONS: readonly {
  readonly productId: string;
  readonly warehouseId: string;
  readonly reserved: string;
}[] = [
  { productId: 'prod-0001', warehouseId: 'warehouse-0001', reserved: '1.000' },
  { productId: 'prod-0002', warehouseId: 'warehouse-0001', reserved: '2.500' },
  { productId: 'prod-0003', warehouseId: 'warehouse-0001', reserved: '0.500' },
  // Baseline 5.000 + SO-000005's confirmed reservation of 35.000.
  { productId: 'prod-0004', warehouseId: 'warehouse-0001', reserved: '40.000' },
  { productId: 'prod-0005', warehouseId: 'warehouse-0001', reserved: '0.000' },
  { productId: 'prod-0001', warehouseId: 'warehouse-0002', reserved: '0.000' },
  { productId: 'prod-0002', warehouseId: 'warehouse-0002', reserved: '1.000' },
  { productId: 'prod-0003', warehouseId: 'warehouse-0002', reserved: '0.000' },
  { productId: 'prod-0004', warehouseId: 'warehouse-0002', reserved: '0.000' },
  { productId: 'prod-0005', warehouseId: 'warehouse-0002', reserved: '0.000' },
];

/** The sample movements. About 20, including opening balances and transactions. */
export const SAMPLE_MOVEMENTS: readonly Movement[] = [
  // Opening balances (RECEIPT type establishes initial stock)
  { id: 'mov-0001', source: 'OPEN-000001', type: 'RECEIPT', productId: 'prod-0001', productSku: 'SKU-1001', productName: 'Heavy-duty shelving unit', warehouseId: 'warehouse-0001', warehouseName: 'Main Warehouse', quantity: '50.000', reason: 'Opening balance', user: 'Amina Hassan', createdAt: '2026-09-01T08:00:00Z' },
  { id: 'mov-0002', source: 'OPEN-000002', type: 'RECEIPT', productId: 'prod-0002', productSku: 'SKU-1002', productName: 'Pallet wrapping film', warehouseId: 'warehouse-0001', warehouseName: 'Main Warehouse', quantity: '100.000', reason: 'Opening balance', user: 'Amina Hassan', createdAt: '2026-09-01T08:00:00Z' },
  { id: 'mov-0003', source: 'OPEN-000003', type: 'RECEIPT', productId: 'prod-0003', productSku: 'SKU-1003', productName: 'Barcode scanner, cordless', warehouseId: 'warehouse-0001', warehouseName: 'Main Warehouse', quantity: '20.000', reason: 'Opening balance', user: 'Amina Hassan', createdAt: '2026-09-01T08:00:00Z' },
  { id: 'mov-0004', source: 'OPEN-000004', type: 'RECEIPT', productId: 'prod-0004', productSku: 'SKU-1004', productName: 'Thermal label roll', warehouseId: 'warehouse-0001', warehouseName: 'Main Warehouse', quantity: '200.000', reason: 'Opening balance', user: 'Amina Hassan', createdAt: '2026-09-01T08:00:00Z' },
  { id: 'mov-0005', source: 'OPEN-000005', type: 'RECEIPT', productId: 'prod-0005', productSku: 'SKU-1005', productName: 'Forklift hire, one week', warehouseId: 'warehouse-0001', warehouseName: 'Main Warehouse', quantity: '10.000', reason: 'Opening balance', user: 'Amina Hassan', createdAt: '2026-09-01T08:00:00Z' },
  { id: 'mov-0006', source: 'OPEN-000006', type: 'RECEIPT', productId: 'prod-0001', productSku: 'SKU-1001', productName: 'Heavy-duty shelving unit', warehouseId: 'warehouse-0002', warehouseName: 'East Depot', quantity: '30.000', reason: 'Opening balance', user: 'Amina Hassan', createdAt: '2026-09-01T08:00:00Z' },
  { id: 'mov-0007', source: 'OPEN-000007', type: 'RECEIPT', productId: 'prod-0002', productSku: 'SKU-1002', productName: 'Pallet wrapping film', warehouseId: 'warehouse-0002', warehouseName: 'East Depot', quantity: '50.000', reason: 'Opening balance', user: 'Amina Hassan', createdAt: '2026-09-01T08:00:00Z' },
  { id: 'mov-0008', source: 'OPEN-000008', type: 'RECEIPT', productId: 'prod-0003', productSku: 'SKU-1003', productName: 'Barcode scanner, cordless', warehouseId: 'warehouse-0002', warehouseName: 'East Depot', quantity: '15.000', reason: 'Opening balance', user: 'Amina Hassan', createdAt: '2026-09-01T08:00:00Z' },
  { id: 'mov-0009', source: 'OPEN-000009', type: 'RECEIPT', productId: 'prod-0004', productSku: 'SKU-1004', productName: 'Thermal label roll', warehouseId: 'warehouse-0002', warehouseName: 'East Depot', quantity: '100.000', reason: 'Opening balance', user: 'Amina Hassan', createdAt: '2026-09-01T08:00:00Z' },
  { id: 'mov-0010', source: 'OPEN-000010', type: 'RECEIPT', productId: 'prod-0005', productSku: 'SKU-1005', productName: 'Forklift hire, one week', warehouseId: 'warehouse-0002', warehouseName: 'East Depot', quantity: '5.000', reason: 'Opening balance', user: 'Amina Hassan', createdAt: '2026-09-01T08:00:00Z' },

  // Transactions
  { id: 'mov-0011', source: 'GR-000001', type: 'RECEIPT', productId: 'prod-0001', productSku: 'SKU-1001', productName: 'Heavy-duty shelving unit', warehouseId: 'warehouse-0001', warehouseName: 'Main Warehouse', quantity: '10.000', reason: 'Received against PO-000001', user: 'Amina Hassan', createdAt: '2026-09-15T10:30:00Z' },
  { id: 'mov-0012', source: 'SH-000001', type: 'SHIPMENT', productId: 'prod-0002', productSku: 'SKU-1002', productName: 'Pallet wrapping film', warehouseId: 'warehouse-0001', warehouseName: 'Main Warehouse', quantity: '-25.000', reason: 'Shipped to customer CUST-1001', user: 'Amina Hassan', createdAt: isoTimestampInMonth(1, 6, 14) },
  { id: 'mov-0013', source: 'GR-000002', type: 'RECEIPT', productId: 'prod-0003', productSku: 'SKU-1003', productName: 'Barcode scanner, cordless', warehouseId: 'warehouse-0001', warehouseName: 'Main Warehouse', quantity: '5.000', reason: 'Received against PO-000002', user: 'Amina Hassan', createdAt: '2026-09-20T09:45:00Z' },
  { id: 'mov-0014', source: 'ADJ-000001', type: 'ADJUSTMENT', productId: 'prod-0004', productSku: 'SKU-1004', productName: 'Thermal label roll', warehouseId: 'warehouse-0001', warehouseName: 'Main Warehouse', quantity: '-12.000', reason: 'Damage', user: 'Amina Hassan', createdAt: '2026-09-22T11:00:00Z' },
  { id: 'mov-0015', source: 'SH-000002', type: 'SHIPMENT', productId: 'prod-0001', productSku: 'SKU-1001', productName: 'Heavy-duty shelving unit', warehouseId: 'warehouse-0001', warehouseName: 'Main Warehouse', quantity: '-5.000', reason: 'Shipped to customer CUST-1002', user: 'Amina Hassan', createdAt: isoTimestampInMonth(2, 10, 16) },
  { id: 'mov-0016', source: 'GR-000003', type: 'RECEIPT', productId: 'prod-0002', productSku: 'SKU-1002', productName: 'Pallet wrapping film', warehouseId: 'warehouse-0002', warehouseName: 'East Depot', quantity: '20.000', reason: 'Received against PO-000003', user: 'Amina Hassan', createdAt: '2026-09-28T08:15:00Z' },
  { id: 'mov-0017', source: 'SH-000003', type: 'SHIPMENT', productId: 'prod-0003', productSku: 'SKU-1003', productName: 'Barcode scanner, cordless', warehouseId: 'warehouse-0002', warehouseName: 'East Depot', quantity: '-3.000', reason: 'Shipped to customer CUST-1003', user: 'Amina Hassan', createdAt: isoTimestampInMonth(0, 5, 13) },
  { id: 'mov-0018', source: 'ADJ-000002', type: 'ADJUSTMENT', productId: 'prod-0005', productSku: 'SKU-1005', productName: 'Forklift hire, one week', warehouseId: 'warehouse-0001', warehouseName: 'Main Warehouse', quantity: '-2.000', reason: 'Count correction', user: 'Amina Hassan', createdAt: '2026-10-05T10:00:00Z' },
  { id: 'mov-0019', source: 'GR-000004', type: 'RECEIPT', productId: 'prod-0001', productSku: 'SKU-1001', productName: 'Heavy-duty shelving unit', warehouseId: 'warehouse-0002', warehouseName: 'East Depot', quantity: '8.000', reason: 'Received against PO-000003', user: 'Amina Hassan', createdAt: '2026-10-08T14:50:00Z' },
  { id: 'mov-0020', source: 'SH-000004', type: 'SHIPMENT', productId: 'prod-0004', productSku: 'SKU-1004', productName: 'Thermal label roll', warehouseId: 'warehouse-0001', warehouseName: 'Main Warehouse', quantity: '-30.000', reason: 'Shipped to customer CUST-1004', user: 'Amina Hassan', createdAt: isoTimestampInMonth(1, 14, 9) },
  { id: 'mov-0021', source: 'SH-000005', type: 'SHIPMENT', productId: 'prod-0002', productSku: 'SKU-1002', productName: 'Pallet wrapping film', warehouseId: 'warehouse-0001', warehouseName: 'Main Warehouse', quantity: '-12.000', reason: 'Shipped to customer CUST-1005', user: 'Amina Hassan', createdAt: isoTimestampInMonth(0, 14, 10) },
  { id: 'mov-0022', source: 'SH-000006', type: 'SHIPMENT', productId: 'prod-0003', productSku: 'SKU-1003', productName: 'Barcode scanner, cordless', warehouseId: 'warehouse-0002', warehouseName: 'East Depot', quantity: '-2.000', reason: 'Shipped to customer CUST-1006', user: 'Amina Hassan', createdAt: isoTimestampInMonth(0, 18, 15) },
];

/**
 * The sample purchase orders. Six orders cover every status: PO-000001 and
 * PO-000002 are fully received, PO-000003 is partially received across two
 * receipts (GR-000003 and GR-000004), and PO-000004/5/6 are confirmed, draft
 * and cancelled. The receipts below are the same documents the Inventory
 * movement ledger carries as GR-000001..GR-000004 sources, so every screen
 * tells one story. Received quantities are derived from the receipts, never
 * typed twice.
 */
export const SAMPLE_PURCHASE_ORDERS: readonly PurchaseOrder[] = [
  {
    id: 'po-0001',
    number: 'PO-000001',
    supplierId: 'contact-0002',
    supplierName: 'Omar Nabil',
    warehouseId: 'warehouse-0001',
    warehouseName: 'Main Warehouse',
    status: 'RECEIVED',
    orderDate: '2026-09-10',
    expectedDate: null,
    notes: 'Rush replenishment for the storage bay.',
    lines: [
      { id: 'po-0001-line-1', productId: 'prod-0001', productSku: 'SKU-1001', productName: 'Heavy-duty shelving unit', quantity: '10.000', received: '10.000', outstanding: '0.000', unitCost: '850.00', lineTotal: '8500.00' },
    ],
    total: '8500.00',
  },
  {
    id: 'po-0002',
    number: 'PO-000002',
    supplierId: 'contact-0004',
    supplierName: 'Youssef Samir',
    warehouseId: 'warehouse-0001',
    warehouseName: 'Main Warehouse',
    status: 'RECEIVED',
    orderDate: '2026-09-18',
    expectedDate: '2026-09-30',
    notes: '',
    lines: [
      { id: 'po-0002-line-1', productId: 'prod-0003', productSku: 'SKU-1003', productName: 'Barcode scanner, cordless', quantity: '5.000', received: '5.000', outstanding: '0.000', unitCost: '1499.00', lineTotal: '7495.00' },
    ],
    total: '7495.00',
  },
  {
    id: 'po-0003',
    number: 'PO-000003',
    supplierId: 'contact-0002',
    supplierName: 'Omar Nabil',
    warehouseId: 'warehouse-0002',
    warehouseName: 'East Depot',
    status: 'PARTIALLY_RECEIVED',
    orderDate: '2026-09-22',
    expectedDate: '2026-10-01',
    notes: 'Two deliveries agreed with the supplier.',
    lines: [
      { id: 'po-0003-line-1', productId: 'prod-0002', productSku: 'SKU-1002', productName: 'Pallet wrapping film', quantity: '50.000', received: '20.000', outstanding: '30.000', unitCost: '260.00', lineTotal: '13000.00' },
      { id: 'po-0003-line-2', productId: 'prod-0001', productSku: 'SKU-1001', productName: 'Heavy-duty shelving unit', quantity: '30.000', received: '8.000', outstanding: '22.000', unitCost: '850.00', lineTotal: '25500.00' },
    ],
    total: '38500.00',
  },
  {
    id: 'po-0004',
    number: 'PO-000004',
    supplierId: 'contact-0006',
    supplierName: 'Tariq Mahmood',
    warehouseId: 'warehouse-0001',
    warehouseName: 'Main Warehouse',
    status: 'CONFIRMED',
    orderDate: '2026-10-14',
    expectedDate: '2026-10-28',
    notes: 'Quarterly packaging stock.',
    lines: [
      { id: 'po-0004-line-1', productId: 'prod-0004', productSku: 'SKU-1004', productName: 'Thermal label roll', quantity: '120.000', received: '0.000', outstanding: '120.000', unitCost: '65.00', lineTotal: '7800.00' },
      { id: 'po-0004-line-2', productId: 'prod-0002', productSku: 'SKU-1002', productName: 'Pallet wrapping film', quantity: '25.000', received: '0.000', outstanding: '25.000', unitCost: '260.00', lineTotal: '6500.00' },
    ],
    total: '14300.00',
  },
  {
    id: 'po-0005',
    number: 'PO-000005',
    supplierId: 'contact-0004',
    supplierName: 'Youssef Samir',
    warehouseId: 'warehouse-0001',
    warehouseName: 'Main Warehouse',
    status: 'DRAFT',
    orderDate: '2026-10-20',
    expectedDate: null,
    notes: 'Draft — awaiting supplier quotation.',
    lines: [
      { id: 'po-0005-line-1', productId: 'prod-0001', productSku: 'SKU-1001', productName: 'Heavy-duty shelving unit', quantity: '4.000', received: '0.000', outstanding: '4.000', unitCost: '850.00', lineTotal: '3400.00' },
      { id: 'po-0005-line-2', productId: 'prod-0004', productSku: 'SKU-1004', productName: 'Thermal label roll', quantity: '60.000', received: '0.000', outstanding: '60.000', unitCost: '65.00', lineTotal: '3900.00' },
    ],
    total: '7300.00',
  },
  {
    id: 'po-0006',
    number: 'PO-000006',
    supplierId: 'contact-0006',
    supplierName: 'Tariq Mahmood',
    warehouseId: 'warehouse-0002',
    warehouseName: 'East Depot',
    status: 'CANCELLED',
    orderDate: '2026-10-16',
    expectedDate: '2026-10-30',
    notes: 'Cancelled — duplicate of PO-000004.',
    lines: [
      { id: 'po-0006-line-1', productId: 'prod-0004', productSku: 'SKU-1004', productName: 'Thermal label roll', quantity: '40.000', received: '0.000', outstanding: '40.000', unitCost: '65.00', lineTotal: '2600.00' },
    ],
    total: '2600.00',
  },
];

/**
 * The sample goods receipts, one per GR movement already in the ledger. Nothing
 * here is editable: a receipt increases stock and is corrected only by a
 * compensating adjustment.
 */
export const SAMPLE_GOODS_RECEIPTS: readonly GoodsReceipt[] = [
  {
    id: 'receipt-0001',
    number: 'GR-000001',
    orderId: 'po-0001',
    orderNumber: 'PO-000001',
    supplierId: 'contact-0002',
    supplierName: 'Omar Nabil',
    warehouseId: 'warehouse-0001',
    warehouseName: 'Main Warehouse',
    receiptDate: '2026-09-15T10:30:00Z',
    lines: [
      { lineId: 'po-0001-line-1', productId: 'prod-0001', productSku: 'SKU-1001', productName: 'Heavy-duty shelving unit', quantity: '10.000', unitCost: '850.00' },
    ],
    user: 'Amina Hassan',
  },
  {
    id: 'receipt-0002',
    number: 'GR-000002',
    orderId: 'po-0002',
    orderNumber: 'PO-000002',
    supplierId: 'contact-0004',
    supplierName: 'Youssef Samir',
    warehouseId: 'warehouse-0001',
    warehouseName: 'Main Warehouse',
    receiptDate: '2026-09-20T09:45:00Z',
    lines: [
      { lineId: 'po-0002-line-1', productId: 'prod-0003', productSku: 'SKU-1003', productName: 'Barcode scanner, cordless', quantity: '5.000', unitCost: '1499.00' },
    ],
    user: 'Amina Hassan',
  },
  {
    id: 'receipt-0003',
    number: 'GR-000003',
    orderId: 'po-0003',
    orderNumber: 'PO-000003',
    supplierId: 'contact-0002',
    supplierName: 'Omar Nabil',
    warehouseId: 'warehouse-0002',
    warehouseName: 'East Depot',
    receiptDate: '2026-09-28T08:15:00Z',
    lines: [
      { lineId: 'po-0003-line-1', productId: 'prod-0002', productSku: 'SKU-1002', productName: 'Pallet wrapping film', quantity: '20.000', unitCost: '260.00' },
    ],
    user: 'Amina Hassan',
  },
  {
    id: 'receipt-0004',
    number: 'GR-000004',
    orderId: 'po-0003',
    orderNumber: 'PO-000003',
    supplierId: 'contact-0002',
    supplierName: 'Omar Nabil',
    warehouseId: 'warehouse-0002',
    warehouseName: 'East Depot',
    receiptDate: '2026-10-08T14:50:00Z',
    lines: [
      { lineId: 'po-0003-line-2', productId: 'prod-0001', productSku: 'SKU-1001', productName: 'Heavy-duty shelving unit', quantity: '8.000', unitCost: '850.00' },
    ],
    user: 'Amina Hassan',
  },
];

/**
 * The sample sales orders. Every status is covered, and the four SHIPPED
 * orders are the same documents the Inventory movement ledger carries as
 * SH-000001..SH-000004 sources, so every screen tells one story.
 *
 * SO-000005 is confirmed: its 35.000 of prod-0004 is already part of the
 * baseline reservations above. SO-000006 is a draft, deliberately asking for
 * 110.000 of a product whose East Depot balance is 100.000, so the form's
 * per-line availability warning and the confirm-time shortage banner are both
 * reachable without special-casing. Quantity x unit price is kept in the same
 * scaled-integer arithmetic the service uses; the totals below are its results.
 */
export const SAMPLE_SALES_ORDERS: readonly SalesOrder[] = [
  {
    id: 'so-0001',
    number: 'SO-000001',
    customerId: 'contact-0001',
    customerName: 'Amina Hassan',
    warehouseId: 'warehouse-0001',
    warehouseName: 'Main Warehouse',
    status: 'SHIPPED',
    orderDate: isoDateInMonth(1, 4),
    notes: 'Initial order for the retail fixtures.',
    lines: [
      { id: 'so-0001-line-1', productId: 'prod-0002', productSku: 'SKU-1002', productName: 'Pallet wrapping film', quantity: '25.000', unitPrice: '384.50', lineTotal: '9612.50' },
    ],
    total: '9612.50',
  },
  {
    id: 'so-0002',
    number: 'SO-000002',
    customerId: 'contact-0003',
    customerName: 'Mariam Adel',
    warehouseId: 'warehouse-0001',
    warehouseName: 'Main Warehouse',
    status: 'SHIPPED',
    orderDate: isoDateInMonth(2, 8),
    notes: '',
    lines: [
      { id: 'so-0002-line-1', productId: 'prod-0001', productSku: 'SKU-1001', productName: 'Heavy-duty shelving unit', quantity: '5.000', unitPrice: '1250.00', lineTotal: '6250.00' },
    ],
    total: '6250.00',
  },
  {
    id: 'so-0003',
    number: 'SO-000003',
    customerId: 'contact-0005',
    customerName: 'Layla Farooq',
    warehouseId: 'warehouse-0002',
    warehouseName: 'East Depot',
    status: 'SHIPPED',
    orderDate: isoDateInMonth(0, 4),
    notes: 'Store refit — scanners for the new counters.',
    lines: [
      { id: 'so-0003-line-1', productId: 'prod-0003', productSku: 'SKU-1003', productName: 'Barcode scanner, cordless', quantity: '3.000', unitPrice: '2199.99', lineTotal: '6599.97' },
    ],
    total: '6599.97',
  },
  {
    id: 'so-0004',
    number: 'SO-000004',
    customerId: 'contact-0007',
    customerName: 'Fatima Rashid',
    warehouseId: 'warehouse-0001',
    warehouseName: 'Main Warehouse',
    status: 'SHIPPED',
    orderDate: isoDateInMonth(1, 12),
    notes: '',
    lines: [
      { id: 'so-0004-line-1', productId: 'prod-0004', productSku: 'SKU-1004', productName: 'Thermal label roll', quantity: '30.000', unitPrice: '96.00', lineTotal: '2880.00' },
    ],
    total: '2880.00',
  },
  {
    id: 'so-0005',
    number: 'SO-000005',
    customerId: 'contact-0009',
    customerName: 'Nadia Hassan',
    warehouseId: 'warehouse-0001',
    warehouseName: 'Main Warehouse',
    status: 'CONFIRMED',
    orderDate: isoDateInMonth(0, 19),
    notes: 'Confirmed — stock reserved.',
    lines: [
      { id: 'so-0005-line-1', productId: 'prod-0004', productSku: 'SKU-1004', productName: 'Thermal label roll', quantity: '35.000', unitPrice: '96.00', lineTotal: '3360.00' },
    ],
    total: '3360.00',
  },
  {
    id: 'so-0006',
    number: 'SO-000006',
    customerId: 'contact-0011',
    customerName: 'Sofia Malik',
    warehouseId: 'warehouse-0002',
    warehouseName: 'East Depot',
    status: 'DRAFT',
    orderDate: isoDateInMonth(0, 22),
    notes: 'Draft — 110 rolls exceed the 100 on hand at East Depot on purpose.',
    lines: [
      { id: 'so-0006-line-1', productId: 'prod-0001', productSku: 'SKU-1001', productName: 'Heavy-duty shelving unit', quantity: '10.000', unitPrice: '1250.00', lineTotal: '12500.00' },
      { id: 'so-0006-line-2', productId: 'prod-0004', productSku: 'SKU-1004', productName: 'Thermal label roll', quantity: '110.000', unitPrice: '96.00', lineTotal: '10560.00' },
    ],
    total: '23060.00',
  },
  {
    id: 'so-0007',
    number: 'SO-000007',
    customerId: 'contact-0009',
    customerName: 'Nadia Hassan',
    warehouseId: 'warehouse-0001',
    warehouseName: 'Main Warehouse',
    status: 'CANCELLED',
    orderDate: isoDateInMonth(1, 20),
    notes: 'Cancelled by the customer before confirming.',
    lines: [
      { id: 'so-0007-line-1', productId: 'prod-0002', productSku: 'SKU-1002', productName: 'Pallet wrapping film', quantity: '15.000', unitPrice: '384.50', lineTotal: '5767.50' },
    ],
    total: '5767.50',
  },
  {
    id: 'so-0008',
    number: 'SO-000008',
    customerId: 'contact-0009',
    customerName: 'Nadia Hassan',
    warehouseId: 'warehouse-0001',
    warehouseName: 'Main Warehouse',
    status: 'SHIPPED',
    orderDate: isoDateInMonth(0, 13),
    notes: 'Invoicing sample: issued invoice exists with a reversed payment.',
    lines: [
      { id: 'so-0008-line-1', productId: 'prod-0002', productSku: 'SKU-1002', productName: 'Pallet wrapping film', quantity: '12.000', unitPrice: '384.50', lineTotal: '4614.00' },
    ],
    total: '4614.00',
  },
  {
    id: 'so-0009',
    number: 'SO-000009',
    customerId: 'contact-0011',
    customerName: 'Sofia Malik',
    warehouseId: 'warehouse-0002',
    warehouseName: 'East Depot',
    status: 'SHIPPED',
    orderDate: isoDateInMonth(0, 16),
    notes: 'Invoicing sample: carries the only draft invoice.',
    lines: [
      { id: 'so-0009-line-1', productId: 'prod-0003', productSku: 'SKU-1003', productName: 'Barcode scanner, cordless', quantity: '2.000', unitPrice: '2199.99', lineTotal: '4399.98' },
    ],
    total: '4399.98',
  },
];

/**
 * The sample shipments, one per SH movement already in the ledger. Nothing
 * here is editable: a shipment has left the building and is corrected only by
 * a new order.
 */
export const SAMPLE_SHIPMENTS: readonly Shipment[] = [
  {
    id: 'shipment-0001',
    number: 'SH-000001',
    orderId: 'so-0001',
    orderNumber: 'SO-000001',
    customerId: 'contact-0001',
    customerName: 'Amina Hassan',
    warehouseId: 'warehouse-0001',
    warehouseName: 'Main Warehouse',
    shipmentDate: isoTimestampInMonth(1, 6, 14),
    lines: [
      { productId: 'prod-0002', productSku: 'SKU-1002', productName: 'Pallet wrapping film', quantity: '25.000', unitPrice: '384.50' },
    ],
    user: 'Amina Hassan',
  },
  {
    id: 'shipment-0002',
    number: 'SH-000002',
    orderId: 'so-0002',
    orderNumber: 'SO-000002',
    customerId: 'contact-0003',
    customerName: 'Mariam Adel',
    warehouseId: 'warehouse-0001',
    warehouseName: 'Main Warehouse',
    shipmentDate: isoTimestampInMonth(2, 10, 16),
    lines: [
      { productId: 'prod-0001', productSku: 'SKU-1001', productName: 'Heavy-duty shelving unit', quantity: '5.000', unitPrice: '1250.00' },
    ],
    user: 'Amina Hassan',
  },
  {
    id: 'shipment-0003',
    number: 'SH-000003',
    orderId: 'so-0003',
    orderNumber: 'SO-000003',
    customerId: 'contact-0005',
    customerName: 'Layla Farooq',
    warehouseId: 'warehouse-0002',
    warehouseName: 'East Depot',
    shipmentDate: isoTimestampInMonth(0, 5, 13),
    lines: [
      { productId: 'prod-0003', productSku: 'SKU-1003', productName: 'Barcode scanner, cordless', quantity: '3.000', unitPrice: '2199.99' },
    ],
    user: 'Amina Hassan',
  },
  {
    id: 'shipment-0004',
    number: 'SH-000004',
    orderId: 'so-0004',
    orderNumber: 'SO-000004',
    customerId: 'contact-0007',
    customerName: 'Fatima Rashid',
    warehouseId: 'warehouse-0001',
    warehouseName: 'Main Warehouse',
    shipmentDate: isoTimestampInMonth(1, 14, 9),
    lines: [
      { productId: 'prod-0004', productSku: 'SKU-1004', productName: 'Thermal label roll', quantity: '30.000', unitPrice: '96.00' },
    ],
    user: 'Amina Hassan',
  },
  {
    id: 'shipment-0005',
    number: 'SH-000005',
    orderId: 'so-0008',
    orderNumber: 'SO-000008',
    customerId: 'contact-0009',
    customerName: 'Nadia Hassan',
    warehouseId: 'warehouse-0001',
    warehouseName: 'Main Warehouse',
    shipmentDate: isoTimestampInMonth(0, 14, 10),
    lines: [
      { productId: 'prod-0002', productSku: 'SKU-1002', productName: 'Pallet wrapping film', quantity: '12.000', unitPrice: '384.50' },
    ],
    user: 'Amina Hassan',
  },
  {
    id: 'shipment-0006',
    number: 'SH-000006',
    orderId: 'so-0009',
    orderNumber: 'SO-000009',
    customerId: 'contact-0011',
    customerName: 'Sofia Malik',
    warehouseId: 'warehouse-0002',
    warehouseName: 'East Depot',
    shipmentDate: isoTimestampInMonth(0, 18, 15),
    lines: [
      { productId: 'prod-0003', productSku: 'SKU-1003', productName: 'Barcode scanner, cordless', quantity: '2.000', unitPrice: '2199.99' },
    ],
    user: 'Amina Hassan',
  },
];

/** The sample products. Money stays in decimal-string form throughout (FR-039). */
export const SAMPLE_PRODUCTS: readonly Product[] = [
  {
    id: 'prod-0001',
    sku: 'SKU-1001',
    name: 'Heavy-duty shelving unit',
    category: 'Storage',
    unitOfMeasure: 'each',
    purchasePrice: '850.00',
    sellingPrice: '1250.00',
    lowStockThreshold: '5',
    status: 'ACTIVE',
  },
  {
    id: 'prod-0002',
    sku: 'SKU-1002',
    name: 'Pallet wrapping film',
    category: 'Packaging',
    unitOfMeasure: 'roll',
    purchasePrice: '260.00',
    sellingPrice: '384.50',
    lowStockThreshold: '10',
    status: 'ACTIVE',
  },
  {
    id: 'prod-0003',
    sku: 'SKU-1003',
    name: 'Barcode scanner, cordless',
    category: 'Equipment',
    unitOfMeasure: 'each',
    purchasePrice: '1499.00',
    sellingPrice: '2199.99',
    lowStockThreshold: '3',
    status: 'ACTIVE',
  },
  {
    id: 'prod-0004',
    sku: 'SKU-1004',
    name: 'Thermal label roll',
    category: 'Packaging',
    unitOfMeasure: 'roll',
    purchasePrice: '65.00',
    sellingPrice: '96.00',
    lowStockThreshold: '20',
    status: 'ACTIVE',
  },
  {
    id: 'prod-0005',
    sku: 'SKU-1005',
    name: 'Forklift hire, one week',
    category: 'Services',
    unitOfMeasure: 'week',
    purchasePrice: '1350.00',
    sellingPrice: '1875.00',
    lowStockThreshold: null,
    status: 'DRAFT',
  },
  {
    id: 'prod-0006',
    sku: 'SKU-1006',
    name: 'Steel pallet, galvanised',
    category: 'Storage',
    unitOfMeasure: 'each',
    purchasePrice: '2950.00',
    sellingPrice: '4300.00',
    lowStockThreshold: '8',
    status: 'ACTIVE',
  },
  {
    id: 'prod-0007',
    sku: 'SKU-1007',
    name: 'Safety glove, cut-resistant',
    category: 'PPE',
    unitOfMeasure: 'pair',
    purchasePrice: '420.00',
    sellingPrice: '612.75',
    lowStockThreshold: '15',
    status: 'ACTIVE',
  },
  {
    id: 'prod-0008',
    sku: 'SKU-1008',
    name: 'Racking inspection service',
    category: 'Services',
    unitOfMeasure: 'visit',
    purchasePrice: '520.00',
    sellingPrice: '780.40',
    lowStockThreshold: null,
    status: 'ARCHIVED',
  },
  {
    id: 'prod-0009',
    sku: 'SKU-1009',
    name: 'Obsolete stock write-off',
    category: 'General',
    unitOfMeasure: 'each',
    purchasePrice: '0.00',
    sellingPrice: '0.00',
    lowStockThreshold: null,
    status: 'ARCHIVED',
  },
  {
    id: 'prod-0010',
    sku: 'SKU-1010',
    name: 'Wooden pallet collar',
    category: 'Storage',
    unitOfMeasure: 'each',
    purchasePrice: '95.00',
    sellingPrice: '145.20',
    lowStockThreshold: '12',
    status: 'ACTIVE',
  },
  {
    id: 'prod-0011',
    sku: 'SKU-1011',
    name: 'Reserved: dispatch crate',
    category: 'Storage',
    unitOfMeasure: 'each',
    purchasePrice: '220.00',
    sellingPrice: '308.00',
    lowStockThreshold: '6',
    status: 'DRAFT',
  },
  {
    id: 'prod-0012',
    sku: 'SKU-1012',
    name: 'Consumed: packing tape',
    category: 'Packaging',
    unitOfMeasure: 'roll',
    purchasePrice: '38.00',
    sellingPrice: '57.85',
    lowStockThreshold: '25',
    status: 'ARCHIVED',
  },
];

/** The sample contacts (customers and suppliers). All data is illustrative, not live. */
export const SAMPLE_CONTACTS: readonly Contact[] = [
  {
    id: 'contact-0001',
    code: 'CUST-1001',
    name: 'Amina Hassan',
    role: 'CUSTOMER',
    status: 'ACTIVE',
    email: 'amina.hassan@example.com',
    phone: '+1-555-0101',
    address: '42 Oak Avenue, Apt 3B, Springfield',
  },
  {
    id: 'contact-0002',
    code: 'SUPP-2001',
    name: 'Omar Nabil',
    role: 'SUPPLIER',
    status: 'ACTIVE',
    email: 'omar.nabil@example.com',
    phone: '+1-555-0202',
    address: '18 Maple Road, Suite 100, Riverton',
  },
  {
    id: 'contact-0003',
    code: 'CUST-1002',
    name: 'Mariam Adel',
    role: 'CUSTOMER',
    status: 'ACTIVE',
    email: 'mariam.adel@example.com',
    phone: '+1-555-0303',
    address: '7 Pine Street, Fairview',
  },
  {
    id: 'contact-0004',
    code: 'SUPP-2002',
    name: 'Youssef Samir',
    role: 'SUPPLIER',
    status: 'ACTIVE',
    email: 'youssef.samir@example.com',
    phone: '+1-555-0404',
    address: '55 Cedar Lane, Unit 4, Hillside',
  },
  {
    id: 'contact-0005',
    code: 'CUST-1003',
    name: 'Layla Farooq',
    role: 'CUSTOMER',
    status: 'ARCHIVED',
    email: 'layla.farooq@example.com',
    phone: '+1-555-0505',
    address: '12 Birch Court, Brookside',
  },
  {
    id: 'contact-0006',
    code: 'SUPP-2003',
    name: 'Tariq Mahmood',
    role: 'SUPPLIER',
    status: 'ACTIVE',
    email: 'tariq.mahmood@example.com',
    phone: '+1-555-0606',
    address: '88 Elm Drive, Greenwood',
  },
  {
    id: 'contact-0007',
    code: 'CUST-1004',
    name: 'Fatima Rashid',
    role: 'CUSTOMER',
    status: 'ACTIVE',
    email: 'fatima.rashid@example.com',
    phone: '+1-555-0707',
    address: '31 Spruce Way, Pinecrest',
  },
  {
    id: 'contact-0008',
    code: 'SUPP-2004',
    name: 'Khalid Ismail',
    role: 'SUPPLIER',
    status: 'ARCHIVED',
    email: 'khalid.ismail@example.com',
    phone: '+1-555-0808',
    address: '14 Willow Place, Cedar Falls',
  },
  {
    id: 'contact-0009',
    code: 'CUST-1005',
    name: 'Nadia Hassan',
    role: 'CUSTOMER',
    status: 'ACTIVE',
    email: 'nadia.hassan@example.com',
    phone: '+1-555-0909',
    address: '9 Ash Terrace, Oakwood',
  },
  {
    id: 'contact-0010',
    code: 'SUPP-2005',
    name: 'Rashid Ahmed',
    role: 'SUPPLIER',
    status: 'ACTIVE',
    email: 'rashid.ahmed@example.com',
    phone: '+1-555-1010',
    address: '67 Fir Road, Maple Glen',
  },
  {
    id: 'contact-0011',
    code: 'CUST-1006',
    name: 'Sofia Malik',
    role: 'CUSTOMER',
    status: 'ACTIVE',
    email: 'sofia.malik@example.com',
    phone: '+1-555-1111',
    address: '23 Poplar Lane, Willow Creek',
  },
  {
    id: 'contact-0012',
    code: 'SUPP-2006',
    name: 'Imran Khan',
    role: 'SUPPLIER',
    status: 'ARCHIVED',
    email: 'imran.khan@example.com',
    phone: '+1-555-1212',
    address: '44 Magnolia Blvd, Riverbend',
  },
];

/**
 * The sample invoices: stored fields only. `paid`, `balance` and
 * `paymentsApplied` are derived by the service from the recorded payments, so
 * they can never disagree with them. Drafts are unnumbered (`number: null`,
 * `issueDate: null`); every total equals its order's total exactly.
 *
 * Issuance dates are anchored by month (`isoDateInMonth`) so each Overview
 * period keeps issued invoices to derive from on any day, while the due dates
 * stay relative to the load day: exactly one invoice is overdue today and the
 * future-dated ones stay future regardless of the anchors. The anchors respect
 * the process order (order → shipment → invoice → payment), and on the first
 * days of a month the current-month dates clamp to today in that same order.
 * The statuses cover the whole mapping: ISSUED (incl. one overdue), PAID,
 * PARTIALLY_PAID, a voided issued invoice, a draft and a voided draft.
 */
export const SAMPLE_INVOICES: readonly Invoice[] = [
  {
    id: 'inv-0001',
    number: 'INV-000001',
    orderId: 'so-0001',
    orderNumber: 'SO-000001',
    customerId: 'contact-0001',
    customerName: 'Amina Hassan',
    customerAddress: '42 Oak Avenue, Apt 3B, Springfield',
    warehouseName: 'Main Warehouse',
    status: 'ISSUED',
    issueDate: isoDateInMonth(1, 10),
    dueDate: isoDateDaysFromNow(-10),
    lines: [
      { id: 'inv-0001-line-1', productId: 'prod-0002', productSku: 'SKU-1002', productName: 'Pallet wrapping film', quantity: '25.000', unitPrice: '384.50', lineTotal: '9612.50' },
    ],
    total: '9612.50',
    paid: '0.00',
    balance: '9612.50',
    paymentsApplied: [],
    voidedDate: null,
    voidReason: null,
  },
  {
    id: 'inv-0002',
    number: 'INV-000002',
    orderId: 'so-0002',
    orderNumber: 'SO-000002',
    customerId: 'contact-0003',
    customerName: 'Mariam Adel',
    customerAddress: '7 Pine Street, Fairview',
    warehouseName: 'Main Warehouse',
    status: 'PAID',
    issueDate: isoDateInMonth(2, 12),
    dueDate: isoDateDaysFromNow(5),
    lines: [
      { id: 'inv-0002-line-1', productId: 'prod-0001', productSku: 'SKU-1001', productName: 'Heavy-duty shelving unit', quantity: '5.000', unitPrice: '1250.00', lineTotal: '6250.00' },
    ],
    total: '6250.00',
    paid: '0.00',
    balance: '6250.00',
    paymentsApplied: [],
    voidedDate: null,
    voidReason: null,
  },
  {
    id: 'inv-0003',
    number: 'INV-000003',
    orderId: 'so-0003',
    orderNumber: 'SO-000003',
    customerId: 'contact-0005',
    customerName: 'Layla Farooq',
    customerAddress: '12 Birch Court, Brookside',
    warehouseName: 'East Depot',
    status: 'PARTIALLY_PAID',
    issueDate: isoDateInMonth(0, 9),
    dueDate: isoDateDaysFromNow(16),
    lines: [
      { id: 'inv-0003-line-1', productId: 'prod-0003', productSku: 'SKU-1003', productName: 'Barcode scanner, cordless', quantity: '3.000', unitPrice: '2199.99', lineTotal: '6599.97' },
    ],
    total: '6599.97',
    paid: '0.00',
    balance: '6599.97',
    paymentsApplied: [],
    voidedDate: null,
    voidReason: null,
  },
  {
    id: 'inv-0004',
    number: 'INV-000004',
    orderId: 'so-0004',
    orderNumber: 'SO-000004',
    customerId: 'contact-0007',
    customerName: 'Fatima Rashid',
    customerAddress: '31 Spruce Way, Pinecrest',
    warehouseName: 'Main Warehouse',
    status: 'VOID',
    issueDate: isoDateInMonth(1, 18),
    dueDate: isoDateDaysFromNow(12),
    lines: [
      { id: 'inv-0004-line-1', productId: 'prod-0004', productSku: 'SKU-1004', productName: 'Thermal label roll', quantity: '30.000', unitPrice: '96.00', lineTotal: '2880.00' },
    ],
    total: '2880.00',
    paid: '0.00',
    balance: '2880.00',
    paymentsApplied: [],
    voidedDate: isoDateDaysFromNow(-6),
    voidReason: 'Shipped to the wrong warehouse; the customer re-ordered instead.',
  },
  {
    id: 'inv-0007',
    number: null,
    orderId: 'so-0004',
    orderNumber: 'SO-000004',
    customerId: 'contact-0007',
    customerName: 'Fatima Rashid',
    customerAddress: '31 Spruce Way, Pinecrest',
    warehouseName: 'Main Warehouse',
    status: 'VOID',
    issueDate: null,
    dueDate: isoDateDaysFromNow(20),
    lines: [
      { id: 'inv-0007-line-1', productId: 'prod-0004', productSku: 'SKU-1004', productName: 'Thermal label roll', quantity: '30.000', unitPrice: '96.00', lineTotal: '2880.00' },
    ],
    total: '2880.00',
    paid: '0.00',
    balance: '2880.00',
    paymentsApplied: [],
    voidedDate: isoDateDaysFromNow(-2),
    voidReason: 'Draft raised by mistake before the corrected copy.',
  },
  {
    id: 'inv-0005',
    number: 'INV-000005',
    orderId: 'so-0008',
    orderNumber: 'SO-000008',
    customerId: 'contact-0009',
    customerName: 'Nadia Hassan',
    customerAddress: '9 Ash Terrace, Oakwood',
    warehouseName: 'Main Warehouse',
    status: 'ISSUED',
    issueDate: isoDateInMonth(0, 15),
    dueDate: isoDateDaysFromNow(23),
    lines: [
      { id: 'inv-0005-line-1', productId: 'prod-0002', productSku: 'SKU-1002', productName: 'Pallet wrapping film', quantity: '12.000', unitPrice: '384.50', lineTotal: '4614.00' },
    ],
    total: '4614.00',
    paid: '0.00',
    balance: '4614.00',
    paymentsApplied: [],
    voidedDate: null,
    voidReason: null,
  },
  {
    id: 'inv-0006',
    number: null,
    orderId: 'so-0009',
    orderNumber: 'SO-000009',
    customerId: 'contact-0011',
    customerName: 'Sofia Malik',
    customerAddress: '23 Poplar Lane, Willow Creek',
    warehouseName: 'East Depot',
    status: 'DRAFT',
    issueDate: null,
    dueDate: isoDateDaysFromNow(29),
    lines: [
      { id: 'inv-0006-line-1', productId: 'prod-0003', productSku: 'SKU-1003', productName: 'Barcode scanner, cordless', quantity: '2.000', unitPrice: '2199.99', lineTotal: '4399.98' },
    ],
    total: '4399.98',
    paid: '0.00',
    balance: '4399.98',
    paymentsApplied: [],
    voidedDate: null,
    voidReason: null,
  },
];

/**
 * The sample payments, oldest first so the numbering reads like a ledger. Three
 * are recorded (one partial, on INV-000003) and one was reversed on request —
 * a reversed payment keeps its allocation on record and the invoice's balance
 * is untouched by it, which is the story INV-000005's full balance tells.
 */
export const SAMPLE_PAYMENTS: readonly Payment[] = [
  {
    id: 'pay-0001',
    number: 'PAY-000001',
    customerId: 'contact-0001',
    customerName: 'Amina Hassan',
    date: isoDateInMonth(1, 15),
    method: 'Bank transfer',
    reference: 'TRX-8891',
    amount: '1500.00',
    status: 'RECORDED',
    allocations: [
      { invoiceId: 'inv-0001', invoiceNumber: 'INV-000001', amount: '1500.00' },
    ],
    reversedDate: null,
    reversalReason: null,
  },
  {
    id: 'pay-0002',
    number: 'PAY-000002',
    customerId: 'contact-0003',
    customerName: 'Mariam Adel',
    date: isoDateInMonth(2, 14),
    method: 'Card',
    reference: '',
    amount: '6250.00',
    status: 'RECORDED',
    allocations: [
      { invoiceId: 'inv-0002', invoiceNumber: 'INV-000002', amount: '6250.00' },
    ],
    reversedDate: null,
    reversalReason: null,
  },
  {
    id: 'pay-0003',
    number: 'PAY-000003',
    customerId: 'contact-0005',
    customerName: 'Layla Farooq',
    date: isoDateInMonth(0, 11),
    method: 'Cash',
    reference: 'Receipt 0442',
    amount: '2000.00',
    status: 'RECORDED',
    allocations: [
      { invoiceId: 'inv-0003', invoiceNumber: 'INV-000003', amount: '2000.00' },
    ],
    reversedDate: null,
    reversalReason: null,
  },
  {
    id: 'pay-0004',
    number: 'PAY-000004',
    customerId: 'contact-0009',
    customerName: 'Nadia Hassan',
    date: isoDateInMonth(0, 17),
    method: 'Bank transfer',
    reference: '',
    amount: '1000.00',
    status: 'REVERSED',
    allocations: [
      { invoiceId: 'inv-0005', invoiceNumber: 'INV-000005', amount: '1000.00' },
    ],
    reversedDate: isoDateInMonth(0, 18),
    reversalReason: 'Duplicate entry; the same payment was recorded twice.',
  },
];

/**
 * The organization's invoicing defaults. The Settings screen edits these later;
 * the invoice creation here uses the payment term only.
 */
export const SAMPLE_ORGANIZATION_SETTINGS: readonly OrganizationSettings[] = [
  { defaultPaymentTermDays: 30, currency: 'USD' },
];

/**
 * A helper the sample service needs beside the data: the payment methods the
 * record-payment form offers, verbatim.
 */
export const SAMPLE_PAYMENT_METHODS: readonly PaymentMethod[] = [
  'Cash',
  'Bank transfer',
  'Card',
  'Other',
];

