import { z } from 'zod';

/**
 * The purchase order write request.
 *
 * Every amount travels as an exact decimal STRING: a JSON number has already
 * lost precision by the time the service reads it, and a quantity that must
 * be exactly 3.333 cannot be carried as a float.
 *
 * A quantity has at most three decimal places and a unit cost at most four.
 * More places are REFUSED, never rounded: the document must say what was
 * entered.
 *
 * The lines may be EMPTY: a draft can be saved with a header only and its
 * lines added later. Confirmation still requires at least one line.
 */
export const purchaseOrderLineInputSchema = z
  .object({
    productId: z.string().uuid('Invalid product id.'),
    quantity: z
      .string()
      .trim()
      .regex(
        /^\d+(\.\d{1,3})?$/,
        'Quantity must be a decimal number with at most 3 decimal places.',
      )
      .refine((value) => Number(value) > 0, 'Quantity must be greater than zero.'),
    unitCost: z
      .string()
      .trim()
      .regex(
        /^\d+(\.\d{1,4})?$/,
        'Unit cost must be a decimal number with at most 4 decimal places.',
      ),
  })
  .strict();

const purchaseOrderBodySchema = z
  .object({
    supplierId: z.string().uuid('Invalid supplier id.'),
    warehouseId: z.string().uuid('Invalid warehouse id.'),
    orderDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Order date must be an ISO date (YYYY-MM-DD).'),
    expectedDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected date must be an ISO date (YYYY-MM-DD).')
      .nullable()
      .optional(),
    notes: z.string().trim().max(1000).optional().default(''),
    lines: z
      .array(purchaseOrderLineInputSchema)
      .max(100, 'An order may carry at most 100 lines.')
      .default([]),
  })
  .strict();

/** The expected date is never before the order date. */
const expectedDateAfterOrderDate = {
  message: 'The expected date must not be before the order date.',
  path: ['expectedDate'] as (string | number)[],
};

export const createPurchaseOrderSchema = purchaseOrderBodySchema.refine(
  (value) =>
    value.expectedDate === undefined ||
    value.expectedDate === null ||
    value.expectedDate >= value.orderDate,
  expectedDateAfterOrderDate,
);

export type CreatePurchaseOrderDto = z.infer<typeof createPurchaseOrderSchema>;

/**
 * The update request: the same body plus the version the caller read.
 *
 * A stale version is refused with 409 `STALE_VERSION`, so two people editing
 * the same draft cannot silently overwrite each other.
 */
export const updatePurchaseOrderSchema = purchaseOrderBodySchema
  .extend({
    version: z.number().int().min(1, 'Version must be a positive whole number.'),
  })
  .refine(
    (value) =>
      value.expectedDate === undefined ||
      value.expectedDate === null ||
      value.expectedDate >= value.orderDate,
    expectedDateAfterOrderDate,
  );

export type UpdatePurchaseOrderDto = z.infer<typeof updatePurchaseOrderSchema>;
