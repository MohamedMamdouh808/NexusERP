import { z } from 'zod';

/**
 * The reversal request.
 *
 * The reason is required and non-empty - a reversal removes a payment's effect
 * from every invoice balance it touched, so it must leave a word of
 * explanation. The payment row itself is never changed; the reversal is a
 * compensating record and the payment's allocations remain in history labelled
 * as reversed.
 */
export const reversePaymentSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(1, 'A reversal reason is required.')
      .max(1000, 'The reason may carry at most 1000 characters.'),
  })
  .strict();

export type ReversePaymentDto = z.infer<typeof reversePaymentSchema>;
