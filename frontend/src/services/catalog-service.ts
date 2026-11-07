/**
 * The service interface - the seam between the interface and its data (T012).
 *
 * Constitution Principle VI and FR-036: sample data lives in one place and is
 * reached only through this interface. No component imports `src/mocks` and no
 * component decides where its data came from, which is what lets the real REST
 * client replace `sample-catalog-service.ts` later without a component changing
 * (FR-036, FR-037).
 *
 * Every operation is asynchronous and shaped like the call the real client will
 * make: a list returns a page AND a total, a detail returns one record, and a
 * mutation returns a RESULT. The mutation deliberately does not return a
 * committed record - nothing here is posted, issued or immutable, and returning
 * the record would present a sample change as a saved one (Principle III,
 * FR-037).
 *
 * Money is a decimal STRING throughout (FR-039, Principle IV). `DecimalString`
 * is the shared package's own type rather than a local restatement (FR-038).
 */

import type { DecimalString } from '@nexuserp/shared';
import type { PermissionModule } from '@nexuserp/shared';

/** One page of a list, with the total the server counted - never the page's own length. */
export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
}

/**
 * A list request as the server takes it: the page, the size, and an optional
 * sort. Paging is the server's decision, so the interface asks for a page rather
 * than slicing an array it already holds (FR-025).
 */
export interface ListQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly sort?: string;
  readonly direction?: 'asc' | 'desc';
}

/** A value that stands in for a real record so the interface can be reviewed. */
export interface SampleRecord {
  readonly id: string;
  /** An API status name, verbatim. The interface never invents or rewords one (FR-022). */
  readonly status: string;
  readonly name: string;
  /** A decimal string. A JavaScript number would lose precision on an amount (FR-039). */
  readonly amount: DecimalString;
}

/** The input of the one mutation the gallery exercises. */
export interface RemoveRecordInput {
  readonly id: string;
}

/**
 * What a mutation resolves with. A label rather than the removed record, so a
 * caller can name what it removed without being handed something that looks like
 * a committed row (Principle III).
 */
export interface RemoveRecordResult {
  readonly removedLabel: string;
}

export type DashboardPeriod = 'this-month' | 'last-month';

export interface DashboardMetric<T> {
  readonly value: T;
  /**
   * The change against the previous period, or `null` when the sample records
   * cannot support a comparison (no issued invoices in the prior window, for a
   * money metric). A percentage shown next to a value the interface did not
   * derive the same way is exactly the self-contradiction this type now makes
   * inexpressible.
   */
  readonly changeDirection: 'up' | 'down' | null;
  /** Percentage points, one decimal; `null` together with `changeDirection`. */
  readonly changePercent: number | null;
  readonly measure: string;
}

export interface DashboardActivity {
  readonly [key: string]: unknown;
  readonly id: string;
  readonly time: string;
  readonly activity: string;
  readonly category: 'Sales' | 'Orders' | 'Inventory' | 'Invoices' | 'Administration';
  readonly user: string;
  /** Verbatim API status name. */
  readonly status: string;
}

export interface DashboardSummary {
  readonly period: DashboardPeriod;
  readonly sales: DashboardMetric<DecimalString>;
  readonly activeOrders: DashboardMetric<number>;
  readonly lowStockItems: DashboardMetric<number>;
  readonly outstandingInvoices: DashboardMetric<DecimalString>;
  readonly topSellingProducts: readonly { readonly product: string; readonly unitsSold: number }[];
  readonly salesOrdersTrend: readonly {
    readonly date: string;
    readonly sales: DecimalString;
    readonly orders: number;
  }[];
  readonly ordersByStatus: readonly {
    readonly status: 'DRAFT' | 'CONFIRMED' | 'SHIPPED' | 'CANCELLED';
    readonly count: number;
  }[];
  readonly recentActivity: readonly DashboardActivity[];
  readonly empty: boolean;
}

export interface DashboardQuerySwitches {
  /** Returns an honest first-use result with no dashboard records. */
  readonly empty: boolean;
}

/** A product in the catalogue. Money fields are decimal strings, never numbers. */
export interface Product {
  readonly id: string;
  /** Stock-keeping unit. Unique within the catalogue, case-insensitive. */
  readonly sku: string;
  readonly name: string;
  readonly category: string;
  readonly unitOfMeasure: string;
  readonly purchasePrice: DecimalString;
  readonly sellingPrice: DecimalString;
  /** Optional reorder threshold. When stock is at or below this, the item is low stock. */
  readonly lowStockThreshold: DecimalString | null;
  /** Product lifecycle status. */
  readonly status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
}

/** A product list request: search, category and status filters, sort, and pagination. */
export interface ProductQuery {
  readonly search?: string;
  readonly category?: string;
  readonly status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  readonly page: number;
  readonly pageSize: number;
  readonly sort?: string;
  readonly direction?: 'asc' | 'desc';
}

