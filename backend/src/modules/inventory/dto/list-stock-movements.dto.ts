import { z } from 'zod';

/**
 * The stock movements query.
 *
 * The date range is validated here as well as in the service: an end before
 * the start is a mistake in the request, not an empty result.
 */
export const listStockMovementsSchema = z
  .object({
    search: z.string().trim().max(255).optional(),
    productId: z.string().uuid('Invalid product id.').optional(),
    warehouseId: z.string().uuid('Invalid warehouse id.').optional(),
    type: z.enum(['RECEIPT', 'SHIPMENT', 'ADJUSTMENT']).optional(),
    startDate: z.string().trim().max(10).optional(),
    endDate: z.string().trim().max(10).optional(),
    page: z.coerce.number().int().min(1).default(1),
    // The cap CLAMPS rather than refuses: a client that asks for a thousand
    // rows gets the hundred the server is willing to serve.
    pageSize: z.coerce
      .number()
      .int()
      .min(1, 'Page size must be at least 1.')
      .default(20)
      .transform((value) => Math.min(value, 100)),
    sortBy: z.enum(['createdAt', 'product', 'warehouse', 'quantity']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict()
  .refine(
    (value) =>
      value.startDate === undefined ||
      value.endDate === undefined ||
      value.endDate >= value.startDate,
    {
      message: 'The end date must not be before the start date.',
      path: ['endDate'],
    },
  );

export type ListStockMovementsDto = z.infer<typeof listStockMovementsSchema>;
