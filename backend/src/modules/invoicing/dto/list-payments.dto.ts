import { z } from 'zod';

/** The derived reversal state the list may filter by. */
export const PAYMENT_LIST_STATUSES = ['active', 'reversed', 'all'] as const;

/** The payment methods the list may filter by; `all` is the default. */
export const PAYMENT_LIST_METHODS = ['CASH', 'BANK_TRANSFER', 'CARD', 'OTHER', 'all'] as const;

/**
 * The payments list query.
 *
 * The status filter is the DERIVED reversal state (`active` = RECORDED,
 * `reversed` = REVERSED, `all` = everything), independent of the method
 * filter. The date range bounds `payment_date` inclusively; an end before the
 * start is a mistaken request rather than an empty result, so it is refused
 * with the date field named.
 */
export const listPaymentsSchema = z
  .object({
    search: z.string().trim().max(255).optional(),
    status: z.enum(PAYMENT_LIST_STATUSES).default('all'),
    method: z.enum(PAYMENT_LIST_METHODS).default('all'),
    dateFrom: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'The date must be an ISO date (YYYY-MM-DD).')
      .optional(),
    dateTo: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'The date must be an ISO date (YYYY-MM-DD).')
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce
      .number()
      .int()
      .min(1, 'Page size must be at least 1.')
      .default(25)
      .transform((value) => Math.min(value, 100)),
    sortBy: z.enum(['number', 'paymentDate', 'customerName', 'method', 'status']).default('paymentDate'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict()
  .refine(
    (value) => value.dateFrom === undefined || value.dateTo === undefined || value.dateTo >= value.dateFrom,
    {
      message: 'The end date must not be before the start date.',
      path: ['dateTo'],
    },
  );

export type ListPaymentsDto = z.infer<typeof listPaymentsSchema>;