/** One page of products, with the total the server counted. */
export interface ProductPage {
  readonly items: readonly Product[];
  readonly total: number;
}

/** The result of a product mutation. A label, never the record itself. */
export interface ProductMutationResult {
  readonly removedLabel: string;
}

/** The input for archiving a product. */
export interface ArchiveProductInput {
  readonly id: string;
}

/** A contact (customer or supplier). Money fields are decimal strings, never numbers. */
export interface Contact {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly role: 'CUSTOMER' | 'SUPPLIER';
  readonly status: 'ACTIVE' | 'ARCHIVED';
  readonly email: string;
  readonly phone: string;
  readonly address: string;
}

/** A contact list request: search, role and status filters, sort, and pagination. */
export interface ContactQuery {
  readonly search?: string;
  readonly role?: 'CUSTOMER' | 'SUPPLIER';
  readonly status?: 'ACTIVE' | 'ARCHIVED';
  readonly page: number;
  readonly pageSize: number;
  readonly sort?: string;
  readonly direction?: 'asc' | 'desc';
}

/** One page of contacts, with the total the server counted. */
export interface ContactPage {
  readonly items: readonly Contact[];
  readonly total: number;
}

/** The result of a contact mutation. A label, never the record itself. */
export interface ContactMutationResult {
  readonly removedLabel: string;
}

/** The input for archiving a contact. */
export interface ArchiveContactInput {
  readonly id: string;
}

/**
 * The interface the sample implementation satisfies today and the REST client
 * satisfies later. It stays focused on the dashboard summary and the list,
 * detail, and mutation operations the shell and gallery exercise.
 */
