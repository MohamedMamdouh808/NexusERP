/**
 * The service interface - the seam between the interface and its data (T012).
 *
 * Constitution Principle VI and FR-036: every screen reaches its data through a
 * typed client, so no component decides where its data came from. The real REST
 * clients (`*-client.ts`) are the only production data sources; the development
 * gallery keeps its own fixtures under `src/dev/gallery/`.
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

/**
 * The catalogue's product types no longer live here.
 *
 * The products are a real domain now: the service answers them, and the product
 * screens read them through `services/products-client.ts`. The demonstration modules
 * that still need a product of their own use `mocks/sample-products.ts`, which is
 * honest about being a demonstration list rather than pretending to be the
 * catalogue.
 */

/**
 * A contact (customer or supplier) as the SAMPLE modules still describe one.
 *
 * The Contacts domain itself is real now and reads `services/contacts-client.ts`;
 * this shape stays only because the sample sales, purchasing and invoicing
 * modules name their customers and suppliers with it.
 */
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

/**
 * The interface the sample implementation satisfies today and the REST client
 * satisfies later. It stays focused on the dashboard summary and the list,
 * detail, and mutation operations the shell and gallery exercise.
 *
 * Contacts are NOT part of it: the Contacts domain is real and reads the
 * service through `services/contacts-client.ts`, so a mock contact method here
 * would be a second, lying answer to the same question.
 */
