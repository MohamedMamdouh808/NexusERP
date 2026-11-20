import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { TransactionService, type TransactionClient } from '../../platform/transaction/transaction.service';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../../common/errors/all-exceptions.filter';
import { AUDIT_ACTIONS, ERROR_CODES } from '@nexuserp/shared';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductsDto } from './dto/list-products.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateUnitDto } from './dto/create-unit.dto';
import {
  PRODUCTS_USAGE_HOOK,
  type ProductsUsageHook,
} from './products-usage.hook';

/**
 * The product catalogue.
 *
 * Every method is scoped to one organization: the tenant enters through the
 * request context and is applied to every query, so a record of another
 * organization is answered as "not found" rather than shown.
 *
 * Money is exact: the prices are stored as `NUMERIC(14,4)` and cross the
 * interface as decimal strings. Nothing here rounds.
 */
@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transaction: TransactionService,
    private readonly audit: AuditService,
    @Inject(PRODUCTS_USAGE_HOOK)
    private readonly usageHook: ProductsUsageHook,
  ) {}

  /**
   * Creates a product.
   *
   * The SKU is unique within the organization without regard to capitalisation,
   * and the check names the product that already holds it. The audit entry is
   * written in the same transaction as the product, so the trail can never
   * describe something that was rolled back.
   */
  async create(organizationId: string, userId: string, dto: CreateProductDto) {
    const sku = dto.sku.trim();

    return this.transaction.runInTransaction(async (tx) => {
      // 1. The category and the unit must belong to THIS organization.
      await this.assertCategoryAndUnit(tx, organizationId, dto.categoryId, dto.unitId);

      // 2. The SKU must be free.
      const existing = await tx.product.findFirst({
        where: { organizationId, sku: { equals: sku, mode: 'insensitive' } },
        select: { id: true, sku: true, name: true },
      });
      if (existing) {
        throw new AppException(
          ERROR_CODES.DUPLICATE_RECORD,
          [
            {
              field: 'sku',
              code: 'DUPLICATE',
              message: `A product with SKU "${existing.sku}" already exists: ${existing.name}`,
            },
          ],
          `A product with this SKU already exists: ${existing.name}`,
        );
      }

      // 3. The product.
      const product = await tx.product.create({
        data: {
          organizationId,
          sku,
          name: dto.name.trim(),
          categoryId: dto.categoryId,
          unitId: dto.unitId,
          purchasePrice: new Prisma.Decimal(dto.purchasePrice),
          sellingPrice: new Prisma.Decimal(dto.sellingPrice),
          lowStockThreshold:
            dto.lowStockThreshold === undefined
              ? null
              : new Prisma.Decimal(dto.lowStockThreshold),
          isArchived: false,
          version: 1,
        },
      });

      // 4. The audit entry, in the same transaction.
      await this.audit.record({
        organizationId,
        userId,
        action: AUDIT_ACTIONS.productsCreated,
        recordType: 'product',
        recordId: product.id,
        after: this.auditValues(product),
      });

      return this.toResponse(product);
    });
  }

  /** Reads one product, scoped to the organization. */
  async findById(organizationId: string, id: string) {
    const product = await this.prisma.product.findUnique({
      where: { organizationId_id: { organizationId, id } },
    });
    if (!product) {
      throw new NotFoundException('Product not found.');
    }
    return this.toResponse(product);
  }

  /**
   * Lists the organization's products.
   *
   * The search term is literal text: the characters that would otherwise act as
   * wildcards are escaped, so a search for "100%" finds the products that
   * contain a percent sign rather than every product.
   */
  async list(organizationId: string, dto: ListProductsDto) {
    const where: Prisma.ProductWhereInput = { organizationId };

    // The query's values are read defensively: a missing or malformed one must
    // never reach the database as NaN or as an unknown column.
    const status = dto.status ?? 'active';
    if (status === 'active') {
      where.isArchived = false;
    } else if (status === 'archived') {
      where.isArchived = true;
    }

    if (dto.categoryId) {
      where.categoryId = dto.categoryId;
    }

    const search = dto.search?.trim();
    if (search) {
      const escaped = escapeSqlWildcards(search);
      where.OR = [
        { sku: { contains: escaped, mode: 'insensitive' } },
        { name: { contains: escaped, mode: 'insensitive' } },
      ];
    }

    const page = Math.max(1, Number(dto.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(dto.pageSize ?? 25) || 25));
    const skip = (page - 1) * pageSize;

    const sortBy = SORTABLE_COLUMNS.includes(dto.sortBy)
      ? dto.sortBy
      : 'name';
    const sortOrder = dto.sortOrder === 'desc' ? 'desc' : 'asc';

    const orderBy: Prisma.ProductOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items: items.map((product) => this.toResponse(product)),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Updates a product.
   *
   * The version the caller read travels with the change. If the product has
   * moved on, the change is refused and nothing is written - a silent overwrite
   * would lose a price nobody can reconstruct.
   */
  async update(
    organizationId: string,
    userId: string,
    id: string,
    dto: UpdateProductDto,
  ) {
    return this.transaction.runInTransaction(async (tx) => {
      const existing = await tx.product.findUnique({
        where: { organizationId_id: { organizationId, id } },
      });
      if (!existing) {
        throw new NotFoundException('Product not found.');
      }

      if (existing.version !== dto.version) {
        throw new AppException(
          ERROR_CODES.STALE_VERSION,
          [
            {
              field: 'version',
              code: 'STALE_VERSION',
              message: `This product has changed since you opened it (it is now version ${existing.version}). Reload it and try again.`,
            },
          ],
          'This product changed since you opened it. Reload it and try again.',
        );
      }

      await this.assertCategoryAndUnit(tx, organizationId, dto.categoryId, dto.unitId);

      const sku = dto.sku.trim();
      const conflict = await tx.product.findFirst({
        where: {
          organizationId,
          id: { not: id },
          sku: { equals: sku, mode: 'insensitive' },
        },
        select: { id: true, sku: true, name: true },
      });
      if (conflict) {
        throw new AppException(
          ERROR_CODES.DUPLICATE_RECORD,
          [
            {
              field: 'sku',
              code: 'DUPLICATE',
              message: `A product with SKU "${conflict.sku}" already exists: ${conflict.name}`,
            },
          ],
          `A product with this SKU already exists: ${conflict.name}`,
        );
      }

      // 4. The version is part of the write's WHERE clause: a change prepared
      // against a moved-on version matches no row and is refused. A plain
      // read-check-write here races with a concurrent change and would
      // silently accept it (Principle III).
      const applied = await tx.product.updateMany({
        where: { organizationId, id, version: dto.version },
        data: {
          sku,
          name: dto.name.trim(),
          categoryId: dto.categoryId,
          unitId: dto.unitId,
          purchasePrice: new Prisma.Decimal(dto.purchasePrice),
          sellingPrice: new Prisma.Decimal(dto.sellingPrice),
          lowStockThreshold:
            dto.lowStockThreshold === undefined
              ? null
              : new Prisma.Decimal(dto.lowStockThreshold),
          version: { increment: 1 },
        },
      });
      if (applied.count === 0) {
        const current = await tx.product.findUnique({
          where: { organizationId_id: { organizationId, id } },
          select: { version: true },
        });
        if (!current) {
          throw new NotFoundException('Product not found.');
        }
        throw new AppException(
          ERROR_CODES.STALE_VERSION,
          [
            {
              field: 'version',
              code: 'STALE_VERSION',
              message: `This product has changed since you opened it (it is now version ${current.version}). Reload it and try again.`,
            },
          ],
          'This product changed since you opened it. Reload it and try again.',
        );
      }

      const updated = await tx.product.findUniqueOrThrow({
        where: { organizationId_id: { organizationId, id } },
      });

      await this.audit.record({
        organizationId,
        userId,
        action: AUDIT_ACTIONS.productsUpdated,
        recordType: 'product',
        recordId: updated.id,
        before: this.auditValues(existing),
        after: this.auditValues(updated),
      });

      return this.toResponse(updated);
    });
  }

  /**
   * Archives a product.
   *
   * Archival is the only way to retire a product: there is no delete. When the
   * usage check reports the product in use - open documents or reserved stock -
   * the archive is refused and the product stays active.
   */
  async archive(organizationId: string, userId: string, id: string) {
    return this.transaction.runInTransaction(async (tx) => {
      const existing = await tx.product.findUnique({
        where: { organizationId_id: { organizationId, id } },
      });
      if (!existing) {
        throw new NotFoundException('Product not found.');
      }

      if (existing.isArchived) {
        throw new AppException(
          ERROR_CODES.INVALID_STATE_TRANSITION,
          [{ field: 'isArchived', code: 'INVALID_STATE_TRANSITION', message: 'This product is already archived.' }],
          'This product is already archived.',
        );
      }

      const usage = await this.usageHook.isInUse(organizationId, id);
      if (usage.inUse) {
        throw new AppException(
          ERROR_CODES.PRODUCT_IN_USE,
          [{ field: 'isArchived', code: 'PRODUCT_IN_USE', message: usage.reason ?? 'This product is referenced by open documents or reserved stock.' }],
          usage.reason ?? 'This product is referenced by open documents or reserved stock.',
        );
      }

      // The state transition is part of the write's WHERE clause: two
      // concurrent archives cannot both succeed (Principle III).
      const applied = await tx.product.updateMany({
        where: { organizationId, id, isArchived: false },
        data: { isArchived: true, version: { increment: 1 } },
      });
      if (applied.count === 0) {
        const current = await tx.product.findUnique({
          where: { organizationId_id: { organizationId, id } },
          select: { isArchived: true },
        });
        if (!current) {
          throw new NotFoundException('Product not found.');
        }
        throw new AppException(
          ERROR_CODES.INVALID_STATE_TRANSITION,
          [{ field: 'isArchived', code: 'INVALID_STATE_TRANSITION', message: 'This product is already archived.' }],
          'This product is already archived.',
        );
      }

      const archived = await tx.product.findUniqueOrThrow({
        where: { organizationId_id: { organizationId, id } },
      });

      await this.audit.record({
        organizationId,
        userId,
        action: AUDIT_ACTIONS.productsArchived,
        recordType: 'product',
        recordId: archived.id,
        before: this.auditValues(existing),
        after: this.auditValues(archived),
      });

      return this.toResponse(archived);
    });
  }

  /** Restores an archived product. */
  async restore(organizationId: string, userId: string, id: string) {
    return this.transaction.runInTransaction(async (tx) => {
      const existing = await tx.product.findUnique({
        where: { organizationId_id: { organizationId, id } },
      });
      if (!existing) {
        throw new NotFoundException('Product not found.');
      }

      if (!existing.isArchived) {
        throw new AppException(
          ERROR_CODES.INVALID_STATE_TRANSITION,
          [{ field: 'isArchived', code: 'INVALID_STATE_TRANSITION', message: 'This product is not archived.' }],
          'This product is not archived.',
        );
      }

      // The state transition is part of the write's WHERE clause: two
      // concurrent restores cannot both succeed (Principle III).
      const applied = await tx.product.updateMany({
        where: { organizationId, id, isArchived: true },
        data: { isArchived: false, version: { increment: 1 } },
      });
      if (applied.count === 0) {
        const current = await tx.product.findUnique({
          where: { organizationId_id: { organizationId, id } },
          select: { isArchived: true },
        });
        if (!current) {
          throw new NotFoundException('Product not found.');
        }
        throw new AppException(
          ERROR_CODES.INVALID_STATE_TRANSITION,
          [{ field: 'isArchived', code: 'INVALID_STATE_TRANSITION', message: 'This product is not archived.' }],
          'This product is not archived.',
        );
      }

      const restored = await tx.product.findUniqueOrThrow({
        where: { organizationId_id: { organizationId, id } },
      });

      await this.audit.record({
        organizationId,
        userId,
        action: AUDIT_ACTIONS.productsRestored,
        recordType: 'product',
        recordId: restored.id,
        before: this.auditValues(existing),
        after: this.auditValues(restored),
      });

      return this.toResponse(restored);
    });
  }

  /** The organization's categories. */
  async listCategories(organizationId: string) {
    const categories = await this.prisma.productCategory.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    return categories;
  }

  /**
   * Creates a category.
   *
   * The name is unique within the organization without regard to capitalisation;
   * the refusal names the category that already holds it.
   */
  async createCategory(organizationId: string, userId: string, dto: CreateCategoryDto) {
    const name = dto.name.trim();

    return this.transaction.runInTransaction(async (tx) => {
      const existing = await tx.productCategory.findFirst({
        where: { organizationId, name: { equals: name, mode: 'insensitive' } },
        select: { id: true, name: true },
      });
      if (existing) {
        throw new AppException(
          ERROR_CODES.DUPLICATE_RECORD,
          [{ field: 'name', code: 'DUPLICATE', message: `A category named "${existing.name}" already exists.` }],
          `A category named "${existing.name}" already exists.`,
        );
      }

      const category = await tx.productCategory.create({
        data: { organizationId, name },
        select: { id: true, name: true },
      });

      await this.audit.record({
        organizationId,
        userId,
        action: AUDIT_ACTIONS.productCategoriesCreated,
        recordType: 'product_category',
        recordId: category.id,
        after: { name: category.name },
      });

      return category;
    });
  }

  /** The organization's units of measure. */
  async listUnits(organizationId: string) {
    const units = await this.prisma.unitOfMeasure.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, abbreviation: true },
    });
    return units;
  }

  /** Creates a unit of measure. */
  async createUnit(organizationId: string, userId: string, dto: CreateUnitDto) {
    const name = dto.name.trim();
    const abbreviation = dto.abbreviation.trim();

    return this.transaction.runInTransaction(async (tx) => {
      const existing = await tx.unitOfMeasure.findFirst({
        where: { organizationId, name: { equals: name, mode: 'insensitive' } },
        select: { id: true, name: true },
      });
      if (existing) {
        throw new AppException(
          ERROR_CODES.DUPLICATE_RECORD,
          [{ field: 'name', code: 'DUPLICATE', message: `A unit named "${existing.name}" already exists.` }],
          `A unit named "${existing.name}" already exists.`,
        );
      }

      const unit = await tx.unitOfMeasure.create({
        data: { organizationId, name, abbreviation },
        select: { id: true, name: true, abbreviation: true },
      });

      await this.audit.record({
        organizationId,
        userId,
        action: AUDIT_ACTIONS.unitsOfMeasureCreated,
        recordType: 'unit_of_measure',
        recordId: unit.id,
        after: { name: unit.name, abbreviation: unit.abbreviation },
      });

      return unit;
    });
  }

  /**
   * Asserts that the given products may be ordered, and returns what the
   * caller needs to write the order lines.
   *
   * Every product must exist in THIS organization and must not be archived.
   * The rows are locked with FOR SHARE in ascending identifier order, so an
   * archive waits for the order to commit instead of slipping between the
   * check and the write, and two order writers take the same locks in the same
   * order.
   *
   * The unit-of-measure ABBREVIATION travels with the summary: the order line
   * captures it, so a later change of the product's unit cannot rewrite the
   * document or its receipt history.
   */
  async assertSelectableForOrder(
    tx: TransactionClient,
    organizationId: string,
    productIds: readonly string[],
  ): Promise<
    {
      id: string;
      sku: string;
      name: string;
      purchasePrice: string;
      unitOfMeasure: string;
    }[]
  > {
    if (productIds.length === 0) return [];

    const rows = await tx.$queryRaw<
      {
        id: string;
        sku: string;
        name: string;
        is_archived: boolean;
        purchase_price: Prisma.Decimal;
        unit_of_measure: string;
      }[]
    >(Prisma.sql`
      SELECT p."id", p."sku", p."name", p."is_archived", p."purchase_price", u."abbreviation" AS "unit_of_measure"
      FROM "products" p
      JOIN "units_of_measure" u
        ON u."organization_id" = p."organization_id"
       AND u."id" = p."unit_id"
      WHERE p."organization_id" = ${organizationId}::uuid
        AND p."id" IN (${Prisma.join(productIds.map((id) => Prisma.sql`${id}::uuid`))})
      ORDER BY p."id"
      FOR SHARE OF p
    `);

    const found = new Map(rows.map((row) => [row.id, row]));
    const summaries = [] as {
      id: string;
      sku: string;
      name: string;
      purchasePrice: string;
      unitOfMeasure: string;
    }[];

    for (const productId of productIds) {
      const product = found.get(productId);
      if (product === undefined) {
        throw new NotFoundException('Product not found.');
      }
      if (product.is_archived) {
        throw new AppException(
          ERROR_CODES.PRODUCT_ARCHIVED,
          [
            {
              field: 'productId',
              code: 'PRODUCT_ARCHIVED',
              message: 'This product is archived and cannot be ordered.',
            },
          ],
          'This product is archived and cannot be ordered.',
        );
      }
      summaries.push({
        id: product.id,
        sku: product.sku,
        name: product.name,
        purchasePrice: product.purchase_price.toFixed(4),
        unitOfMeasure: product.unit_of_measure,
      });
    }

    return summaries;
  }

  /**
   * Asserts that the given products may be sold, and returns their selling
   * prices. The rows are locked with FOR SHARE in ascending identifier order,
   * so two concurrent confirmations cannot deadlock. Refuses an archived
   * product.
   */
  async assertSelectableForSale(
    tx: TransactionClient,
    organizationId: string,
    productIds: readonly string[],
  ): Promise<{ id: string; sku: string; name: string; sellingPrice: string }[]> {
    if (productIds.length === 0) return [];

    const rows = await tx.$queryRaw<
      {
        id: string;
        sku: string;
        name: string;
        is_archived: boolean;
        selling_price: Prisma.Decimal;
      }[]
    >(Prisma.sql`
      SELECT p."id", p."sku", p."name", p."is_archived", p."selling_price"
      FROM "products" p
      WHERE p."organization_id" = ${organizationId}::uuid
        AND p."id" IN (${Prisma.join(productIds.map((id) => Prisma.sql`${id}::uuid`))})
        ORDER BY p."id"
        FOR SHARE OF p
    `);

    const found = new Map(rows.map((row) => [row.id, row]));
    const summaries = [] as { id: string; sku: string; name: string; sellingPrice: string }[];

    for (const productId of productIds) {
      const product = found.get(productId);
      if (product === undefined) {
        throw new NotFoundException('Product not found.');
      }
      if (product.is_archived) {
        throw new AppException(
          ERROR_CODES.PRODUCT_ARCHIVED,
          [
            {
              field: 'productId',
              code: 'PRODUCT_ARCHIVED',
              message: 'This product is archived and cannot be sold.',
            },
          ],
          'This product is archived and cannot be sold.',
        );
      }
      summaries.push({
        id: product.id,
        sku: product.sku,
        name: product.name,
        sellingPrice: product.selling_price.toFixed(4),
      });
    }

    return summaries;
  }

  /**
   * The names of the given products.
   *
   * Another module needs the SKU and the name of a product to show them next
   * to one of its own records. It asks the module that owns the products
   * rather than reading the table (Constitution Principle VI).
   */
  async findNames(organizationId: string, ids: readonly string[]) {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    return this.prisma.product.findMany({
      where: { organizationId, id: { in: unique } },
      select: { id: true, sku: true, name: true },
    });
  }

  /**
   * The products whose name or SKU matches a search term.
   *
   * The list endpoints of the other modules search by product without reading
   * the products table themselves: they ask here and filter by the ids this
   * returns.
   */
  async findMatchingProductIds(
    organizationId: string,
    term: string,
    limit = 500,
  ): Promise<string[]> {
    const escaped = escapeSqlWildcards(term.trim());
    const rows = await this.prisma.product.findMany({
      where: {
        organizationId,
        OR: [
          { name: { contains: escaped, mode: 'insensitive' } },
          { sku: { contains: escaped, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
      take: limit,
    });
    return rows.map((row) => row.id);
  }

  /** The category and the unit must belong to the caller's organization. */
  private async assertCategoryAndUnit(
    tx: TransactionClient,
    organizationId: string,
    categoryId: string,
    unitId: string,
  ): Promise<void> {
    const [category, unit] = await Promise.all([
      tx.productCategory.findUnique({
        where: { organizationId_id: { organizationId, id: categoryId } },
        select: { id: true },
      }),
      tx.unitOfMeasure.findUnique({
        where: { organizationId_id: { organizationId, id: unitId } },
        select: { id: true },
      }),
    ]);

    if (!category) {
      throw new AppException(
        ERROR_CODES.VALIDATION_ERROR,
        [{ field: 'categoryId', code: 'VALIDATION_ERROR', message: 'This category does not exist in this organization.' }],
        'This category does not exist in this organization.',
      );
    }
    if (!unit) {
      throw new AppException(
        ERROR_CODES.VALIDATION_ERROR,
        [{ field: 'unitId', code: 'VALIDATION_ERROR', message: 'This unit of measure does not exist in this organization.' }],
        'This unit of measure does not exist in this organization.',
      );
    }
  }

  /** The product as the interface receives it: the amounts as decimal strings. */
  private toResponse(product: {
    id: string;
    organizationId: string;
    sku: string;
    name: string;
    categoryId: string;
    unitId: string;
    purchasePrice: Prisma.Decimal;
    sellingPrice: Prisma.Decimal;
    lowStockThreshold: Prisma.Decimal | null;
    isArchived: boolean;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: product.id,
      organizationId: product.organizationId,
      sku: product.sku,
      name: product.name,
      categoryId: product.categoryId,
      unitId: product.unitId,
      purchasePrice: product.purchasePrice.toFixed(4),
      sellingPrice: product.sellingPrice.toFixed(4),
      lowStockThreshold:
        product.lowStockThreshold === null ? null : product.lowStockThreshold.toFixed(3),
      isArchived: product.isArchived,
      version: product.version,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  /** The values an audit entry carries for a product. */
  private auditValues(product: {
    sku: string;
    name: string;
    categoryId: string;
    unitId: string;
    purchasePrice: Prisma.Decimal;
    sellingPrice: Prisma.Decimal;
    lowStockThreshold: Prisma.Decimal | null;
    isArchived: boolean;
    version: number;
  }) {
    return {
      sku: product.sku,
      name: product.name,
      categoryId: product.categoryId,
      unitId: product.unitId,
      purchasePrice: product.purchasePrice.toFixed(4),
      sellingPrice: product.sellingPrice.toFixed(4),
      lowStockThreshold:
        product.lowStockThreshold === null ? null : product.lowStockThreshold.toFixed(3),
      isArchived: product.isArchived,
      version: product.version,
    };
  }
}

/**
 * Escapes the characters that would otherwise act as wildcards in a LIKE
 * pattern, so a search term is matched as the literal text the user typed.
 */
function escapeSqlWildcards(input: string): string {
  return input.replace(/([%_\\])/g, '\\$1');
}

/** The columns a product list may be sorted by. */
const SORTABLE_COLUMNS = ['name', 'sku', 'createdAt'] as const;