export interface CatalogService {
  getDashboardSummary(period: DashboardPeriod): Promise<DashboardSummary>;
  listRecords(query: ListQuery): Promise<Page<SampleRecord>>;
  getRecord(id: string): Promise<SampleRecord>;
  /** Removes the sample row in memory; resolves with the removed record's label
   *  so a toast can name it (FR-068). */
  removeRecord(input: RemoveRecordInput): Promise<RemoveRecordResult>;
  /** Lists products with search, category and status filters, sort and pagination. */
  listProducts(query: ProductQuery): Promise<ProductPage>;
  /** Returns one product by id. */
  getProduct(id: string): Promise<Product>;
  /** Creates a product. Resolves with the created product's sku. */
  createProduct(input: Omit<Product, 'id'>): Promise<{ readonly sku: string }>;
  /** Updates a product. Resolves with the updated product's sku. */
  updateProduct(input: Product): Promise<{ readonly sku: string }>;
  /** Archives a product. Refuses with PRODUCT_IN_USE when open documents reference it. */
  archiveProduct(input: ArchiveProductInput): Promise<ProductMutationResult>;
  /** Lists contacts with search, role and status filters, sort and pagination. */
  listContacts(query: ContactQuery): Promise<ContactPage>;
  /** Returns one contact by id. */
  getContact(id: string): Promise<Contact>;
  /** Creates a contact. Resolves with the created contact's code. */
  createContact(input: Omit<Contact, 'id'>): Promise<{ readonly code: string }>;
  /** Updates a contact. Resolves with the updated contact's code. */
  updateContact(input: Contact): Promise<{ readonly code: string }>;
  /** Archives a contact. Refuses with CONTACT_IN_USE when open documents reference it. */
  archiveContact(input: ArchiveContactInput): Promise<ContactMutationResult>;
  /** Restores an archived contact. */
  restoreContact(input: ArchiveContactInput): Promise<ContactMutationResult>;
  /** Lists warehouses. */
  listWarehouses(): Promise<readonly Warehouse[]>;
  /** Returns one warehouse by id. */
  getWarehouse(id: string): Promise<Warehouse>;
  /** Creates a warehouse. Resolves with the created warehouse's code. */
  createWarehouse(input: CreateWarehouseInput): Promise<{ readonly code: string }>;
  /** Updates a warehouse. Resolves with the updated warehouse's code. */
  updateWarehouse(input: UpdateWarehouseInput): Promise<{ readonly code: string }>;
  /** Deactivates a warehouse. Refuses with INSUFFICIENT_STOCK when it holds stock,
   *  or with CONFLICT when it is the default warehouse. */
  deactivateWarehouse(id: string): Promise<WarehouseMutationResult>;
  /** Lists stock balances with search, warehouse and low-stock filters, sort and paging. */
  listStockBalances(query: StockBalanceQuery): Promise<StockBalancePage>;
  /** Lists movements with product, warehouse, type and date-range filters, sort and paging. */
  listMovements(query: MovementQuery): Promise<MovementPage>;
  /** Posts a stock adjustment movement. Idempotency key prevents duplicate posting. */
  postAdjustment(input: PostAdjustmentInput): Promise<PostAdjustmentResult>;
  /** Returns the count of stock balances at or below their reorder level. */
  getLowStockCount(): Promise<number>;
  /** Lists purchase orders with search, status filter, sort and pagination. */
  listPurchaseOrders(query: PurchaseOrderQuery): Promise<PurchaseOrderPage>;
  /** Returns one purchase order by id. */
  getPurchaseOrder(id: string): Promise<PurchaseOrder>;
  /** Creates a purchase order as a draft. Resolves with the assigned number. */
  createPurchaseOrder(input: CreatePurchaseOrderInput): Promise<{ readonly id: string; readonly number: string }>;
  /** Updates a draft purchase order. Refused for any other status. */
  updatePurchaseOrder(input: UpdatePurchaseOrderInput): Promise<{ readonly number: string }>;
  /** Confirms a draft purchase order. A confirmed order can no longer be edited. */
  confirmPurchaseOrder(id: string): Promise<PurchaseOrderActionResult>;
  /** Cancels a purchase order. Refused once any goods were received. */
  cancelPurchaseOrder(id: string): Promise<PurchaseOrderActionResult>;
  /** Posts a goods receipt. Idempotency key prevents duplicate posting. */
  receiveGoods(input: ReceiveGoodsInput): Promise<ReceiveGoodsResult>;
  /** Lists goods receipts with search and a date-range filter, sort and pagination. */
  listGoodsReceipts(query: GoodsReceiptQuery): Promise<GoodsReceiptPage>;
  /** Lists sales orders with search (number or customer), status filter, sort and pagination. */
  listSalesOrders(query: SalesOrderQuery): Promise<SalesOrderPage>;
  /** Returns one sales order by id. */
  getSalesOrder(id: string): Promise<SalesOrder>;
  /** Creates a sales order as a draft. Resolves with the assigned number. */
  createSalesOrder(input: CreateSalesOrderInput): Promise<{ readonly id: string; readonly number: string }>;
  /** Updates a draft sales order. Refused for any other status. */
  updateSalesOrder(input: UpdateSalesOrderInput): Promise<{ readonly number: string }>;
  /** Confirms a draft sales order. Re-checks availability on the spot, all or nothing. */
  confirmSalesOrder(input: ConfirmSalesOrderInput): Promise<SalesOrderActionResult>;
  /** Cancels a sales order. A confirmed order's reservations are released. */
  cancelSalesOrder(id: string): Promise<SalesOrderActionResult>;
  /** Ships a confirmed sales order in full. Idempotency key prevents duplicate shipping. */
  shipSalesOrder(input: ShipSalesOrderInput): Promise<ShipSalesOrderResult>;
  /** Lists shipments with search and a date-range filter, sort and pagination. */
  listShipments(query: ShipmentQuery): Promise<ShipmentPage>;
  /** Lists invoices with search (number or customer), status, overdue-only filter,
   *  sort and pagination. */
  listInvoices(query: InvoiceQuery): Promise<InvoicePage>;
  /** Returns one invoice by id. */
  getInvoice(id: string): Promise<Invoice>;
  /** Lists the shipped orders that have no non-void invoice, the candidates the
   *  Create Invoice dialog offers. */
  listInvoicableOrders(): Promise<readonly InvoicableOrder[]>;
  /** Creates a draft invoice from a shipped order. Idempotency key prevents
   *  duplicate drafts. The number stays unassigned until the invoice is issued. */
  createInvoiceFromOrder(input: CreateInvoiceFromOrderInput): Promise<CreateInvoiceFromOrderResult>;
  /** Updates a draft invoice's due date. Refused for any other status. */
  updateInvoiceDueDate(input: UpdateInvoiceDueDateInput): Promise<{ readonly dueDate: string }>;
  /** Issues a draft invoice: assigns the document number and fixes its dates.
   *  Idempotency key prevents double issuing. */
  issueInvoice(input: IssueInvoiceInput): Promise<IssueInvoiceResult>;
  /** Voids a draft invoice, or an issued one with no non-reversed payments applied. */
  voidInvoice(input: VoidInvoiceInput): Promise<VoidInvoiceResult>;
  /** Lists payments with search (number or customer), status, date-range filter,
   *  sort and pagination. */
  listPayments(query: PaymentQuery): Promise<PaymentPage>;
  /** Returns one payment by id. */
  getPayment(id: string): Promise<Payment>;
  /** Records a payment and allocates it across open invoices. Idempotency key
   *  prevents duplicate recording; balances are re-checked at posting time. */
  recordPayment(input: RecordPaymentInput): Promise<RecordPaymentResult>;
  /** Reverses a recorded payment. A reversed payment cannot be reversed again. */
  reversePayment(input: ReversePaymentInput): Promise<ReversePaymentResult>;
  /** Lists the open (balance above zero) invoices of one customer, oldest first. */
  listOpenInvoicesForCustomer(customerId: string): Promise<readonly OpenInvoice[]>;
  /** Lists the customers that have at least one open invoice. */
  listOpenInvoiceCustomers(): Promise<readonly OpenInvoiceCustomer[]>;
  /** The organization's invoicing settings: default payment term and currency. */
  getOrganizationSettings(): Promise<OrganizationSettings>;
  getOrganization(): Promise<Organization>;
  updateOrganizationSettings(input: UpdateOrganizationSettingsInput): Promise<Organization>;
  listModules(): Promise<readonly ModuleSetting[]>;
  toggleModule(input: ToggleModuleInput): Promise<ModuleSetting>;
  listUsers(query: UserQuery): Promise<UserPage>;
  getUser(id: string): Promise<SampleUser>;
  createUser(input: CreateUserInput): Promise<{ readonly id: string; readonly name: string }>;
  updateUserRoles(input: UpdateUserRolesInput): Promise<{ readonly name: string; readonly permissionCount: number }>;
  deactivateUser(id: string): Promise<{ readonly name: string }>;
  reactivateUser(id: string): Promise<{ readonly name: string }>;
  listRoles(): Promise<readonly SampleRole[]>;
  getRole(id: string): Promise<SampleRole>;
  createRole(input: CreateRoleInput): Promise<{ readonly id: string; readonly name: string }>;
  updateRolePermissions(input: UpdateRolePermissionsInput): Promise<{ readonly name: string }>;
  deleteRole(id: string): Promise<{ readonly name: string }>;
  listPermissions(): Promise<readonly PermissionGroup[]>;
  listAuditEntries(query: AuditQuery): Promise<AuditPage>;
  getAuditEntry(id: string): Promise<AuditEntry>;
}

