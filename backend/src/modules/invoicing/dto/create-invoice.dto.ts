import { z } from 'zod';

/**
 * The create request: `{}`.
 *
 * The draft copies customer, lines, quantities and unit prices from the order -
 * no invoice content travels in the body, because a client cannot invent a
 * price the warehouse did not ship.
 *
 * The create is deliberately NOT idempotent (PRD 9.5): it is validated and
 * applied in one transaction and refused with 409 INVOICE_ALREADY_EXISTS
 * rather than replayed.
 */
export const createInvoiceSchema = z.object({}).strict();

export type CreateInvoiceDto = z.infer<typeof createInvoiceSchema>;
