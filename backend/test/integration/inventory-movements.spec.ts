import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, loginForCookies } from '../fixtures/app';
import { getTestPrisma, resetDatabase, seedTestDatabase } from '../fixtures/database';

interface MovementItem {
  productId: string;
  sku: string;
  type: string;
  quantityDelta: string;
  archived: boolean;
  createdAt: string;
}

/** The rows of a movements response, without trusting the untyped body. */
function movementItems(res: { body: unknown }): MovementItem[] {
  return (res.body as { items: MovementItem[] }).items;
}

/**
 * The movement ledger, end to end.
 *
 * Every quantity change is explained by a movement, and the ledger is the
 * history of the organization: it is read with the filters a clerk needs, it
 * shows the movements of products that were archived in the meantime, and it
 * never shows another organization's movements.
 */
describe('Inventory movements: end to end', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  let adminCookie: string;
  let adminOrgId: string;
  let productId: string;
  let archivedProductId: string;
  let warehouseId: string;
  let otherWarehouseId: string;

  beforeAll(async () => {
    await resetDatabase();
    await seedTestDatabase();

    const { app: testApp } = await createTestApp();
    app = testApp;

    const adminEmail = `admin-moves-${Date.now()}@example.com`;
    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: adminEmail, password: 'Password1234' })
      .expect(201);
    adminOrgId = registration.body.organization.id;
    adminCookie = await loginForCookies(app, adminEmail, 'Password1234');

    const category = await request(app.getHttpServer())
      .post('/api/v1/product-categories')
      .set('Cookie', adminCookie)
      .send({ name: 'Hardware' })
      .expect(201);

    const unit = await request(app.getHttpServer())
      .post('/api/v1/units-of-measure')
      .set('Cookie', adminCookie)
      .send({ name: 'Each', abbreviation: 'ea' })
      .expect(201);

    const product = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({
        sku: 'SKU-MOV-1',
        name: 'Moving Drill',
        categoryId: category.body.id,
        unitId: unit.body.id,
        purchasePrice: '4.5000',
        sellingPrice: '9.9900',
      })
      .expect(201);
    productId = product.body.id;

    const archived = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({
        sku: 'SKU-MOV-2',
        name: 'Archived Drill',
        categoryId: category.body.id,
        unitId: unit.body.id,
        purchasePrice: '4.5000',
        sellingPrice: '9.9900',
      })
      .expect(201);
    archivedProductId = archived.body.id;

    const warehouses = await request(app.getHttpServer())
      .get('/api/v1/warehouses')
      .set('Cookie', adminCookie)
      .expect(200);
    warehouseId = warehouses.body.items[0].id;

    const second = await request(app.getHttpServer())
      .post('/api/v1/warehouses')
      .set('Cookie', adminCookie)
      .send({ name: 'Overflow Warehouse' })
      .expect(201);
    otherWarehouseId = second.body.id;

    // Two movements of the active product, one of the product that is about
    // to be archived.
    await prisma.stockMovement.create({
      data: {
        organizationId: adminOrgId,
        warehouseId,
        productId,
        type: 'RECEIPT',
        quantityDelta: '12.000',
        sourceType: 'RECEIPT',
        sourceNumber: 'REC-00001',
        userId: null,
      },
    });
    await prisma.stockMovement.create({
      data: {
        organizationId: adminOrgId,
        warehouseId: otherWarehouseId,
        productId,
        type: 'SHIPMENT',
        quantityDelta: '-2.000',
        reason: 'LOSS',
        note: 'Broken on arrival',
        sourceType: 'SHIPMENT',
        sourceNumber: 'SHP-00001',
        userId: null,
      },
    });
    await prisma.stockMovement.create({
      data: {
        organizationId: adminOrgId,
        warehouseId,
        productId: archivedProductId,
        type: 'ADJUSTMENT',
        quantityDelta: '-1.000',
        reason: 'DAMAGE',
        sourceType: 'ADJUSTMENT',
        sourceNumber: 'ADJ-00001',
        userId: null,
      },
    });

    // The product is archived AFTER its movement was written: the history of a
    // discontinued product is still history.
    await request(app.getHttpServer())
      .post(`/api/v1/products/${archivedProductId}/archive`)
      .set('Cookie', adminCookie)
      .expect(200);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('lists the movements with their product, warehouse, type, quantity and source', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/inventory/stock-movements')
      .set('Cookie', adminCookie)
      .expect(200);

    expect(res.body.total).toBe(3);
    expect(res.body.items).toHaveLength(3);

    const receipt = movementItems(res).find(
      (item) => item.sku === 'SKU-MOV-1' && item.type === 'RECEIPT',
    );
    if (receipt === undefined) throw new Error('the receipt movement is missing');
    expect(receipt).toMatchObject({
      productId,
      warehouseId,
      sku: 'SKU-MOV-1',
      productName: 'Moving Drill',
      type: 'RECEIPT',
      quantityDelta: '12.000',
      sourceType: 'RECEIPT',
      sourceNumber: 'REC-00001',
      archived: false,
    });
    expect(receipt.createdAt).toBeTruthy();
  });

  it('narrows the list by product, warehouse and type', async () => {
    const byProduct = await request(app.getHttpServer())
      .get(`/api/v1/inventory/stock-movements?productId=${productId}`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(byProduct.body.total).toBe(2);
    expect(
      movementItems(byProduct).every((item) => item.productId === productId),
    ).toBe(true);

    const byWarehouse = await request(app.getHttpServer())
      .get(`/api/v1/inventory/stock-movements?warehouseId=${otherWarehouseId}`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(byWarehouse.body.total).toBe(1);
    expect(byWarehouse.body.items[0].type).toBe('SHIPMENT');

    const byType = await request(app.getHttpServer())
      .get('/api/v1/inventory/stock-movements?type=ADJUSTMENT')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(byType.body.total).toBe(1);
    expect(byType.body.items[0].sku).toBe('SKU-MOV-2');
  });

  it('refuses a range whose end precedes its start', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/inventory/stock-movements?startDate=2026-05-10&endDate=2026-05-01')
      .set('Cookie', adminCookie)
      .expect(400);

    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('narrows the list by date range', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const past = '2000-01-01';

    const inRange = await request(app.getHttpServer())
      .get(`/api/v1/inventory/stock-movements?startDate=${past}&endDate=${today}`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(inRange.body.total).toBe(3);

    const outOfRange = await request(app.getHttpServer())
      .get(`/api/v1/inventory/stock-movements?startDate=${past}&endDate=${past}`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(outOfRange.body.total).toBe(0);
  });

  it('shows the movements of an archived product, labelled as archived', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/inventory/stock-movements')
      .set('Cookie', adminCookie)
      .expect(200);

    const archived = movementItems(res).find((item) => item.sku === 'SKU-MOV-2');
    if (archived === undefined) throw new Error('the archived product movement is missing');
    expect(archived).toBeDefined();
    expect(archived.archived).toBe(true);
    expect(archived.productId).toBe(archivedProductId);
  });

  it('sorts and pages', async () => {
    const sorted = await request(app.getHttpServer())
      .get('/api/v1/inventory/stock-movements?sortBy=quantity&sortOrder=asc')
      .set('Cookie', adminCookie)
      .expect(200);

    const quantities = movementItems(sorted).map((item) => item.quantityDelta);
    expect(quantities).toEqual(['-2.000', '-1.000', '12.000']);

    const page = await request(app.getHttpServer())
      .get('/api/v1/inventory/stock-movements?pageSize=2&page=1')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(page.body.items).toHaveLength(2);
    expect(page.body.total).toBe(3);

    const secondPage = await request(app.getHttpServer())
      .get('/api/v1/inventory/stock-movements?pageSize=2&page=2')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(secondPage.body.items).toHaveLength(1);

    // The page size is capped rather than refused.
    const capped = await request(app.getHttpServer())
      .get('/api/v1/inventory/stock-movements?pageSize=5000')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(capped.body.items.length).toBeLessThanOrEqual(100);
  });

  it('answers another organization with nothing and refuses an anonymous caller', async () => {
    const otherEmail = `other-moves-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: otherEmail, password: 'Password1234' })
      .expect(201);
    const otherCookie = await loginForCookies(app, otherEmail, 'Password1234');

    const other = await request(app.getHttpServer())
      .get('/api/v1/inventory/stock-movements')
      .set('Cookie', otherCookie)
      .expect(200);
    expect(other.body.total).toBe(0);
    expect(other.body.items).toEqual([]);

    await request(app.getHttpServer()).get('/api/v1/inventory/stock-movements').expect(401);
  });
});
