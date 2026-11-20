import { z } from 'zod';

/**
 * The stock adjustment request.
 *
 * The quantity is a SIGNED exact decimal carried as a string, exactly like
 * money: a JSON number has already lost precision by the time the service
 * reads it. It is never zero - a movement that changes nothing is not a
 * movement.
 */
export const ADJUSTMENT_REASONS = [
  'DAMAGE',
  'LOSS',
  'FOUND',
  'COUNT_CORRECTION',
  'OTHER',
] as const;

export const createAdjustmentSchema = z
  .object({
    warehouseId: z.string().uuid('Invalid warehouse id.'),
    productId: z.string().uuid('Invalid product id.'),
    quantity: z
      .string()
      .trim()
      .regex(
        /^-?\d+(\.\d{1,3})?$/,
        'Quantity must be a decimal number with at most 3 decimal places.',
      )
      .refine((value) => Number(value) !== 0, 'Quantity must not be zero.'),
    reason: z.enum(ADJUSTMENT_REASONS),
    note: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine(
    (value) => value.reason !== 'OTHER' || (value.note !== undefined && value.note !== ''),
    {
      message: 'A note is required when the reason is OTHER.',
      path: ['note'],
    },
  );

export type CreateAdjustmentDto = z.infer<typeof createAdjustmentSchema>;
