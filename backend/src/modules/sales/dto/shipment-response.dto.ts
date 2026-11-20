/**
 * What shipping an order answers with.
 *
 * The stored response is replayed exactly for the same idempotency key and
 * body — including the original `shippedAt`.
 */
export interface ShipmentResponse {
  readonly shipment: {
    readonly id: string;
    readonly number: string;
    readonly shippedAt: string;
  };
  readonly order: {
    readonly id: string;
    readonly number: string;
    readonly status: string;
    readonly version: number;
  };
}
