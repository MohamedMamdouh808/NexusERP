import { z } from 'zod';

/** The invoice statuses the list may filter by. */
export const INVOICE_STATUSES = ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID'] as const;

/**
 * The invoices list query.
 *
 * `sortBy` is a closed list: the caller chooses a KEY, never a column, so an
 * unknown key is a validation failure rather than an error from the database.
 * `overdue` arrives as the strings `true`/`false` (a query has no booleans);
 * the page size CLAMPS at 100 rather than refusing.
 */
export const listInvoicesSchema = z
  .object({
    search: z.string().trim().max(255).optional(),
    status: z.enum(INVOICE_STATUSES).optional(),
    /**
     * The sales order an invoice was created from. The sales order detail asks
     * "does this order already have an invoice?" through this filter rather
     * than reading the whole list.
     */
    orderId: z.string().uuid('A valid sales order id is required.').optional(),
    overdue: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => (value === undefined ? undefined : value === 'true')),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce
      .number()
      .int()
      .min(1, 'Page size must be at least 1.')
      .default(25)
      .transform((value) => Math.min(value, 100)),
    sortBy: z.enum(['number', 'status', 'issueDate', 'dueDate', 'createdAt', 'customerName']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();

export type ListInvoicesDto = z.infer<typeof listInvoicesSchema>;

/** The open-invoices query: exactly one customer, required. */
export const listOpenInvoicesSchema = z
  .object({
    customerId: z.string().uuid('A customer id is required.'),
  })
  .strict();

export type ListOpenInvoicesDto = z.infer<typeof listOpenInvoicesSchema>;
