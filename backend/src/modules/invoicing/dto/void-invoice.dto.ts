import { z } from 'zod';

/**
 * The void request.
 *
 * The reason is required and non-empty - a void without a word of explanation
 * leaves the organization with a dead invoice and no story. The invoice stays
 * in history as VOID; the order it came from may be invoiced again.
 */
export const voidInvoiceSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(1, 'A void reason is required.')
      .max(1000, 'The reason may carry at most 1000 characters.'),
  })
  .strict();

export type VoidInvoiceDto = z.infer<typeof voidInvoiceSchema>;
