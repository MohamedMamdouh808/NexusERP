/**
 * The sales order responses.
 *
 * Every amount crosses the interface as an exact decimal STRING: a JSON
 * number has already lost precision by the time a client reads it, and a
 * quantity that must be exactly 3.333 cannot be carried as a float.
 */

export interface SalesOrderLineResponse {
  readonly id: string;
  readonly productId: string;
  readonly productSku: string;
  readonly productName: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly lineTotal: string;
}

export interface SalesOrderResponse {
  readonly id: string;
  readonly number: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly warehouseId: string;
  readonly warehouseName: string;
  readonly status: string;
  readonly orderDate: string;
  readonly notes: string;
  readonly lines: readonly SalesOrderLineResponse[];
  readonly total: string;
  readonly version: number;
}

export interface SalesOrderRow {
  readonly id: string;
  readonly number: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly warehouseId: string;
  readonly warehouseName: string;
  readonly status: string;
  readonly orderDate: string;
  readonly total: string;
  readonly version: number;
}

/** The result of a confirm or a cancel. */
export interface SalesOrderActionResponse {
  readonly id: string;
  readonly number: string;
  readonly status: string;
  readonly version: number;
}

export interface ShipmentLineResponse {
  readonly lineId: string;
  readonly orderLineId: string;
  readonly productId: string;
  readonly productSku: string;
  readonly productName: string;
  readonly quantity: string;
}

export interface ShipmentRowResponse {
  readonly id: string;
  readonly number: string;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly warehouseId: string;
  readonly warehouseName: string;
  /** Shipment timestamp, ISO 8601 UTC. */
  readonly shippedAt: string;
  /** The shipping user's email address. */
  readonly user: string;
  /** One shipment ships the whole order; the count is how many lines it shipped. */
  readonly lineCount: number;
}

export interface ShipmentDetailResponse {
  readonly id: string;
  readonly number: string;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly warehouseId: string;
  readonly warehouseName: string;
  /** Shipment timestamp, ISO 8601 UTC. */
  readonly shippedAt: string;
  /** The shipping user's email address. */
  readonly user: string;
  readonly lines: readonly ShipmentLineResponse[];
}

/** The order detail: the order, its lines and its shipment history. */
export interface SalesOrderDetailResponse extends SalesOrderResponse {
  readonly shipments: readonly ShipmentDetailResponse[];
}

/** A calendar date (YYYY-MM-DD) as the database stores it. */
export function toDateString(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}
