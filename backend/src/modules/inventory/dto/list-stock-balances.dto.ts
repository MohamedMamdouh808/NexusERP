import { z } from 'zod';

/**
 * The stock balances query.
 *
 * The page size is capped: a balance list is served a page at a time, and the
 * cap keeps one request from asking for the whole catalogue.
 */
export const STOCK_BALANCE_LIST_DEFAULTS = {
  page: 1,
  pageSize: 20,
  maxPageSize: 100,
  sortBy: 'sku',
  sortOrder: 'asc',
} as const;

export const listStockBalancesSchema = z
  .object({
    search: z.string().trim().max(255).optional(),
    warehouseId: z.string().uuid('Invalid warehouse id.').optional(),
    /** The product-level low-stock selection. */
    lowStockOnly: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => value === 'true'),
    /** The archived products that still hold stock. */
    status: z.enum(['archivedWithStock']).optional(),
    page: z.coerce.number().int().min(1).default(STOCK_BALANCE_LIST_DEFAULTS.page),
    // The cap CLAMPS rather than refuses: a client that asks for a thousand
    // rows gets the hundred the server is willing to serve, not an error. A
    // request that is merely too large is not a mistake worth rejecting.
    pageSize: z.coerce
      .number()
      .int()
      .min(1, 'Page size must be at least 1.')
      .default(STOCK_BALANCE_LIST_DEFAULTS.pageSize)
      .transform((value) => Math.min(value, STOCK_BALANCE_LIST_DEFAULTS.maxPageSize)),
    sortBy: z
      .enum(['sku', 'product', 'warehouse', 'onHand', 'available'])
      .default(STOCK_BALANCE_LIST_DEFAULTS.sortBy),
    sortOrder: z.enum(['asc', 'desc']).default(STOCK_BALANCE_LIST_DEFAULTS.sortOrder),
  })
  .strict();

export type ListStockBalancesDto = z.infer<typeof listStockBalancesSchema>;
