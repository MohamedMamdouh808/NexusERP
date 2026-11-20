import { z } from 'zod';

/**
 * The request to record a payment with allocations.
 *
 * This schema checks SHAPE only: ids, decimal formats, the method enum and a
 * non-empty allocation list. The content rules live in the service because
 * they must run AFTER the idempotency comparison: the same key with a
 * different body is 422, even when that different body also breaks a rule.
 *
 * Service rules:
 * - `amount > 0` with exactly two decimal places.
 * - `paymentDate` is not in the future (UTC).
 * - The sum of `allocations[].amount` equals `amount` exactly.
 * - Each allocation targets an invoice that is ISSUED or PARTIALLY_PAID and belongs
 *   to the same customer and organization.
 * - No duplicate invoiceId within one payment.
 */
export const recordPaymentSchema = z
  .object({
    customerId: z.string().uuid(),
    amount: z
      .string()
      .trim()
      .regex(/^\d+\.\d{2}$/, 'Amount must be a decimal string with exactly two places.'),
    paymentDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Payment date must be an ISO date (YYYY-MM-DD).'),
    method: z.enum(['CASH', 'BANK_TRANSFER', 'CARD', 'OTHER']),
    reference: z.string().trim().max(255).optional(),
    allocations: z
      .array(
        z.object({
          invoiceId: z.string().uuid(),
          amount: z
            .string()
            .trim()
            .regex(/^\d+\.\d{2}$/, 'Allocation amount must be a decimal string with exactly two places.'),
          expectedBalance: z
            .string()
            .trim()
            .regex(/^\d+\.\d{2}$/, 'Expected balance must be a decimal string with exactly two places.'),
        }),
      )
      .min(1, 'At least one allocation is required.'),
  })
  .strict();

export type RecordPaymentDto = z.infer<typeof recordPaymentSchema>;