export interface CatalogService {
  listRecords(query: ListQuery): Promise<Page<SampleRecord>>;
  getRecord(id: string): Promise<SampleRecord>;
  /** Removes the sample row in memory; resolves with the removed record's label
   *  so a toast can name it (FR-068). */
  removeRecord(input: RemoveRecordInput): Promise<RemoveRecordResult>;
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
  /** Returns the count of stock balances at or below their reorder level. */
  getLowStockCount(): Promise<number>;
  /** Lists sales orders with search (number or customer), status filter, sort and pagination. */
  listSalesOrders(query: SalesOrderQuery): Promise<SampleSalesOrderPage>;
  /** Returns one sales order by id. */
  getSalesOrder(id: string): Promise<SampleSalesOrder>;
  /** Creates a sales order as a draft. Resolves with the assigned number. */
  createSalesOrder(input: CreateSalesOrderInput): Promise<{ readonly id: string; readonly number: string }>;
  /** Updates a draft sales order. Refused for any other status. */
  updateSalesOrder(input: UpdateSalesOrderInput): Promise<{ readonly number: string }>;
  /** Confirms a draft sales order. Re-checks availability on the spot, all or nothing. */
  confirmSalesOrder(input: ConfirmSalesOrderInput): Promise<SalesOrderActionResult>;
  /** Cancels a sales order. A confirmed order's reservations are released. */
  cancelSalesOrder(id: string): Promise<SalesOrderActionResult>;
  /** Ships a confirmed sales order in full. Idempotency key prevents duplicate shipping. */
  shipSalesOrder(input: ShipSalesOrderInput): Promise<SampleShipSalesOrderResult>;
  /** Lists shipments with search and a date-range filter, sort and pagination. */
  listShipments(query: ShipmentQuery): Promise<SampleShipmentPage>;
  /** Lists invoices with search (number or customer), status, overdue-only filter,
   *  sort and pagination. */
  listInvoices(query: InvoiceQuery): Promise<SampleInvoicePage>;
  /** Returns one invoice by id. */
  getInvoice(id: string): Promise<SampleInvoice>;
  /** Lists the shipped orders that have no non-void invoice, the candidates the
   *  Create Invoice dialog offers. */
  listInvoicableOrders(): Promise<readonly InvoicableOrder[]>;
  /** Creates a draft invoice from a shipped order. Idempotency key prevents
   *  duplicate drafts. The number stays unassigned until the invoice is issued. */
  createInvoiceFromOrder(input: SampleCreateInvoiceFromOrderInput): Promise<SampleCreateInvoiceFromOrderResult>;
  /** Updates a draft invoice's due date. Refused for any other status. */
  updateInvoiceDueDate(input: UpdateInvoiceDueDateInput): Promise<{ readonly dueDate: string }>;
  /** Issues a draft invoice: assigns the document number and fixes its dates.
   *  Idempotency key prevents double issuing. */
  issueInvoice(input: IssueInvoiceInput): Promise<IssueInvoiceResult>;
  /** Voids a draft invoice, or an issued one with no non-reversed payments applied. */
  voidInvoice(input: VoidInvoiceInput): Promise<VoidInvoiceResult>;
  /** Lists payments with search (number or customer), status, date-range filter,
   *  sort and pagination. */
  listPayments(query: SamplePaymentQuery): Promise<SamplePaymentPage>;
  /** Returns one payment by id. */
  getPayment(id: string): Promise<SamplePayment>;
  /** Records a payment and allocates it across open invoices. Idempotency key
   *  prevents duplicate recording; balances are re-checked at posting time. */
  recordPayment(input: RecordPaymentInput): Promise<RecordPaymentResult>;
  /** Reverses a recorded payment. A reversed payment cannot be reversed again. */
  reversePayment(input: ReversePaymentInput): Promise<ReversePaymentResult>;
  /** Lists the open (balance above zero) invoices of one customer, oldest first. */
  listOpenInvoicesForCustomer(customerId: string): Promise<readonly SampleOpenInvoice[]>;
  /** Lists the customers that have at least one open invoice. */
  listOpenInvoiceCustomers(): Promise<readonly OpenInvoiceCustomer[]>;
  /** The organization's invoicing settings: default payment term and currency. */
  getOrganizationSettings(): Promise<OrganizationSettings>;
  getOrganization(): Promise<Organization>;
  listModules(): Promise<readonly ModuleSetting[]>;
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
  readonly isActive: boolean;
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
  readonly isActive: boolean;
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

/**
 * The progress of one order in the list, computed by the SERVER and rendered
 * verbatim: a mixed-unit order cannot sum its receipts, so the count of
 * fully received lines is the honest answer there.
 */
export type OrderProgress =
  | {
      readonly kind: 'QUANTITY';
      readonly receivedTotal: DecimalString;
      readonly orderedTotal: DecimalString;
      readonly unitOfMeasure: string;
    }
  | {
      readonly kind: 'LINES';
      readonly fullyReceivedLineCount: number;
      readonly lineCount: number;
    }
  | { readonly kind: 'NONE' };

/** One line of a purchase order as the SAMPLE modules still describe one. */
export interface SamplePurchaseOrderLine {
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

/** One line of a purchase order as the API answers it: the unit is carried. */
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
  /** The unit of measure the catalogue records for the product. */
  readonly unitOfMeasure: string;
  /** quantity x unit cost, rounded half-up to 2 decimal places. */
  readonly lineTotal: DecimalString;
}

/**
 * A purchase order (sample data only). The backend contract must match: the
 * received and outstanding quantities and every total are derived values, and
 * money is a decimal string throughout.
 */
export interface SamplePurchaseOrder {
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
  readonly lines: readonly SamplePurchaseOrderLine[];
  readonly total: DecimalString;
}

/**
 * A purchase order as the API answers it. `version` is the caller's basis for
 * every versioned state change; `receipts` is present only on the detail, and
 * the receipt lines are the order's own history, never editable.
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
  readonly version: number;
  /** The receipt history, newest first; present only on the detail answer. */
  readonly receipts?: readonly GoodsReceiptDetail[];
}

/** The sort keys the purchase order list accepts. */
export type PurchaseOrderSortField = 'number' | 'supplier' | 'status' | 'orderDate' | 'total';

