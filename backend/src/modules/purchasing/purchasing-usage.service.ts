import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../platform/prisma/prisma.service';

/**
 * The purchasing module's answers to the other modules' "is this still in use?"
 * questions.
 *
 * Archiving a product, archiving a supplier or deactivating a warehouse while
 * an open purchase order still names it would leave the order pointing at
 * something the organization can no longer choose. The other modules ask here
 * instead of reading the purchasing tables themselves: the tables stay inside
 * the module that owns them (Constitution Principle VI), and the answer has
 * one definition rather than one per caller.
 *
 * This service is deliberately dependency-light - it reads only the purchasing
 * tables - so that the Inventory module (which Purchasing itself depends on)
 * can import it without creating a cycle. The cycle would be: Purchasing needs
 * the Inventory service to post a receipt, and the Inventory service needs the
 * purchasing answer to protect a warehouse.
 *
 * An order is OPEN while it can still change: DRAFT, CONFIRMED or
 * PARTIALLY_RECEIVED. A RECEIVED or CANCELLED order is closed - it keeps its
 * history and points at nothing that could still be retired.
 */
export const OPEN_ORDER_STATUSES = ['DRAFT', 'CONFIRMED', 'PARTIALLY_RECEIVED'] as const;

/** The order that blocks a change, and what the user needs to resolve it. */
export interface OpenOrderReference {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly status: string;
}

@Injectable()
export class PurchasingUsageService {
  constructor(private readonly prisma: PrismaService) {}

  /** The open order that names this product on one of its lines, if any. */
  async findOpenOrderForProduct(
    organizationId: string,
    productId: string,
  ): Promise<OpenOrderReference | null> {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: {
        organizationId,
        status: { in: [...OPEN_ORDER_STATUSES] },
        lines: { some: { organizationId, productId } },
      },
      orderBy: [{ orderDate: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, number: true, status: true },
    });

    return order === null ? null : { orderId: order.id, orderNumber: order.number, status: order.status };
  }

  /** The open order that has this supplier, if any. */
  async findOpenOrderForSupplier(
    organizationId: string,
    supplierId: string,
  ): Promise<OpenOrderReference | null> {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { organizationId, supplierId, status: { in: [...OPEN_ORDER_STATUSES] } },
      orderBy: [{ orderDate: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, number: true, status: true },
    });

    return order === null ? null : { orderId: order.id, orderNumber: order.number, status: order.status };
  }

  /** The open order that has this warehouse as its destination, if any. */
  async findOpenOrderForWarehouse(
    organizationId: string,
    warehouseId: string,
  ): Promise<OpenOrderReference | null> {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { organizationId, warehouseId, status: { in: [...OPEN_ORDER_STATUSES] } },
      orderBy: [{ orderDate: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, number: true, status: true },
    });

    return order === null ? null : { orderId: order.id, orderNumber: order.number, status: order.status };
  }
}
