import { z } from 'zod';
import {
  PRODUCT_PRICE_PRECISION,
  PRODUCT_REORDER_LEVEL_PRECISION,
} from '@nexuserp/shared';

/**
 * A decimal amount, as the interface carries it: a STRING.
 *
 * The same rule as the creation: a JSON number has already lost precision by
 * the time the service reads it, and the repository forbids a floating-point
 * value for money.
 */
const decimalAmount = (precision: number, label: string) =>
  z
    .string()
    .trim()
    .regex(
      new RegExp(`^\\d+(\\.\\d{1,${precision}})?$`),
      `${label} must be a decimal number with at most ${precision} decimal places.`,
    )
    .refine((value) => Number(value) >= 0, `${label} must not be negative.`);

/**
 * Update product request body.
 *
 * The version the caller read travels with the change: the service applies it
 * only while it still holds, so a change prepared against an older version is
 * refused rather than silently overwriting someone else's work.
 */
export const updateProductSchema = z
  .object({
    version: z.coerce.number().int().min(1, 'Version is required.'),
    sku: z
      .string()
      .trim()
      .min(1, 'SKU is required.')
      .max(64, 'SKU is too long.'),
    name: z
      .string()
      .trim()
      .min(1, 'Name is required.')
      .max(255, 'Name is too long.'),
    categoryId: z.string().uuid('Invalid category id.'),
    unitId: z.string().uuid('Invalid unit id.'),
    purchasePrice: decimalAmount(PRODUCT_PRICE_PRECISION, 'Purchase price'),
    sellingPrice: decimalAmount(PRODUCT_PRICE_PRECISION, 'Selling price'),
    lowStockThreshold: decimalAmount(
      PRODUCT_REORDER_LEVEL_PRECISION,
      'Reorder level (low-stock threshold)',
    ).optional(),
  })
  .strict();

export type UpdateProductDto = z.infer<typeof updateProductSchema>;
