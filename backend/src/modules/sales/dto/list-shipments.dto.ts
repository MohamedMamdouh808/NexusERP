import { z } from 'zod';

/**
 * The shipments list query.
 *
 * The date range applies to the shipped date, and both ends are inclusive. A
 * range whose end precedes its start is a mistake in the request rather than
 * an empty result, so it is refused with the field named.
 */
export const listShipmentsSchema = z
  .object({
    search: z.string().trim().max(255).optional(),
    startDate: z.string().trim().max(10).optional(),
    endDate: z.string().trim().max(10).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce
      .number()
      .int()
      .min(1, 'Page size must be at least 1.')
      .default(25)
      .transform((value) => Math.min(value, 100)),
    sortBy: z.enum(['number', 'orderNumber', 'customer', 'shippedAt']).default('shippedAt'),
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

export type ListShipmentsDto = z.infer<typeof listShipmentsSchema>;
