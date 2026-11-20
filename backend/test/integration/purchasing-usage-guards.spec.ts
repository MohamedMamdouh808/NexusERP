import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, loginForCookies } from '../fixtures/app';
import { getTestPrisma, resetDatabase, seedTestDatabase } from '../fixtures/database';

/**
 * The usage guards.
 *
 * An open purchase order must never point at a retired record: archiving the
 * product, archiving the supplier or deactivating the warehouse is refused
 * while an order still names it, and the refusal names the order so the user
 * can resolve it. A RECEIVED or CANCELLED order is closed - it keeps its
 * history and blocks nothing.
 */
describe('Purchasing usage guards: end to end', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  let adminCookie: string;
  let categoryId: string;
  let unitId: string;
  let productId: string;
  let supplierId: string;
  let warehouseId: string;

  beforeAll(async () => {
    await resetDatabase();
    await seedTestDatabase();

    const { app: testApp } = await createTestApp();
    app = testApp;

    const adminEmail = `admin-guards-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: adminEmail, password: 'Password1234' })
      .expect(201);
    adminCookie = await loginForCookies(app, adminEmail, 'Password1234');

    const category = await request(app.getHttpServer())
      .post('/api/v1/product-categories')
      .set('Cookie', adminCookie)
      .send({ name: 'Hardware' })
      .expect(201);
    categoryId = category.body.id;

    const units = await request(app.getHttpServer())
      .get('/api/v1/units-of-measure')
      .set('Cookie', adminCookie)
      .expect(200);
    unitId = (units.body as Array<{ id: string; name: string }>).find(
      (unit) => unit.name === 'roll',
    )!.id;

    const product = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({
        sku: 'SKU-GUARD-1',
        name: 'Guarded bolt',
        categoryId,
        unitId,
        purchasePrice: '1.2345',
        sellingPrice: '9.9900',
      })
      .expect(201);
    productId = product.body.id;

    const supplier = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Cookie', adminCookie)
      .send({ name: 'Guarded Supplies', isSupplier: true })
      .expect(201);
    supplierId = supplier.body.id;

    const warehouse = await request(app.getHttpServer())
      .post('/api/v1/warehouses')
      .set('Cookie', adminCookie)
      .send({ name: 'Guarded warehouse' })
      .expect(201);
    warehouseId = warehouse.body.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** A draft order naming the product, the supplier and the warehouse. */
  const createDraftOrder = async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/purchase-orders')
      .set('Cookie', adminCookie)
      .send({
        supplierId,
        warehouseId,
        orderDate: '2026-11-13',
        expectedDate: null,
        notes: '',
        lines: [{ productId, quantity: '5.000', unitCost: '1.2345' }],
      })
      .expect(201);
    return created.body as { id: string; number: string };
  };

  it('refuses to archive a product an open order names, and names the order', async () => {
    const order = await createDraftOrder();

    const refused = await request(app.getHttpServer())
      .post(`/api/v1/products/${productId}/archive`)
      .set('Cookie', adminCookie)
      .send({ version: 1 })
      .expect(409);
    expect(refused.body.code).toBe('PRODUCT_IN_USE');
    expect(JSON.stringify(refused.body.details)).toContain(order.number);

    // The product is still active.
    const product = await request(app.getHttpServer())
      .get(`/api/v1/products/${productId}`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(product.body.isArchived).toBe(false);

    // A closed order blocks nothing.
    await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${order.id}/cancel`)
      .set('Cookie', adminCookie)
      .send({ version: 1 })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/products/${productId}/archive`)
      .set('Cookie', adminCookie)
      .send({ version: 1 })
      .expect(200);

    // Restore it for the later tests, which still need the product.
    await request(app.getHttpServer())
      .post(`/api/v1/products/${productId}/restore`)
      .set('Cookie', adminCookie)
      .send({ version: 2 })
      .expect(200);
  });

  it('refuses to archive a supplier an open order names, and names the order', async () => {
    const order = await createDraftOrder();

    const refused = await request(app.getHttpServer())
      .post(`/api/v1/contacts/${supplierId}/archive`)
      .set('Cookie', adminCookie)
      .send({ version: 1 })
      .expect(409);
    expect(refused.body.code).toBe('CONTACT_IN_USE');
    expect(JSON.stringify(refused.body.details)).toContain(order.number);

    const contact = await request(app.getHttpServer())
      .get(`/api/v1/contacts/${supplierId}`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(contact.body.isArchived).toBe(false);

    await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${order.id}/cancel`)
      .set('Cookie', adminCookie)
      .send({ version: 1 })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/contacts/${supplierId}/archive`)
      .set('Cookie', adminCookie)
      .send({ version: 1 })
      .expect(200);

    // Restore it for the later tests, which still need the supplier.
    await request(app.getHttpServer())
      .post(`/api/v1/contacts/${supplierId}/restore`)
      .set('Cookie', adminCookie)
      .send({ version: 2 })
      .expect(200);
  });

  it('refuses to deactivate a warehouse an open order names, and names the order', async () => {
    const order = await createDraftOrder();

    const warehouses = await request(app.getHttpServer())
      .get('/api/v1/warehouses')
      .set('Cookie', adminCookie)
      .expect(200);
    const warehouse = (
      warehouses.body.items as Array<{ id: string; version: number }>
    ).find((item) => item.id === warehouseId)!;

    const refused = await request(app.getHttpServer())
      .post(`/api/v1/warehouses/${warehouseId}/deactivate`)
      .set('Cookie', adminCookie)
      .send({ version: warehouse.version })
      .expect(409);
    expect(refused.body.code).toBe('WAREHOUSE_IN_USE');
    expect(JSON.stringify(refused.body.details)).toContain(order.number);

    const reread = await request(app.getHttpServer())
      .get('/api/v1/warehouses')
      .set('Cookie', adminCookie)
      .expect(200);
    const still = (reread.body.items as Array<{ id: string; isActive: boolean }>).find(
      (item) => item.id === warehouseId,
    );
    expect(still?.isActive).toBe(true);

    await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${order.id}/cancel`)
      .set('Cookie', adminCookie)
      .send({ version: 1 })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/warehouses/${warehouseId}/deactivate`)
      .set('Cookie', adminCookie)
      .send({ version: warehouse.version })
      .expect(200);

    // Reactivate it: the fixture is shared, so leaving it deactivated would
    // break any test that runs after this one.
    await request(app.getHttpServer())
      .post(`/api/v1/warehouses/${warehouseId}/reactivate`)
      .set('Cookie', adminCookie)
      .send({ version: warehouse.version + 1 })
      .expect(200);
  });
});
