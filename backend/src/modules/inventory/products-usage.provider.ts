import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import {
  PRODUCTS_USAGE_HOOK,
  type ProductUsageResult,
  type ProductsUsageHook,
} from '../products/products-usage.hook';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { PurchasingUsageService } from '../purchasing/purchasing-usage.service';

/**
 * The inventory-backed answer to the products archive check.
 *
 * The products module asks through the seam whether a product is still
 * referenced, and this provider answers: a product that still has RESERVED
 * stock cannot be archived, and neither can a product that an open purchase
 * order still names - the order would point at something the organization can
 * no longer choose.
 *
 * The products module never reads the stock tables or the purchasing tables
 * itself; it asks, and the owning modules answer (Constitution Principle VI).
 */
@Injectable()
export class InventoryProductsUsageProvider implements ProductsUsageHook {
  constructor(
    private readonly prisma: PrismaService,
    private readonly purchasing: PurchasingUsageService,
  ) {}

  async isInUse(organizationId: string, productId: string): Promise<ProductUsageResult> {
    const rows = await this.prisma.$queryRaw<{ reserved: Prisma.Decimal }[]>(Prisma.sql`
      SELECT COALESCE(SUM("reserved"), 0) AS "reserved"
      FROM "stock_balances"
      WHERE "organization_id" = ${organizationId}::uuid
        AND "product_id" = ${productId}::uuid
    `);
    const reserved = rows[0]?.reserved ?? new Prisma.Decimal(0);
    if (!reserved.isZero()) {
      return { inUse: true, reason: 'This product has reserved stock.' };
    }

    const order = await this.purchasing.findOpenOrderForProduct(organizationId, productId);
    if (order !== null) {
      return {
        inUse: true,
        reason: `This product is used by the open purchase order ${order.orderNumber}.`,
      };
    }

    return { inUse: false };
  }
}

/** The token the provider is registered under. */
export const INVENTORY_PRODUCTS_USAGE_HOOK = PRODUCTS_USAGE_HOOK;
