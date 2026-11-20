/**
 * The purchase order responses.
 *
 * Every amount crosses the interface as an exact decimal STRING: a JSON
 * number has already lost precision by the time a client reads it, and a
 * quantity that must be exactly 3.333 cannot be carried as a float.
 *
 * The progress summary is computed by the SERVER. The interface renders it
 * verbatim and never derives a figure of its own - one rule, one place.
 */

/** The progress of one order in the list. */
export type OrderProgress =
  | {
      readonly kind: 'QUANTITY';
      readonly receivedTotal: string;
      readonly orderedTotal: string;
      readonly unitOfMeasure: string;
    }
  | {
      readonly kind: 'LINES';
      readonly fullyReceivedLineCount: number;
      readonly lineCount: number;
    }
  | { readonly kind: 'NONE' };

export interface PurchaseOrderLineResponse {
  readonly id: string;
  readonly productId: string;
  readonly productSku: string;
  readonly productName: string;
  readonly quantity: string;
  readonly received: string;
  readonly outstanding: string;
  readonly unitCost: string;
  readonly unitOfMeasure: string;
  readonly lineTotal: string;
}

export interface PurchaseOrderResponse {
  readonly id: string;
  readonly number: string;
  readonly supplierId: string;
  readonly supplierName: string;
  readonly warehouseId: string;
  readonly warehouseName: string;
  readonly status: string;
  readonly orderDate: string;
  readonly expectedDate: string | null;
  readonly notes: string;
  readonly lines: readonly PurchaseOrderLineResponse[];
  readonly total: string;
  readonly version: number;
  readonly receipts?: readonly GoodsReceiptDetail[];
}

/** One row of the purchase order list. */
export interface PurchaseOrderRow {
  readonly id: string;
  readonly number: string;
  readonly supplierId: string;
  readonly supplierName: string;
  readonly warehouseId: string;
  readonly warehouseName: string;
  readonly status: string;
  readonly orderDate: string;
  readonly total: string;
  readonly version: number;
  readonly progress: OrderProgress;
}

/** The result of a confirm or a cancel. */
export interface PurchaseOrderActionResponse {
  readonly id: string;
  readonly number: string;
  readonly status: string;
  readonly version: number;
}

/** One line of a goods receipt, in the receipt's own history. */
export interface GoodsReceiptLineResponse {
  readonly lineId: string;
  readonly orderLineId: string;
  readonly productId: string;
  readonly productSku: string;
  readonly productName: string;
  readonly quantity: string;
  readonly unitCost: string;
  readonly unitOfMeasure: string;
}

/** One goods receipt, with its lines. */
export interface GoodsReceiptDetail {
  readonly id: string;
  readonly number: string;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly supplierId: string;
  readonly supplierName: string;
  readonly warehouseId: string;
  readonly warehouseName: string;
  readonly receivedAt: string;
  readonly user: string;
  readonly lines: readonly GoodsReceiptLineResponse[];
}

/** One row of the goods receipts list: the receipt, never its lines. */
export interface GoodsReceiptRow {
  readonly id: string;
  readonly number: string;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly supplierId: string;
  readonly supplierName: string;
  readonly warehouseId: string;
  readonly warehouseName: string;
  readonly receivedAt: string;
  readonly user: string;
  readonly lineCount: number;
  /** Present only when every line of the receipt shares one unit of measure. */
  readonly receivedTotal?: string;
  /** Present only when every line of the receipt shares one unit of measure. */
  readonly unitOfMeasure?: string;
}

/** The receipt posting's answer: what was posted, and what it did to the order. */
export interface ReceiveGoodsResponse {
  readonly receipt: {
    readonly id: string;
    readonly number: string;
    readonly receivedAt: string;
  };
  readonly order: {
    readonly id: string;
    readonly number: string;
    readonly status: string;
    readonly version: number;
  };
}

/** A calendar date (YYYY-MM-DD) as the database stores it. */
export function toDateString(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}
