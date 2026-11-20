import { z } from 'zod';

/**
 * The purchase order list query.
 *
 * The page size CLAMPS at 100 rather than refusing: a client that asks for a
 * thousand rows gets the hundred the server is willing to serve.
 */
export const PURCHASE_ORDER_STATUSES = [
  'DRAFT',
  'CONFIRMED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
] as const;

export const listPurchaseOrdersSchema = z
  .object({
    search: z.string().trim().max(255).optional(),
    /**
     * One status, or several. A dashboard that wants "awaiting receipt"
     * needs CONFIRMED and PARTIALLY_RECEIVED together, and that is one
     * question about one collection - so the filter accepts a repeated
     * parameter or a comma-separated list. The single-status form stays
     * valid, so every existing caller keeps working.
     */
    status: z
      .union([z.enum(PURCHASE_ORDER_STATUSES), z.string()])
      .optional()
      .transform((value) => {
        if (value === undefined) return undefined;
        return value
          .split(',')
          .map((entry) => entry.trim().toUpperCase())
          .filter((entry) => entry.length > 0);
      }),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce
      .number()
      .int()
      .min(1, 'Page size must be at least 1.')
      .default(25)
      .transform((value) => Math.min(value, 100)),
    sortBy: z.enum(['number', 'supplier', 'status', 'orderDate', 'total']).default('number'),
    sortOrder: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.status === undefined) return;
    const invalid = value.status.filter((entry) => !PURCHASE_ORDER_STATUSES.includes(entry as any));
    for (const entry of invalid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unknown purchase order status: ${entry}`,
        path: ['status'],
      });
    }
  });

export type ListPurchaseOrdersDto = z.infer<typeof listPurchaseOrdersSchema>;
