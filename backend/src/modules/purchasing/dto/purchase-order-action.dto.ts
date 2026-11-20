import { z } from 'zod';

/**
 * The versioned state change: confirm and cancel.
 *
 * Both carry the version the caller read. A stale version is refused with
 * 409 `STALE_VERSION` - the same rule the products, the contacts and the
 * warehouses use, so "this record changed since you opened it" always means
 * the same thing.
 */
export const purchaseOrderActionSchema = z
  .object({
    version: z.number().int().min(1, 'Version must be a positive whole number.'),
  })
  .strict();

export type PurchaseOrderActionDto = z.infer<typeof purchaseOrderActionSchema>;