/** A warehouse. */
export interface Warehouse {
  [key: string]: unknown;
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly isDefault: boolean;
  readonly status: 'ACTIVE' | 'INACTIVE';
}

/** Input for creating a warehouse. */
export interface CreateWarehouseInput {
  readonly code: string;
  readonly name: string;
  readonly isDefault: boolean;
}

/** Input for updating a warehouse. */
export interface UpdateWarehouseInput {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly isDefault: boolean;
  readonly status: 'ACTIVE' | 'INACTIVE';
}

/** The result of a warehouse mutation. A label, never the record itself. */
export interface WarehouseMutationResult {
  readonly removedLabel: string;
}

/** A derived stock balance. On hand is the sum of movements; available is on hand minus reserved. */
export interface StockBalance {
  [key: string]: unknown;
  readonly productId: string;
  readonly productSku: string;
  readonly productName: string;
  readonly warehouseId: string;
  readonly warehouseName: string;
  /** Sum of all movement quantities for this product/warehouse, 3 decimal places. */
  readonly onHand: DecimalString;
  /** Reserved quantity from sample data, 3 decimal places. */
  readonly reserved: DecimalString;
  /** onHand minus reserved, 3 decimal places. */
  readonly available: DecimalString;
  /** Reorder level from the product's lowStockThreshold, or null. */
  readonly reorderLevel: DecimalString | null;
}

/** A stock balance list request. */
export interface StockBalanceQuery {
  readonly search?: string;
  readonly warehouseId?: string;
  readonly lowStockOnly?: boolean;
  readonly page: number;
  readonly pageSize: number;
  readonly sort?: string;
  readonly direction?: 'asc' | 'desc';
}

/** One page of stock balances. */
export interface StockBalancePage {
  readonly items: readonly StockBalance[];
  readonly total: number;
}

/** A stock movement type. */
export type MovementType = 'RECEIPT' | 'SHIPMENT' | 'ADJUSTMENT';

/** A stock movement. */
export interface Movement {
  [key: string]: unknown;
  readonly id: string;
  /** Document number such as GR-000012, SH-000007, ADJ-000003, OPEN-000001. */
  readonly source: string;
  readonly type: MovementType;
  readonly productId: string;
  readonly productSku: string;
  readonly productName: string;
  readonly warehouseId: string;
  readonly warehouseName: string;
  /** Signed quantity: positive for RECEIPT, negative for SHIPMENT/ADJUSTMENT removal, 3 decimal places. */
  readonly quantity: DecimalString;
  readonly reason: string;
  readonly user: string;
  readonly createdAt: string;
}

/** A movements list request. */
export interface MovementQuery {
  readonly search?: string;
  readonly warehouseId?: string;
  readonly type?: MovementType;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly page: number;
  readonly pageSize: number;
  readonly sort?: string;
  readonly direction?: 'asc' | 'desc';
}

/** One page of movements. */
export interface MovementPage {
  readonly items: readonly Movement[];
  readonly total: number;
}

/** An adjustment reason. */
export type AdjustmentReason = 'Damage' | 'Loss' | 'Found' | 'Count correction' | 'Other';

/** Input for posting a stock adjustment. */
export interface PostAdjustmentInput {
  readonly idempotencyKey: string;
  readonly productId: string;
  readonly warehouseId: string;
  /** Signed quantity: positive adds stock, negative removes stock, 3 decimal places. */
  readonly quantity: DecimalString;
  readonly reason: AdjustmentReason;
  readonly note: string;
}

