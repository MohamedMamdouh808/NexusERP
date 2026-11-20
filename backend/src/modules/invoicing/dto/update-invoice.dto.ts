import { z } from 'zod';

/**
 * The draft update request.
 *
 * The ONLY editable field on a draft is `dueDate` - an invoice line belongs to
 * the order it was copied from and may never be renegotiated here. `dueDate`
 * travels as an ISO date or as null (clearing the due date keeps it at the
 * terms default at issue), and `version` is the version the caller read; a
 * stale version is refused with 409 STALE_VERSION.
 *
 * A due date before the creation date is refused with 400 VALIDATION_ERROR
 * naming the field - that rule is semantic and lives in the service, next to
 * the version check it belongs to.
 */
export const updateInvoiceSchema = z
  .object({
    dueDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date must be an ISO date (YYYY-MM-DD).')
      .nullable(),
    version: z.number().int().min(1, 'Version must be a positive whole number.'),
  })
  .strict();

export type UpdateInvoiceDto = z.infer<typeof updateInvoiceSchema>;
