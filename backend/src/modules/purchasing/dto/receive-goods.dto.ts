import { z } from 'zod';

/**
 * The goods receipt request.
 *
 * Every quantity names BOTH the purchase-order line it belongs to and the
 * product, and the server requires the pair to match: a line from another
 * order, a product that does not match the named line and a repeated line are
 * all refused, and nothing is written.
 *
 * A zero quantity is accepted in the request and creates NOTHING - the
 * dialog sends every line of the order, so the user can leave a line alone.
 * A request with no positive quantity is refused as a whole.
 *
 * The quantity travels as an exact decimal string with at most three places.
 */
export const receiveGoodsLineSchema = z
  .object({
    lineId: z.string().uuid('Invalid purchase order line id.'),
    productId: z.string().uuid('Invalid product id.'),
    quantity: z
      .string()
      .trim()
      .regex(
        /^(\d+(\.\d{1,3})?)?$/,
        'Quantity must be a decimal number with at most 3 decimal places.',
      ),
  })
  .strict();

export const receiveGoodsSchema = z
  .object({
    lines: z
      .array(receiveGoodsLineSchema)
      .max(100, 'A receipt may carry at most 100 lines.'),
  })
  .strict();

export type ReceiveGoodsDto = z.infer<typeof receiveGoodsSchema>;
export type ReceiveGoodsLineDto = z.infer<typeof receiveGoodsLineSchema>;