/** The result of posting an adjustment. */
export interface PostAdjustmentResult {
  readonly source: string;
  readonly movement: Movement;
}

/** The lifecycle status of a purchase order, verbatim API names. */
export type PurchaseOrderStatus =
  | 'DRAFT'
  | 'CONFIRMED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CANCELLED';

/** One line of a purchase order. Received and outstanding are derived from the receipts. */
export interface PurchaseOrderLine {
  readonly id: string;
  readonly productId: string;
  readonly productSku: string;
  readonly productName: string;
  /** Ordered quantity, 3 decimal places. */
  readonly quantity: DecimalString;
  /** Quantity received on goods receipts so far, 3 decimal places. */
  readonly received: DecimalString;
  /** Ordered minus received, 3 decimal places. */
  readonly outstanding: DecimalString;
  /** Unit cost, up to 4 decimal places. */
  readonly unitCost: DecimalString;
  /** quantity x unit cost, rounded half-up to 2 decimal places. */
  readonly lineTotal: DecimalString;
}

/**
 * A purchase order (sample data only). The backend contract must match: the
 * received and outstanding quantities and every total are derived values, and
 * money is a decimal string throughout.
 */
export interface PurchaseOrder {
  readonly id: string;
  /** Document number such as PO-000001, assigned by the service. */
  readonly number: string;
  readonly supplierId: string;
  readonly supplierName: string;
  readonly warehouseId: string;
  readonly warehouseName: string;
  readonly status: PurchaseOrderStatus;
  /** Order date, YYYY-MM-DD. */
  readonly orderDate: string;
  /** Optional expected delivery date, YYYY-MM-DD. */
  readonly expectedDate: string | null;
  readonly notes: string;
  readonly lines: readonly PurchaseOrderLine[];
  readonly total: DecimalString;
}

/** A purchase order list request: search, status filter, sort and pagination. */
export interface PurchaseOrderQuery {
  readonly search?: string;
  readonly status?: PurchaseOrderStatus;
  readonly page: number;
  readonly pageSize: number;
  readonly sort?: string;
  readonly direction?: 'asc' | 'desc';
}

/** One page of purchase orders. */
export interface PurchaseOrderPage {
  readonly items: readonly PurchaseOrder[];
  readonly total: number;
}

/** A line as the caller submits it: product, quantity and unit cost. */
export interface PurchaseOrderLineInput {
  readonly productId: string;
  readonly quantity: DecimalString;
  readonly unitCost: DecimalString;
}

/** Input for creating a purchase order. The number and status are assigned by the service. */
export interface CreatePurchaseOrderInput {
  readonly supplierId: string;
  readonly warehouseId: string;
  readonly orderDate: string;
  readonly expectedDate: string | null;
  readonly notes: string;
  readonly lines: readonly PurchaseOrderLineInput[];
}

/** Input for updating a purchase order. Refused unless the order is still a draft. */
export interface UpdatePurchaseOrderInput extends CreatePurchaseOrderInput {
  readonly id: string;
}

/** What a purchase-order lifecycle action resolves with: the document number and the new status. */
export interface PurchaseOrderActionResult {
  readonly number: string;
  readonly status: PurchaseOrderStatus;
}

/** Input for posting a goods receipt against a purchase order. */
export interface ReceiveGoodsInput {
  readonly idempotencyKey: string;
  readonly orderId: string;
  /** Per-line quantities to receive now; a line absent from the list receives nothing. */
  readonly quantities: readonly { readonly lineId: string; readonly quantity: DecimalString }[];
}

/** The result of posting a goods receipt. */
export interface ReceiveGoodsResult {
  readonly number: string;
  readonly status: PurchaseOrderStatus;
}

/** A goods receipt. Permanent: it increases stock and cannot be edited or deleted. */
export interface GoodsReceipt {
  readonly id: string;
  /** Document number such as GR-000001, assigned by the service. */
  readonly number: string;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly supplierId: string;
  readonly supplierName: string;
  readonly warehouseId: string;
  readonly warehouseName: string;
  /** Receipt timestamp, ISO. */
  readonly receiptDate: string;
  readonly lines: readonly {
    readonly lineId: string;
    readonly productId: string;
    readonly productSku: string;
    readonly productName: string;
    readonly quantity: DecimalString;
    readonly unitCost: DecimalString;
  }[];
  readonly user: string;
}

/** A goods receipt list request: search and a date range. */
export interface GoodsReceiptQuery {
  readonly search?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly page: number;
  readonly pageSize: number;
  readonly sort?: string;
  readonly direction?: 'asc' | 'desc';
}

/** One page of goods receipts. */
export interface GoodsReceiptPage {
  readonly items: readonly GoodsReceipt[];
  readonly total: number;
}

