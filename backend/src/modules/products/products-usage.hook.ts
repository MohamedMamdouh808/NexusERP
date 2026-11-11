import { Injectable } from '@nestjs/common';

/**
 * The archive usage check for products.
 *
 * Archiving a product that open documents or reserved stock still reference
 * would leave those documents pointing at something the organization can no
 * longer choose, so the archive is refused instead.
 *
 * This seam is where the purchasing, sales and inventory features will answer.
 * The products module knows nothing about their documents: it asks, and it
 * refuses an archive when the answer is "in use". Until those features exist,
 * the default provider answers "not in use" - and the refusal is proven by a
 * test that makes the check report a product in use.
 */
export const PRODUCTS_USAGE_HOOK = 'PRODUCTS_USAGE_HOOK';

export interface ProductUsageResult {
  /** Whether the product is referenced by something that must not lose it. */
  readonly inUse: boolean;
  /** Why it is in use, when it is. */
  readonly reason?: string;
}

export interface ProductsUsageHook {
  isInUse(organizationId: string, productId: string): Promise<ProductUsageResult>;
}

@Injectable()
export class DefaultProductsUsageHook implements ProductsUsageHook {
  /**
   * Reports that no product is in use.
   *
   * The purchasing, sales and inventory features replace this provider with
   * one that checks their open documents and reserved stock.
   */
  async isInUse(_organizationId: string, _productId: string): Promise<ProductUsageResult> {
    return { inUse: false };
  }
}
