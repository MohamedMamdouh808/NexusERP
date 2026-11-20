import { z } from 'zod';

/**
 * The issue request.
 *
 * `dueDate` is optional. The resolution order is: the request value (which
 * may not precede the issue date), else the draft's kept due date (also
 * validated at issue), else the issue date plus the organization's default
 * payment terms.
 */
export const issueInvoiceSchema = z
  .object({
    dueDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date must be an ISO date (YYYY-MM-DD).')
      .optional(),
  })
  .strict();

export type IssueInvoiceDto = z.infer<typeof issueInvoiceSchema>;
