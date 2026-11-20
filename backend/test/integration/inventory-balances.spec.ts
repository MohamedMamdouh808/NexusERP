import type { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { createTestApp, loginForCookies } from '../fixtures/app';
import { getTestPrisma, resetDatabase, seedTestDatabase } from '../fixtures/database';

interface BalanceItem {
  productId: string;
  warehouseId: string;
  sku: string;
}

/** The list rows of a balances response, without trusting the untyped body. */
function balanceItems(res: { body: unknown }): BalanceItem[] {
  return (res.body as { items: BalanceItem[] }).items;
}

/**
 * Stock balances, end to end.
 *
 * A balance is a tenant-scoped record: it belongs to one organization, one
 * warehouse and one product, and the two quantities it holds are exact
 * decimals. The list has two shapes - the balance rows themselves, and the
 * product-level low-stock selection - and both are product-scoped, so another
 * organization's stock is never in the answer.
 */
describe('Inventory balances: end to end', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  let adminCookie: string;
  let adminOrgId: string;
  let adminEmail = '';
  let otherCookie: string;

  let categoryId: string;
  let unitId: string;
  let productId: string;
  let archivedProductId = '';
  let warehouseId: string;
  let otherWarehouseId: string;

  beforeAll(async () => {
    await resetDatabase();
    await seedTestDatabase();

    const { app: testApp } = await createTestApp();
    app = testApp;

    adminEmail = `admin-inventory-${Date.now()}@example.com`;
    const reg1 = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: adminEmail, password: 'Password1234' })
      .expect(201);
    adminOrgId = reg1.body.organization.id;
    adminCookie = await loginForCookies(app, adminEmail, 'Password1234');
    const otherEmail = `other-inventory-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: otherEmail, password: 'Password1234' })
      .expect(201);
    otherCookie = await loginForCookies(app, otherEmail, 'Password1234');

    const category = await request(app.getHttpServer())
      .post('/api/v1/product-categories')
      .set('Cookie', adminCookie)
      .send({ name: 'Hardware' })
      .expect(201);
    categoryId = category.body.id;

    const unit = await request(app.getHttpServer())
      .post('/api/v1/units-of-measure')
      .set('Cookie', adminCookie)
      .send({ name: 'Each', abbreviation: 'ea' })
      .expect(201);
    unitId = unit.body.id;

    const product = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({
        sku: 'SKU-BAL-1',
        name: 'Balanced Drill',
        categoryId,
        unitId,
        purchasePrice: '4.5000',
        sellingPrice: '9.9900',
        lowStockThreshold: '5.000',
      })
      .expect(201);
    productId = product.body.id;

    await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({
        sku: 'SKU-BAL-2',
        name: 'Never Stocked',
        categoryId,
        unitId,
        purchasePrice: '1.0000',
        sellingPrice: '2.0000',
        lowStockThreshold: '3.000',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({
        sku: 'SKU-BAL-3',
        name: 'No Threshold',
        categoryId,
        unitId,
        purchasePrice: '1.0000',
        sellingPrice: '2.0000',
      })
      .expect(201);

    const archived = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({
        sku: 'SKU-BAL-4',
        name: 'Discontinued Drill',
        categoryId,
        unitId,
        purchasePrice: '4.5000',
        sellingPrice: '9.9900',
      })
      .expect(201);
    archivedProductId = archived.body.id;
    await request(app.getHttpServer())
      .post(`/api/v1/products/${archivedProductId}/archive`)
      .set('Cookie', adminCookie)
      .expect(200);

    // The organization comes with one default warehouse; a second one is created
    // so the balances can be spread across two places.
    const warehouse = await request(app.getHttpServer())
      .get('/api/v1/warehouses')
      .set('Cookie', adminCookie)
      .expect(200);
    warehouseId = warehouse.body.items[0].id;

    const second = await request(app.getHttpServer())
      .post('/api/v1/warehouses')
      .set('Cookie', adminCookie)
      .send({ name: 'Overflow Warehouse' })
      .expect(201);
    otherWarehouseId = second.body.id;

    // Stock for the balanced product, in two warehouses.
    await prisma.stockBalance.create({
      data: {
        organizationId: adminOrgId,
        warehouseId,
        productId,
        onHand: '4.000',
        reserved: '1.000',
      },
    });
    await prisma.stockBalance.create({
      data: {
        organizationId: adminOrgId,
        warehouseId: otherWarehouseId,
        productId,
        onHand: '2.000',
        reserved: '0.000',
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('lists the balance rows with on hand, reserved and available', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/inventory/stock-balances')
      .set('Cookie', adminCookie)
      .expect(200);

    expect(res.body.total).toBe(2);
    expect(res.body.totalKind).toBe('rows');

    const row = balanceItems(res).find((item) => item.productId === productId && item.warehouseId === warehouseId);
    expect(row).toMatchObject({
      sku: 'SKU-BAL-1',
      productName: 'Balanced Drill',
      onHand: '4.000',
      reserved: '1.000',
      available: '3.000',
      archived: false,
      hasStockRow: true,
    });
  });

  it('returns the low-stock products at product level, including the ones with no rows', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/inventory/stock-balances?lowStockOnly=true')
      .set('Cookie', adminCookie)
      .expect(200);

    expect(res.body.totalKind).toBe('products');
    // SKU-BAL-1 holds 3.000 + 2.000 = 5.000 available across its two
    // warehouses against a threshold of 5.000 -> the total REACHES the
    // threshold, so it is low. SKU-BAL-2 holds nothing against a threshold of
    // 3.000 -> low as well, and it has no balance row at all.
    const skus = balanceItems(res).map((item) => item.sku).sort();
    expect(skus).toEqual(['SKU-BAL-1', 'SKU-BAL-2']);

    // The product with no movements shows zero and says so.
    const withoutRow = balanceItems(res).find((item) => item.sku === 'SKU-BAL-2');
    expect(withoutRow).toMatchObject({
      onHand: '0.000',
      reserved: '0.000',
      available: '0.000',
      hasStockRow: false,
      status: 'OUT_OF_STOCK',
    });

    // The product with stock shows the summed quantities.
    const withRow = balanceItems(res).find((item) => item.sku === 'SKU-BAL-1');
    expect(withRow).toMatchObject({
      onHand: '6.000',
      reserved: '1.000',
      available: '5.000',
      hasStockRow: true,
      status: 'LOW_STOCK',
    });

    // The count and the filter come from one rule, so they agree.
    expect(res.body.lowStockCount).toBe(res.body.total);
  });

  it('counts a product whose total available reaches its threshold as low', async () => {
    // 5.000 available against a threshold of 4.000 -> above it, so not low.
    await prisma.product.update({
      where: { id: productId },
      data: { lowStockThreshold: new Prisma.Decimal('4.000') },
    });

    const notLow = await request(app.getHttpServer())
      .get('/api/v1/inventory/stock-balances?lowStockOnly=true')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(balanceItems(notLow).map((item) => item.sku)).not.toContain('SKU-BAL-1');

    // Lower the threshold to exactly the total available: reaching it IS low.
    await prisma.product.update({
      where: { id: productId },
      data: { lowStockThreshold: new Prisma.Decimal('5.000') },
    });

    const low = await request(app.getHttpServer())
      .get('/api/v1/inventory/stock-balances?lowStockOnly=true')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(balanceItems(low).map((item) => item.sku)).toContain('SKU-BAL-1');
  });

  it('never counts a product without a threshold, and never counts an archived product', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/inventory/stock-balances?lowStockOnly=true')
      .set('Cookie', adminCookie)
      .expect(200);

    const skus = balanceItems(res).map((item) => item.sku);
    expect(skus).not.toContain('SKU-BAL-3');
    expect(skus).not.toContain('SKU-BAL-4');
  });

  it('lists archived products that still hold stock only when asked for them', async () => {
    await prisma.stockBalance.create({
      data: {
        organizationId: adminOrgId,
        warehouseId,
        productId: archivedProductId,
        onHand: '3.000',
        reserved: '0.000',
      },
    });

    const defaultList = await request(app.getHttpServer())
      .get('/api/v1/inventory/stock-balances')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(balanceItems(defaultList).map((item) => item.sku)).not.toContain('SKU-BAL-4');

    const archivedOnly = await request(app.getHttpServer())
      .get('/api/v1/inventory/stock-balances?status=archivedWithStock')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(balanceItems(archivedOnly).map((item) => item.sku)).toEqual(['SKU-BAL-4']);
    expect(archivedOnly.body.items[0]).toMatchObject({ archived: true });
  });

  it('matches a search term literally, treating wildcards as text', async () => {
    const literal = await request(app.getHttpServer())
      .get('/api/v1/inventory/stock-balances?search=%25')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(literal.body.total).toBe(0);

    const bySku = await request(app.getHttpServer())
      .get('/api/v1/inventory/stock-balances?search=SKU-BAL-1')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(bySku.body.items.length).toBeGreaterThan(0);
  });

  it('filters by warehouse and caps the page size', async () => {
    const byWarehouse = await request(app.getHttpServer())
      .get(`/api/v1/inventory/stock-balances?warehouseId=${otherWarehouseId}`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(balanceItems(byWarehouse).every((item) => item.warehouseId === otherWarehouseId)).toBe(true);

    const capped = await request(app.getHttpServer())
      .get('/api/v1/inventory/stock-balances?pageSize=5000')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(capped.body.items.length).toBeLessThanOrEqual(100);
  });

  it('reports a total that spans the pages, not the page', async () => {
    // Fifteen more balance rows, each with the movement that explains it, so
    // the invariant "on hand equals the sum of movements" keeps holding.
    const adminUser = await prisma.user.findFirst({
      where: { email: adminEmail },
    });
    const products: { id: string }[] = [];
    for (let i = 1; i <= 15; i += 1) {
      const padded = String(i).padStart(2, '0');
      const product = await prisma.product.create({
        data: {
          organizationId: adminOrgId,
          sku: `SKU-BAL-PG-${padded}`,
          name: `Paged Product ${padded}`,
          categoryId,
          unitId,
          purchasePrice: new Prisma.Decimal('1.0000'),
          sellingPrice: new Prisma.Decimal('2.0000'),
        },
        select: { id: true },
      });
      products.push(product);
      await prisma.stockBalance.create({
        data: {
          organizationId: adminOrgId,
          warehouseId,
          productId: product.id,
          onHand: '5.000',
          reserved: '0.000',
        },
      });
      await prisma.stockMovement.create({
        data: {
          organizationId: adminOrgId,
          warehouseId,
          productId: product.id,
          type: 'ADJUSTMENT',
          quantityDelta: new Prisma.Decimal('5.000'),
          reason: 'FOUND',
          sourceType: 'ADJUSTMENT',
          sourceNumber: `ADJ-PG-${padded}`,
          userId: adminUser?.id ?? null,
        },
      });
    }

    // Two original rows plus these fifteen: the total counts SEVENTEEN rows
    // even though one page holds five.
    const page1 = await request(app.getHttpServer())
      .get('/api/v1/inventory/stock-balances?pageSize=5&page=1')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(page1.body.items.length).toBe(5);
    expect(page1.body.total).toBe(17);

    const page2 = await request(app.getHttpServer())
      .get('/api/v1/inventory/stock-balances?pageSize=5&page=2')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(page2.body.items.length).toBe(5);
    const page1Ids = new Set(balanceItems(page1).map((item) => `${item.productId}|${item.warehouseId}`));
    for (const item of page2.body.items as { productId: string; warehouseId: string }[]) {
      expect(page1Ids.has(`${item.productId}|${item.warehouseId}`)).toBe(false);
    }
  });

  it('answers another organization with nothing, and refuses a caller without the permission', async () => {
    const other = await request(app.getHttpServer())
      .get('/api/v1/inventory/stock-balances')
      .set('Cookie', otherCookie)
      .expect(200);
    expect(other.body.total).toBe(0);
    expect(other.body.items).toEqual([]);

    const anonymous = await request(app.getHttpServer())
      .get('/api/v1/inventory/stock-balances')
      .expect(401);
    expect(anonymous.status).toBe(401);
  });
});