/**
 * The lifecycle status of a sales order, verbatim API names.
 *
 * Agrees with the design master file's badge table: DRAFT, CONFIRMED, SHIPPED
 * and CANCELLED are existing tones, so the sales documents reuse them without
 * a mapping change.
 */
export type SalesOrderStatus = 'DRAFT' | 'CONFIRMED' | 'SHIPPED' | 'CANCELLED';

/** One line of a sales order. There is no fulfilment state: one shipment ships the whole order. */
export interface SalesOrderLine {
  readonly id: string;
  readonly productId: string;
  readonly productSku: string;
  readonly productName: string;
  /** Ordered quantity, 3 decimal places. */
  readonly quantity: DecimalString;
  /** Unit price, up to 4 decimal places. */
  readonly unitPrice: DecimalString;
  /** quantity x unit price, rounded half-up to 2 decimal places. */
  readonly lineTotal: DecimalString;
}

/**
 * A sales order (sample data only). The backend contract must match: every
 * total is a derived value, reserved is derived from the status (equal to the
 * line quantity while confirmed, zero otherwise), and money is a decimal
 * string throughout.
 */
export interface SalesOrder {
  readonly id: string;
  /** Document number such as SO-000001, assigned by the service. */
  readonly number: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly warehouseId: string;
  readonly warehouseName: string;
  readonly status: SalesOrderStatus;
  /** Order date, YYYY-MM-DD. */
  readonly orderDate: string;
  readonly notes: string;
  readonly lines: readonly SalesOrderLine[];
  readonly total: DecimalString;
}

/** A sales order list request: search (number or customer), status filter, sort and pagination. */
export interface SalesOrderQuery {
  readonly search?: string;
  readonly status?: SalesOrderStatus;
  readonly page: number;
  readonly pageSize: number;
  readonly sort?: string;
  readonly direction?: 'asc' | 'desc';
}

/** One page of sales orders. */
export interface SalesOrderPage {
  readonly items: readonly SalesOrder[];
  readonly total: number;
}

/** A line as the caller submits it: product, quantity and unit price. */
export interface SalesOrderLineInput {
  readonly productId: string;
  readonly quantity: DecimalString;
  readonly unitPrice: DecimalString;
}

/** Input for creating a sales order. The number and status are assigned by the service. */
export interface CreateSalesOrderInput {
  readonly customerId: string;
  readonly warehouseId: string;
  readonly orderDate: string;
  readonly notes: string;
  readonly lines: readonly SalesOrderLineInput[];
}

/** Input for updating a sales order. Refused unless the order is still a draft. */
export interface UpdateSalesOrderInput extends CreateSalesOrderInput {
  readonly id: string;
}

/** Input for confirming a sales order; the key is generated when the dialog opens. */
export interface ConfirmSalesOrderInput {
  readonly orderId: string;
  readonly idempotencyKey: string;
}

/** Input for shipping a sales order; the key is generated when the dialog opens. */
export interface ShipSalesOrderInput {
  readonly orderId: string;
  readonly idempotencyKey: string;
}

/** What a sales-order lifecycle action resolves with: the document number and the new status. */
export interface SalesOrderActionResult {
  readonly number: string;
  readonly status: SalesOrderStatus;
}

/** The result of shipping a sales order; the toast names the shipment. */
export interface ShipSalesOrderResult {
  readonly number: string;
  readonly status: SalesOrderStatus;
  readonly shipmentNumber: string;
}

/**
 * A shipment. Permanent: stock has left, the reservation is consumed, and a
 * shipment cannot be edited or deleted.
 */
export interface Shipment {
  readonly id: string;
  /** Document number such as SH-000001, assigned by the service. */
  readonly number: string;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly warehouseId: string;
  readonly warehouseName: string;
  /** Shipment timestamp, ISO. */
  readonly shipmentDate: string;
  /** Each line ships its full ordered quantity: one shipment ships the whole order. */
  readonly lines: readonly {
    readonly productId: string;
    readonly productSku: string;
    readonly productName: string;
    readonly quantity: DecimalString;
    readonly unitPrice: DecimalString;
  }[];
  readonly user: string;
}

/** A shipment list request: search and a date range. */
export interface ShipmentQuery {
  readonly search?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly page: number;
  readonly pageSize: number;
  readonly sort?: string;
  readonly direction?: 'asc' | 'desc';
}

/** One page of shipments. */
export interface ShipmentPage {
  readonly items: readonly Shipment[];
  readonly total: number;
}

// --- Invoicing ----------------------------------------------------------------
/**
 * The invoice and payment vocabulary. No shared type for this domain exists in
 * `@nexuserp/shared` yet, so the types are defined here beside the seam; **the
 * backend contract must match them** when the REST client arrives (FR-036,
 * FR-037) — the same pattern the sales/purchasing types follow.
 *
 * Money fields are decimal strings of scale 2. Balances are derived values:
 * `balance = total − Σ allocations belonging to non-reversed payments`, computed
 * in scaled-integer hundredths by the service, never in floating point.
 */

