import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../platform/prisma/prisma.service';

/**
 * The low-stock rule, stated once.
 *
 * A product is low stock when its TOTAL AVAILABLE quantity across its active
 * warehouses - on hand minus reserved - is at or below its configured
 * threshold. A product without a threshold has no status at all, an archived
 * product is never low stock, and a product with no movements at all has zero
 * available and is therefore low when it has a threshold.
 *
 * The rule lives in the database (the view created by the migration), and this
 * file is the ONLY place the application reads it: the balances filter, the
 * low-stock count and the status shown on a row all come from here. A second
 * implementation would be a second answer, and the count would stop matching
 * the filter.
 */

/** The view that holds the rule. */
export const LOW_STOCK_VIEW = 'inventory_low_stock_products';

/**
 * The predicate that selects the low products.
 *
 * It is exported so every reader of the rule asks the SAME question of the
 * SAME column, instead of each spelling it out.
 */
export const LOW_STOCK_PREDICATE = Prisma.sql`ls."is_low" = true`;

/** The product-level status. */
export type StockStatus = 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK';

/** One row of the rule. */
export interface LowStockProduct {
  readonly productId: string;
  readonly sku: string;
  readonly productName: string;
  readonly threshold: string;
  readonly totalAvailable: string;
  readonly status: StockStatus;
  readonly isLow: boolean;
}

@Injectable()
export class LowStockRule {
  constructor(private readonly prisma: PrismaService) {}

  /** The products the rule selects as low, for this organization. */
  async products(organizationId: string): Promise<LowStockProduct[]> {
    const rows = await this.prisma.$queryRaw<LowStockProduct[]>(Prisma.sql`
      SELECT
        ls."product_id"::text AS "productId",
        ls."sku",
        ls."product_name" AS "productName",
        ls."threshold"::text AS "threshold",
        ls."total_available"::text AS "totalAvailable",
        ls."status" AS "status",
        ls."is_low" AS "isLow"
      FROM "${Prisma.raw(LOW_STOCK_VIEW)}" ls
      WHERE ls."organization_id" = ${organizationId}::uuid
        AND ${LOW_STOCK_PREDICATE}
      ORDER BY ls."sku" ASC
    `);
    return rows;
  }

  /** How many products the rule selects as low, for this organization. */
  async count(organizationId: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT count(*)::bigint AS "count"
      FROM "${Prisma.raw(LOW_STOCK_VIEW)}" ls
      WHERE ls."organization_id" = ${organizationId}::uuid
        AND ${LOW_STOCK_PREDICATE}
    `);
    return Number(rows[0]?.count ?? 0);
  }

  /**
   * The status of one product, or null when it has none.
   *
   * A product without a threshold has no status at all; an archived product
   * has none either. The status ladder is the rule's own: out of stock first,
   * then low stock, then in stock.
   */
  async statusOf(organizationId: string, productId: string): Promise<StockStatus | null> {
    const rows = await this.prisma.$queryRaw<{ status: StockStatus }[]>(Prisma.sql`
      SELECT ls."status" AS "status"
      FROM "${Prisma.raw(LOW_STOCK_VIEW)}" ls
      WHERE ls."organization_id" = ${organizationId}::uuid
        AND ls."product_id" = ${productId}::uuid
    `);
    return rows[0]?.status ?? null;
  }
}
