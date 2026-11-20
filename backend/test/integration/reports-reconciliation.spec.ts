import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, loginForCookies } from '../fixtures/app';
import { getTestPrisma, resetDatabase, seedTestDatabase } from '../fixtures/database';

/**
 * The stock reconciliation endpoint (T0-restoration, feature 017).
 *
 * This endpoint was answering HTTP 500 on every request against the real
 * database: the reconciliation and the stock-on-hand queries both selected
 * `stock_balances.unit_of_measure_id`, a column the schema never had - the
 * balance row's unit is the PRODUCT's, `products.unit_id`. The endpoint now
 * derives the unit from the product and the whole contract is asserted
 * against the real rows.
 */
describe('Reports: stock reconciliation works (item 7)', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  let adminCookie: string;

  beforeAll(async () => {
    await resetDatabase();
    await seedTestDatabase();

    const { app: testApp } = await createTestApp();
    app = testApp;

    const adminEmail = `admin-recon-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: adminEmail, password: 'Password1234' })
      .expect(201);
    adminCookie = await loginForCookies(app, adminEmail, 'Password1234');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('answers 200 with an empty clean page', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/reports/stock-reconciliation')
      .set('Cookie', adminCookie)
      .expect(200);

    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.total).toBeGreaterThanOrEqual(0);
    expect(typeof res.body.checkedAt).toBe('string');
  });

  it('answers the stock-on-hand report against the same schema', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/reports/stock-on-hand?page=1&pageSize=25')
      .set('Cookie', adminCookie)
      .expect(200);

    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.total).toBeGreaterThanOrEqual(0);
  });

  it('reports the mismatch between the balance and the movement sum', async () => {
    const category = await request(app.getHttpServer())
      .post('/api/v1/product-categories')
      .set('Cookie', adminCookie)
      .send({ name: 'Reconciliation category' })
      .expect(201);

    const units = await request(app.getHttpServer())
      .get('/api/v1/units-of-measure')
      .set('Cookie', adminCookie)
      .expect(200);
    const unitId = (units.body as Array<{ id: string; name: string }>).find((unit) => unit.name === 'roll')!.id;

    const product = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({
        sku: `SKU-RECON-${Date.now()}`,
        name: 'Reconciliation bolt',
        categoryId: category.body.id,
        unitId,
        purchasePrice: '1.0000',
        sellingPrice: '10.0000',
      })
      .expect(201);

    const warehouses = await request(app.getHttpServer())
      .get('/api/v1/warehouses')
      .set('Cookie', adminCookie)
      .expect(200);
    const warehouseId = (warehouses.body.items as Array<{ id: string; isDefault: boolean }>).find((w) => w.isDefault)!.id;

    await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `recon-stock-${Date.now()}`)
      .send({ warehouseId, productId: product.body.id, quantity: '10.000', reason: 'COUNT_CORRECTION', note: 'Reconciliation suite stock.' })
      .expect(201);

    // The clean state: the balance matches the movement sum.
    const clean = await request(app.getHttpServer())
      .get('/api/v1/reports/stock-reconciliation')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(clean.body.items.every((item: { kinds: string[] }) => item.kinds.length === 0)).toBe(true);

    // Break it honestly: the balance no longer matches the movement sum
    // (the movement history is append-only, so the test moves the balance
    // out from under it - exactly the state reconciliation detects).
    await prisma.stockBalance.updateMany({ where: { productId: product.body.id }, data: { onHand: '15.000' } });

    const dirty = await request(app.getHttpServer())
      .get('/api/v1/reports/stock-reconciliation')
      .set('Cookie', adminCookie)
      .expect(200);
    const row = dirty.body.items.find((item: { productId: string }) => item.productId === product.body.id);
    expect(row).toBeDefined();
    expect(row.kinds).toContain('onHandMismatch');
    expect(Number(row.onHand)).toBe(15);
  });
});
