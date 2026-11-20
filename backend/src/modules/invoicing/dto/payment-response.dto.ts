/**
 * The payment responses.
 *
 * Every amount crosses the interface as an exact decimal STRING with two
 * places, like the invoice amounts. A payment carries NO `label`: the
 * "Operational invoice - not a tax invoice" label belongs to invoice
 * representations only.
 *
 * The `status` is derived, never stored: `REVERSED` exactly when a
 * `payment_reversals` row exists for the payment. The payment row itself is
 * append-only; the allocations stay listed after a reversal, labelled
 * `reversed: true`, because history is never rewritten.
 */
export interface PaymentAllocationResponse {
  readonly id: string;
  readonly invoiceId: string;
  readonly invoiceNumber: string | null;
  readonly amount: string;
  readonly reversed: boolean;
}

/** The full payment: header, allocations and the reversal when one exists. */
export interface PaymentDetailResponse {
  readonly id: string;
  readonly number: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly amount: string;
  readonly paymentDate: string;
  readonly method: string;
  readonly reference: string | null;
  readonly status: 'RECORDED' | 'REVERSED';
  readonly allocations: readonly PaymentAllocationResponse[];
  readonly reversal: {
    readonly reason: string;
    readonly reversedAt: string;
    readonly reversedBy: string;
  } | null;
  readonly recordedBy: string;
  readonly recordedAt: string;
}

/** One payment list row; the slim shape the list endpoint returns. */
export interface PaymentRowResponse {
  readonly id: string;
  readonly number: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly amount: string;
  /** The payment date (YYYY-MM-DD). */
  readonly paymentDate: string;
  readonly method: string;
  readonly reference: string | null;
  /** Derived: RECORDED without a reversal, REVERSED with one. */
  readonly status: 'RECORDED' | 'REVERSED';
  /** The reversal timestamp, so the row can read "Reversed on <date>"; null when active. */
  readonly reversedAt: string | null;
  readonly recordedAt: string;
}

/**
 * One page of payments.
 *
 * There are no whole-selection figures: the filter, the rows and `total` come
 * from one query with one left join to `payment_reversals`, so the derived
 * status filter and the count cannot disagree.
 */
export interface PaymentPageResponse {
  readonly items: readonly PaymentRowResponse[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}