/** The invoice statuses, verbatim API names (MASTER.md Status Badge Mapping). */
export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'VOID';

/** The payment statuses, verbatim API names. */
export type PaymentStatus = 'RECORDED' | 'REVERSED';

/** The payment methods the record-payment form offers. */
export type PaymentMethod = 'Cash' | 'Bank transfer' | 'Card' | 'Other';

/** One line of an invoice, copied from the sales order at draft creation. */
export interface InvoiceLine {
  readonly id: string;
  readonly productId: string;
  readonly productSku: string;
  readonly productName: string;
  readonly quantity: DecimalString;
  readonly unitPrice: DecimalString;
  readonly lineTotal: DecimalString;
}

/** One payment's allocation to one invoice, as the invoice detail shows it. */
export interface InvoiceAllocation {
  readonly paymentId: string;
  /** Null never happens for a recorded payment; kept optional-typed because a
   *  draft invoice has no number and a payment can only apply to issued ones. */
  readonly paymentNumber: string;
  readonly paymentDate: string;
  readonly amount: DecimalString;
  /** Verbatim status of the owning payment, so a reversed allocation is visible
   *  on the invoice without colour alone (its label says Reversed). */
  readonly paymentStatus: PaymentStatus;
}

/**
 * An invoice. Drafts are unnumbered (`number` null) and unissued (`issueDate`
 * null); issuing assigns the number and stamps the issue date. `paid` is the
 * sum of allocations from non-reversed payments and `balance` is `total − paid`,
 * both derived by the service rather than stored separately.
 */
export interface Invoice {
  readonly id: string;
  readonly number: string | null;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly customerAddress: string;
  readonly warehouseName: string;
  readonly status: InvoiceStatus;
  readonly issueDate: string | null;
  readonly dueDate: string;
  readonly lines: readonly InvoiceLine[];
  readonly total: DecimalString;
  readonly paid: DecimalString;
  readonly balance: DecimalString;
  /** The payments that applied to this invoice, latest allocation first. */
  readonly paymentsApplied: readonly InvoiceAllocation[];
  readonly voidedDate: string | null;
  readonly voidReason: string | null;
}

/** An invoice list request: search, status, overdue-only filter, sort, pagination. */
export interface InvoiceQuery {
  readonly search?: string;
  readonly status?: InvoiceStatus;
  readonly overdueOnly?: boolean;
  readonly page: number;
  readonly pageSize: number;
  readonly sort?: string;
  readonly direction?: 'asc' | 'desc';
}

/** One page of invoices, with the total of the whole set. */
export interface InvoicePage {
  readonly items: readonly Invoice[];
  readonly total: number;
}

/** A shipped order that has no non-void invoice, as the Create Invoice dialog offers it. */
export interface InvoicableOrder {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly total: DecimalString;
}

/** Input for creating a draft invoice from a shipped order; the key is generated when the dialog opens. */
export interface CreateInvoiceFromOrderInput {
  readonly orderId: string;
  readonly idempotencyKey: string;
}

/** What creating a draft resolves with: the detail route's id and the term-derived due date. */
export interface CreateInvoiceFromOrderResult {
  readonly id: string;
  readonly status: 'DRAFT';
  readonly dueDate: string;
}

/** Input for editing a draft invoice's due date. */
export interface UpdateInvoiceDueDateInput {
  readonly id: string;
  readonly dueDate: string;
}

/** Input for issuing a draft invoice; the key is generated when the dialog opens. */
export interface IssueInvoiceInput {
  readonly id: string;
  readonly idempotencyKey: string;
}

/** What issuing resolves with: the assigned number and the invoice's due date. */
export interface IssueInvoiceResult {
  readonly number: string;
  readonly dueDate: string;
}

/** Input for voiding an invoice; the reason is required and recorded. */
export interface VoidInvoiceInput {
  readonly id: string;
  readonly reason: string;
  readonly idempotencyKey: string;
}

/** What voiding resolves with: the number (drafts may never have had one) and the status. */
export interface VoidInvoiceResult {
  readonly number: string | null;
  readonly status: 'VOID';
}

/** One allocation the record-payment form posts. */
export interface RecordPaymentAllocationInput {
  readonly invoiceId: string;
  readonly amount: DecimalString;
  /** Balance observed by the form; the service rejects stale screens. */
  readonly expectedBalance?: DecimalString;
}

/** Input for recording a payment; the key is generated when the form opens. */
export interface RecordPaymentInput {
  readonly idempotencyKey: string;
  readonly customerId: string;
  readonly date: string;
  readonly method: PaymentMethod;
  /** Optional free-text reference, '' when absent. */
  readonly reference: string;
  readonly amount: DecimalString;
  readonly allocations: readonly RecordPaymentAllocationInput[];
}

