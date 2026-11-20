/**
 * The invoice responses.
 *
 * Every amount crosses the interface as an exact decimal STRING: a JSON
 * number has already lost precision by the time a client reads it. Strings
 * with 3 places carry quantities, 4 places unit prices, 2 places totals.
 *
 * Every invoice representation carries the exact label below - the document is
 * an operational invoice, never a tax invoice, and nothing on it may suggest
 * otherwise.
 */
export const INVOICE_LABEL = 'Operational invoice - not a tax invoice';

export interface InvoiceLineResponse {
  readonly id: string;
  readonly productId: string;
  readonly productSku: string;
  readonly productName: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly lineTotal: string;
}

export interface PaymentAppliedResponse {
  readonly allocationId: string;
  readonly paymentId: string;
  readonly paymentNumber: string;
  /** The payment date (YYYY-MM-DD). */
  readonly paymentDate: string;
  readonly amount: string;
  /** True when the payment has been reversed; the allocation still shows. */
  readonly reversed: boolean;
}

/** The full invoice: header, lines, totals, allocations, void trail. */
export interface InvoiceDetailResponse {
  readonly id: string;
  /** null on a DRAFT; allocated at issue. */
  readonly number: string | null;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly status: string;
  /** null on a DRAFT. */
  readonly issueDate: string | null;
  /** null on a DRAFT until one is set; carried into the issue. */
  readonly dueDate: string | null;
  readonly lines: readonly InvoiceLineResponse[];
  readonly total: string;
  /** Sum of allocations of payments with no reversal; '0.00' when none. */
  readonly paid: string;
  readonly balance: string;
  readonly isOverdue: boolean;
  readonly voidReason: string | null;
  readonly voidedAt: string | null;
  readonly voidedBy: string | null;
  readonly version: number;
  readonly label: typeof INVOICE_LABEL;
  readonly paymentsApplied: readonly PaymentAppliedResponse[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** A calendar date (YYYY-MM-DD) as the database stores it, or null. */
export function toDateString(value: Date | string | null): string | null {
  if (value === null) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

/** One invoice list row; the slim shape the list endpoint returns. */
export interface InvoiceRowResponse {
  readonly id: string;
  /** null on a DRAFT. */
  readonly number: string | null;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly status: string;
  /** null on a DRAFT. */
  readonly issueDate: string | null;
  readonly dueDate: string | null;
  readonly total: string;
  readonly balance: string;
  readonly isOverdue: boolean;
  readonly version: number;
  readonly label: typeof INVOICE_LABEL;
}

/**
 * One page of invoices.
 *
 * `total`, `outstanding` and `overdue` describe the WHOLE filtered selection,
 * not the visible page, and are read from the same snapshot as the rows.
 * `outstanding` sums the balances of ISSUED and PARTIALLY_PAID invoices;
 * `overdue` is the part of that figure due before today (UTC).
 */
export interface InvoicePageResponse {
  readonly items: readonly InvoiceRowResponse[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly outstanding: string;
  readonly overdue: string;
}

/** One row of the Record-payment screen's open-invoice table. */
export interface OpenInvoiceResponse {
  readonly id: string;
  readonly number: string | null;
  readonly dueDate: string;
  readonly total: string;
  readonly balance: string;
  readonly isOverdue: boolean;
}
