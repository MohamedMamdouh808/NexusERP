import { z } from 'zod';

/**
 * The sales order list query.
 *
 * The page size CLAMPS at 100 rather than refusing: a client that asks for a
 * thousand rows gets the hundred the server is willing to serve.
 */
export const listSalesOrdersSchema = z
  .object({
    search: z.string().trim().max(255).optional(),
    status: z
      .enum(['DRAFT', 'CONFIRMED', 'SHIPPED', 'CANCELLED'])
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce
      .number()
      .int()
      .min(1, 'Page size must be at least 1.')
      .default(25)
      .transform((value) => Math.min(value, 100)),
    sortBy: z.enum(['number', 'customer', 'status', 'orderDate', 'total']).default('number'),
    sortOrder: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict();

export type ListSalesOrdersDto = z.infer<typeof listSalesOrdersSchema>;