/** What recording resolves with: the detail route's id and the assigned number. */
export interface RecordPaymentResult {
  readonly id: string;
  readonly number: string;
}

/** Input for reversing a payment; the reason is required and recorded. */
export interface ReversePaymentInput {
  readonly paymentId: string;
  readonly reason: string;
  readonly idempotencyKey: string;
}

/** What reversing resolves with: the number and the resulting status. */
export interface ReversePaymentResult {
  readonly number: string;
  readonly status: 'REVERSED';
}

/** One allocation stored on a payment. */
export interface PaymentAllocation {
  readonly invoiceId: string;
  readonly invoiceNumber: string | null;
  readonly amount: DecimalString;
}

/** A payment. Payments are never edited or deleted; a reversal only marks and records. */
export interface Payment {
  readonly id: string;
  readonly number: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly date: string;
  readonly method: PaymentMethod;
  readonly reference: string;
  readonly amount: DecimalString;
  readonly status: PaymentStatus;
  readonly allocations: readonly PaymentAllocation[];
  readonly reversedDate: string | null;
  readonly reversalReason: string | null;
}

/** A payments list request: search, status, date range, sort, pagination. */
export interface PaymentQuery {
  readonly search?: string;
  readonly status?: PaymentStatus;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly page: number;
  readonly pageSize: number;
  readonly sort?: string;
  readonly direction?: 'asc' | 'desc';
}

/** One page of payments, with the total of the whole set. */
export interface PaymentPage {
  readonly items: readonly Payment[];
  readonly total: number;
}

/** The open-invoice summary the record-payment form's table shows per row. */
export interface OpenInvoice {
  readonly id: string;
  readonly number: string | null;
  readonly issueDate: string;
  readonly dueDate: string;
  readonly total: DecimalString;
  readonly paid: DecimalString;
  readonly balance: DecimalString;
  readonly status: InvoiceStatus;
}

/** A customer that has at least one open invoice, as the payment form's select offers them. */
export interface OpenInvoiceCustomer {
  readonly customerId: string;
  readonly customerName: string;
}

/** The organization's invoicing defaults. The Settings screen edits these later. */
export interface OrganizationSettings {
  readonly defaultPaymentTermDays: number;
  readonly currency: string;
}

/** Sample-facing contract additions; the backend contract must match these shapes. */
export interface Organization extends OrganizationSettings { readonly id: string; readonly name: string; readonly currencyLocked: boolean; }
export interface UpdateOrganizationSettingsInput { readonly name: string; readonly currency: string; readonly defaultPaymentTermDays: number; }
export type ModuleKey = 'inventory' | 'purchasing' | 'sales' | 'invoicing' | 'reports' | 'contacts' | 'products' | 'settings' | 'audit';
export interface ModuleSetting { readonly key: ModuleKey; readonly label: string; readonly enabled: boolean; readonly locked: boolean; readonly description: string; }
export interface ToggleModuleInput { readonly key: ModuleKey; readonly enabled: boolean; }
export type UserStatus = 'USER_ACTIVE' | 'USER_DEACTIVATED';
export interface SampleUser { readonly id: string; readonly name: string; readonly email: string; readonly roleIds: readonly string[]; readonly status: UserStatus; readonly passwordChangeRequired: boolean; readonly createdAt: string; }
export interface UserQuery { readonly search?: string; readonly roleId?: string; readonly status?: UserStatus; readonly page: number; readonly pageSize: number; readonly sort?: string; readonly direction?: 'asc' | 'desc'; }
export interface UserPage { readonly items: readonly SampleUser[]; readonly total: number; }
export interface CreateUserInput { readonly name: string; readonly email: string; readonly initialPassword: string; readonly roleIds: readonly string[]; }
export interface UpdateUserRolesInput { readonly id: string; readonly roleIds: readonly string[]; }
export interface SampleRole { readonly id: string; readonly name: string; readonly description: string; readonly permissions: readonly string[]; readonly system: boolean; }
export interface CreateRoleInput { readonly name: string; readonly permissions: readonly string[]; }
export interface UpdateRolePermissionsInput { readonly id: string; readonly permissions: readonly string[]; }
export interface PermissionGroup { readonly module: PermissionModule; readonly label: string; readonly permissions: readonly { readonly code: string; readonly description: string; }[]; }
export interface AuditChange { readonly field: string; readonly before: string; readonly after: string; }
export interface AuditEntry { readonly id: string; readonly time: string; readonly userId: string | null; readonly userName: string; readonly action: string; readonly actionLabel: string; readonly recordType: string; readonly recordId: string | null; readonly recordNumber: string; readonly summary: string; readonly changes: readonly AuditChange[]; }
export interface AuditQuery { readonly startDate?: string; readonly endDate?: string; readonly userId?: string; readonly action?: string; readonly recordType?: string; readonly search?: string; readonly page: number; readonly pageSize: number; }
export interface AuditPage { readonly items: readonly AuditEntry[]; readonly total: number; }
