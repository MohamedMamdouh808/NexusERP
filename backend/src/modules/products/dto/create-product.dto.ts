import { z } from 'zod';
import { PRODUCT_PRICE_PRECISION, PRODUCT_REORDER_LEVEL_PRECISION } from '@nexuserp/shared';

/**
 * A decimal amount, as the interface carries it: a STRING.
 *
 * A JSON number is a double in every parser, so a price sent as a number has
 * already lost precision by the time the service reads it - and the repository
 * forbids a floating-point value for money anywhere. The pattern therefore
 * admits digits with an optional fraction, and refuses anything else: a
 * negative amount, an exponent, more decimal places than the column stores, or
 * a value that is not a string at all.
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
 * Create product request body.
 *
 * The prices and the reorder level are decimal strings; the SKU is required
 * and trimmed; the category and the unit must name records of the caller's own
 * organization (the service checks that, because only it knows the tenant).
 */
export const createProductSchema = z
  .object({
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

export type CreateProductDto = z.infer<typeof createProductSchema>;