/** A purchase order list request: search, status filter, sort and pagination. */
export interface PurchaseOrderQuery {
  readonly search?: string;
  /**
   * One status or several. "Awaiting receipt" is CONFIRMED together with
   * PARTIALLY_RECEIVED, and that is one question about one collection.
   */
  readonly status?: PurchaseOrderStatus | readonly PurchaseOrderStatus[];
  readonly page: number;
  readonly pageSize: number;
  readonly sort?: string;
  readonly direction?: 'asc' | 'desc';
  readonly sortBy?: PurchaseOrderSortField;
  readonly sortOrder?: 'asc' | 'desc';
}

/** One page of purchase orders as the SAMPLE modules still describe one. */
export interface SamplePurchaseOrderPage {
  readonly items: readonly SamplePurchaseOrder[];
  readonly total: number;
}

/** One row of the purchase order list. */
export interface PurchaseOrderRow {
  readonly id: string;
  readonly number: string;
  readonly supplierId: string;
  readonly supplierName: string;
  readonly warehouseId: string;
  readonly warehouseName: string;
  readonly status: PurchaseOrderStatus;
  readonly orderDate: string;
  readonly total: DecimalString;
  readonly version: number;
  readonly progress: OrderProgress;
}

/** One page of purchase orders, with the total of the whole filtered selection. */
export interface PurchaseOrderPage {
  readonly items: readonly PurchaseOrderRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
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

/** Input for updating a purchase order. Refused unless the order is still a draft;
 *  `version` is the version the caller read; a stale one is refused with 409. */
export interface UpdatePurchaseOrderInput extends CreatePurchaseOrderInput {
  readonly id: string;
  readonly version: number;
}

/** What a purchase-order lifecycle action (confirm or cancel) submits. */
export interface PurchaseOrderActionInput {
  readonly id: string;
  readonly version: number;
}

/** What a purchase-order lifecycle action resolves with: the document number and the new status. */
export interface PurchaseOrderActionResult {
  readonly number: string;
  readonly status: PurchaseOrderStatus;
}

/** Input for posting a goods receipt as the SAMPLE modules still describe one. */
export interface SampleReceiveGoodsInput {
  readonly idempotencyKey: string;
  readonly orderId: string;
  /** Per-line quantities to receive now; a line absent from the list receives nothing. */
  readonly quantities: readonly { readonly lineId: string; readonly quantity: DecimalString }[];
}

/** The goods receipt request as the API takes it: every line names its line id, its product and its quantity. */
export interface ReceiveGoodsInput {
  readonly idempotencyKey: string;
  readonly orderId: string;
  readonly lines: readonly ReceiveGoodsLineInput[];
}

/** One line of a goods receipt request: the line, the product and the quantity now. */
export interface ReceiveGoodsLineInput {
  readonly lineId: string;
  readonly productId: string;
  readonly quantity: DecimalString;
}

/** The result of posting a goods receipt as the SAMPLE modules still describe one. */
export interface SampleReceiveGoodsResult {
  readonly number: string;
  readonly status: PurchaseOrderStatus;
}

/** The receipt posting's answer: what was posted, and what it did to the order. */
export interface ReceiveGoodsResult {
  readonly receipt: {
    readonly id: string;
    readonly number: string;
    readonly receivedAt: string;
  };
  readonly order: {
    readonly id: string;
    readonly number: string;
    readonly status: PurchaseOrderStatus;
    readonly version: number;
  };
}

/** The tax-unit of measure the catalogue records for a line; a mixed-unit receipt shows its lines' units. */
export interface GoodsReceiptLine {
  readonly lineId: string;
  readonly orderLineId: string;
  readonly productId: string;
  readonly productSku: string;
  readonly productName: string;
  readonly quantity: DecimalString;
  readonly unitCost: DecimalString;
  readonly unitOfMeasure: string;
}

/** One goods receipt with its lines, as the order detail shows its history. */
export interface GoodsReceiptDetail {
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
  readonly receivedAt: string;
  readonly user: string;
  readonly lines: readonly GoodsReceiptLine[];
}

/**
 * One row of the goods receipts list as the API answers it: the receipt, never its lines,
 * so `receivedTotal`/`unitOfMeasure` exist only when every line shares one unit.
 */
export interface GoodsReceiptRow {
  readonly id: string;
  readonly number: string;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly supplierId: string;
  readonly supplierName: string;
  readonly warehouseId: string;
  readonly warehouseName: string;
  /** Receipt timestamp, ISO. */
  readonly receivedAt: string;
  readonly user: string;
  readonly lineCount: number;
  /** Present only when every line of the receipt shares one unit of measure. */
  readonly receivedTotal?: DecimalString;
  /** Present only when every line of the receipt shares one unit of measure. */
  readonly unitOfMeasure?: string;
}

/** One goods receipt as the SAMPLE modules still describe one; permanent, never editable. */
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

/** The sort keys the goods receipts list accepts. */
export type GoodsReceiptSortField = 'number' | 'orderNumber' | 'supplier' | 'receivedAt';

/** A goods receipt list request: search and a date range. */
export interface GoodsReceiptQuery {
  readonly search?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly page: number;
  readonly pageSize: number;
  readonly sort?: string;
  readonly direction?: 'asc' | 'desc';
  readonly sortBy?: GoodsReceiptSortField;
  readonly sortOrder?: 'asc' | 'desc';
}

/** One page of goods receipts as the SAMPLE modules still describe one. */
export interface SampleGoodsReceiptPage {
  readonly items: readonly GoodsReceipt[];
  readonly total: number;
}

/** One page of goods receipts, with the total of the whole filtered selection. */
export interface GoodsReceiptPage {
  readonly items: readonly GoodsReceiptRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
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
export interface SampleSalesOrder {
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

/** One line of a shipment as the order detail shows its history; no fulfilment state exists. */
export interface ShipmentDetailLine {
  readonly lineId: string;
  readonly orderLineId: string;
  readonly productId: string;
  readonly productSku: string;
  readonly productName: string;
  readonly quantity: DecimalString;
}

/** One shipment as the order detail lists it, newest first. */
export interface ShipmentDetail {
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
  readonly shippedAt: string;
  /** The shipping user's email address. */
  readonly user: string;
  readonly lines: readonly ShipmentDetailLine[];
}

/**
 * A sales order as the API answers it. `version` is the basis of every
 * versioned state change (confirm, cancel); `shipments` is present only on
 * the detail answer.
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
  readonly version: number;
  /** The shipment history, newest first; present only on the detail answer. */
  readonly shipments?: readonly ShipmentDetail[];
}

/** The sort keys the sales orders list accepts. */
export type SalesOrderSortField = 'number' | 'customer' | 'status' | 'orderDate' | 'total';

/** A sales order list request: search (number or customer), status filter, sort and pagination. */
export interface SalesOrderQuery {
  readonly search?: string;
  readonly status?: SalesOrderStatus;
  readonly page: number;
  readonly pageSize: number;
  readonly sort?: string;
  readonly direction?: 'asc' | 'desc';
  readonly sortBy?: SalesOrderSortField;
  readonly sortOrder?: 'asc' | 'desc';
}

/** One page of sales orders as the SAMPLE modules still describe one. */
export interface SampleSalesOrderPage {
  readonly items: readonly SampleSalesOrder[];
  readonly total: number;
}

/** One row of the sales order list. */
export interface SalesOrderRow {
  readonly id: string;
  readonly number: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly warehouseId: string;
  readonly warehouseName: string;
  readonly status: SalesOrderStatus;
  readonly orderDate: string;
  readonly total: DecimalString;
  readonly version: number;
}

/** One page of sales orders, with the total of the whole filtered selection. */
export interface SalesOrderPage {
  readonly items: readonly SalesOrderRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
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

/** Input for updating a sales order. Refused unless the order is still a draft;
 *  `version` is the version the caller read; a stale one is refused with 409. */
export interface UpdateSalesOrderInput extends CreateSalesOrderInput {
  readonly id: string;
  readonly version: number;
}

/** Input for confirming a sales order; the key is generated when the dialog opens,
 *  and `version` is the version the caller read; a stale one is refused with 409. */
export interface ConfirmSalesOrderInput {
  readonly orderId: string;
  readonly idempotencyKey: string;
  readonly version: number;
}

/** Input for cancelling a sales order; the key is generated when the dialog opens,
 *  and `version` is the version the caller read; a stale one is refused with 409. */
export interface CancelSalesOrderInput {
  readonly orderId: string;
  readonly idempotencyKey: string;
  readonly version: number;
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

/** The result of shipping a sales order as the SAMPLE modules still describe one. */
export interface SampleShipSalesOrderResult {
  readonly number: string;
  readonly status: SalesOrderStatus;
  readonly shipmentNumber: string;
}

/** The shipping answer: the shipment that was posted, and the order it changed. */
export interface ShipSalesOrderResult {
  readonly shipment: {
    readonly id: string;
    readonly number: string;
    readonly shippedAt: string;
  };
  readonly order: {
    readonly id: string;
    readonly number: string;
    readonly status: SalesOrderStatus;
    readonly version: number;
  };
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

/** The sort keys the shipments list accepts. */
export type ShipmentSortField = 'number' | 'orderNumber' | 'customer' | 'shippedAt';

/** A shipment list request: search and a date range. */
export interface ShipmentQuery {
  readonly search?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly page: number;
  readonly pageSize: number;
  readonly sort?: string;
  readonly direction?: 'asc' | 'desc';
  readonly sortBy?: ShipmentSortField;
  readonly sortOrder?: 'asc' | 'desc';
}

/** One row of the shipments list. */
export interface ShipmentRow {
  readonly id: string;
  readonly number: string;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly warehouseId: string;
  readonly warehouseName: string;
  /** Shipment timestamp, ISO. */
  readonly shippedAt: string;
  /** The shipping user's email address. */
  readonly user: string;
  /** One shipment ships the whole order; this is how many lines it shipped. */
  readonly lineCount: number;
}

/** One page of shipments as the SAMPLE modules still describe one. */
export interface SampleShipmentPage {
  readonly items: readonly Shipment[];
  readonly total: number;
}

/** One page of shipments, with the total of the whole filtered selection. */
export interface ShipmentPage {
  readonly items: readonly ShipmentRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
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

/** The payment methods the API records. */
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'OTHER';

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

/** One payment's allocation to one invoice as the SAMPLE modules still describe one. */
export interface SampleInvoiceAllocation {
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

/** One payment's allocation to one invoice, as the invoice detail shows it.
 *  Reversed allocations stay listed, labelled `reversed: true`, so history is never rewritten. */
export interface InvoiceAllocation {
  readonly allocationId: string;
  readonly paymentId: string;
  readonly paymentNumber: string;
  readonly paymentDate: string;
  readonly amount: DecimalString;
  /** True when the owning payment has been reversed. */
  readonly reversed: boolean;
}

/**
 * An invoice as the SAMPLE modules still describe one. Drafts are unnumbered
 * (`number` null) and unissued (`issueDate` null); issuing assigns the number
 * and stamps the issue date. `paid` is the sum of allocations from
 * non-reversed payments and `balance` is `total − paid`, both derived by the
 * service rather than stored separately.
 */
export interface SampleInvoice {
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
  readonly paymentsApplied: readonly SampleInvoiceAllocation[];
  readonly voidedDate: string | null;
  readonly voidReason: string | null;
}

/** The exact wording every invoice representation carries: never a tax invoice. */
export const INVOICE_LABEL = 'Operational invoice - not a tax invoice' as const;

/**
 * An invoice as the API answers it. Drafts are unnumbered (`number` null) and
 * unissued (`issueDate` null); `dueDate` is null only while a draft has never
 * been given one. `label` is the fixed wording above; `version` is the basis
 * of every versioned write.
 */
export interface Invoice {
  readonly id: string;
  readonly number: string | null;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly status: InvoiceStatus;
  readonly issueDate: string | null;
  /** null only on a DRAFT until a due date is chosen. */
  readonly dueDate: string | null;
  readonly lines: readonly InvoiceLine[];
  readonly total: DecimalString;
  /** Sum of allocations of payments with no reversal; '0.00' when none. */
  readonly paid: DecimalString;
  readonly balance: DecimalString;
  readonly isOverdue: boolean;
  readonly voidReason: string | null;
  readonly voidedAt: string | null;
  readonly voidedBy: string | null;
  readonly version: number;
  readonly label: typeof INVOICE_LABEL;
  /** Every allocation against this invoice, the reversed ones labelled. */
  readonly paymentsApplied: readonly InvoiceAllocation[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** One invoice list row; the slim shape the list endpoint returns. */
export interface InvoiceRow {
  readonly id: string;
  readonly number: string | null;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly status: InvoiceStatus;
  readonly issueDate: string | null;
  readonly dueDate: string | null;
  readonly total: DecimalString;
  readonly balance: DecimalString;
  readonly isOverdue: boolean;
  readonly version: number;
  readonly label: typeof INVOICE_LABEL;
}

/** The sort keys the invoices list accepts. */
export type InvoiceSortField = 'number' | 'status' | 'issueDate' | 'dueDate' | 'createdAt' | 'customerName';

/** An invoice list request: search, status, overdue-only filter, sort, pagination. */
export interface InvoiceQuery {
  readonly search?: string;
  readonly status?: InvoiceStatus;
  /** The sample modules' overdue-only flag; the API screens send `overdue`. */
  readonly overdueOnly?: boolean;
  /** Overdue-only filter as the API takes it. */
  readonly overdue?: boolean;
  /** The sales order an invoice was created from; the sales order detail asks through this. */
  readonly orderId?: string;
  readonly page: number;
  readonly pageSize: number;
  readonly sort?: string;
  readonly direction?: 'asc' | 'desc';
  readonly sortBy?: InvoiceSortField;
  readonly sortOrder?: 'asc' | 'desc';
}

/** One page of invoices as the SAMPLE modules still describe one. */
export interface SampleInvoicePage {
  readonly items: readonly SampleInvoice[];
  readonly total: number;
}

/**
 * One page of invoices. `total`, `outstanding` and `overdue` describe the
 * WHOLE filtered selection, not the visible page.
 */
export interface InvoicePage {
  readonly items: readonly InvoiceRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly outstanding: DecimalString;
  readonly overdue: DecimalString;
}

/** A shipped order that has no non-void invoice, as the Create Invoice dialog offers it. */
export interface InvoicableOrder {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly total: DecimalString;
}

/** Input for creating a draft invoice from a shipped order as the SAMPLE modules still describe one; the key is generated when the dialog opens. */
export interface SampleCreateInvoiceFromOrderInput {
  readonly orderId: string;
  readonly idempotencyKey: string;
}

/** What creating a draft resolves with as the SAMPLE modules still describe one. */
export interface SampleCreateInvoiceFromOrderResult {
  readonly id: string;
  readonly status: 'DRAFT';
  readonly dueDate: string;
}

/**
 * Input for creating a draft invoice from a shipped order. The contract gives
 * draft creation no idempotency key; a duplicate attempt answers 409.
 */
export interface CreateInvoiceFromOrderInput {
  readonly orderId: string;
}

/** Input for editing a draft invoice's due date; `version` is the version the caller read. */
export interface UpdateInvoiceDueDateInput {
  readonly id: string;
  /** An ISO date, or null to clear the draft's due date. */
  readonly dueDate: string | null;
  readonly version: number;
}

/** Input for issuing a draft invoice; the key is generated when the dialog opens,
 *  and `dueDate` (optional) outranks the draft's kept due date. */
export interface IssueInvoiceInput {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly dueDate?: string | null;
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
  readonly paymentDate: string;
  readonly method: PaymentMethod;
  /** Optional free-text reference, '' when absent. */
  readonly reference?: string;
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

/** A payment as the SAMPLE modules still describe one. Payments are never edited or deleted; a reversal only marks and records. */
export interface SamplePayment {
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

/** A payments list request as the SAMPLE modules still describe one: search, status, date range, sort, pagination. */
export interface SamplePaymentQuery {
  readonly search?: string;
  readonly status?: PaymentStatus;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly page: number;
  readonly pageSize: number;
  readonly sort?: string;
  readonly direction?: 'asc' | 'desc';
}

/** One page of payments as the SAMPLE modules still describe one. */
export interface SamplePaymentPage {
  readonly items: readonly SamplePayment[];
  readonly total: number;
}

/** The derived reversal state the payments list may filter by. */
export type PaymentListStatus = 'active' | 'reversed' | 'all';

/** The sort keys the payments list accepts. */
export type PaymentSortField = 'number' | 'paymentDate' | 'customerName' | 'method' | 'status';

/** A payments list request as the API takes it. The status filter is the DERIVED
 *  reversal state, independent of the method filter. */
export interface PaymentQuery {
  readonly search?: string;
  readonly status?: PaymentListStatus;
  readonly method?: PaymentMethod | 'all';
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly page: number;
  readonly pageSize: number;
  readonly sortBy?: PaymentSortField;
  readonly sortOrder?: 'asc' | 'desc';
}

/** One payment list row; the slim shape the list endpoint returns. */
export interface PaymentRow {
  readonly id: string;
  readonly number: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly amount: DecimalString;
  /** The payment date (YYYY-MM-DD). */
  readonly paymentDate: string;
  readonly method: PaymentMethod;
  /** Free-text reference; null when absent. */
  readonly reference: string | null;
  /** Derived: RECORDED without a reversal, REVERSED with one. */
  readonly status: PaymentStatus;
  /** The reversal timestamp, so the row can read "Reversed on <date>"; null when active. */
  readonly reversedAt: string | null;
  readonly recordedAt: string;
}

/** One allocation on a recorded payment as the payment detail shows it. */
export interface PaymentDetailAllocation {
  readonly id: string;
  readonly invoiceId: string;
  readonly invoiceNumber: string | null;
  readonly amount: DecimalString;
  /** True once the owning allocation was reversed (the payment carries the reversal). */
  readonly reversed: boolean;
}

/** The reversal that marks a payment as no longer counting towards balances. */
export interface PaymentReversal {
  readonly reason: string;
  readonly reversedAt: string;
  readonly reversedBy: string;
}

/** One page of payments as the API answers it. */
export interface PaymentPage {
  readonly items: readonly PaymentRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

/** The full payment: header, allocations and the reversal when one exists. */
export interface PaymentDetail {
  readonly id: string;
  readonly number: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly amount: DecimalString;
  readonly paymentDate: string;
  readonly method: PaymentMethod;
  readonly reference: string | null;
  readonly status: PaymentStatus;
  readonly allocations: readonly PaymentDetailAllocation[];
  readonly reversal: PaymentReversal | null;
  readonly recordedBy: string;
  readonly recordedAt: string;
}

/** The open-invoice summary the record-payment form's table shows per row. */
export interface OpenInvoice {
  readonly id: string;
  readonly number: string | null;
  readonly dueDate: string;
  readonly total: DecimalString;
  readonly balance: DecimalString;
  readonly isOverdue: boolean;
}

/** The open-invoice summary as the SAMPLE modules still describe one. */
export interface SampleOpenInvoice {
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

export type ModuleKey = 'inventory' | 'purchasing' | 'sales' | 'invoicing' | 'reports' | 'contacts' | 'products' | 'settings' | 'audit';
export interface ModuleSetting { readonly key: ModuleKey; readonly label: string; readonly enabled: boolean; readonly locked: boolean; readonly description: string; }

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
