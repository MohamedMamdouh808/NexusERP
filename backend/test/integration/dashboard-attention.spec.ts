import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, loginAndChangePassword, loginForCookies } from '../fixtures/app';
import { resetDatabase, seedTestDatabase } from '../fixtures/database';

/**
 * The dashboard "needs attention" lists (T017, feature 017).
 *
 * The Overview shows an order needing receipt, a shipped order without an
 * invoice, an overdue receivable and a low-stock product - each through the
 * module's own endpoint with the same filters, never through a second,
 * disagreeing definition of "needs attention".
 */
describe('Dashboard attention lists: end to end', () => {
  let app: INestApplication;
  
  let adminCookie: string;
  let otherCookie: string;
  let otherNoReportsCookie: string;
  let categoryId: string;
  let unitId: string;
  let productId: string;
  let lowStockProductId: string;
  let supplierId: string;
  let customerId: string;
  let poConfirmedId: string;
  let poPartialId: string;

  let keyCounter = 0;
  const nextKey = (): string => `att-key-${Date.now()}-${(keyCounter += 1)}`;

  beforeAll(async () => {
    await resetDatabase();
    await seedTestDatabase();

    const { app: testApp } = await createTestApp();
    app = testApp;

    const adminEmail = `admin-att-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: adminEmail, password: 'Password1234' })
      .expect(201);
    adminCookie = await loginForCookies(app, adminEmail, 'Password1234');

    const otherEmail = `other-att-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: otherEmail, password: 'Password1234' })
      .expect(201);
    otherCookie = await loginForCookies(app, otherEmail, 'Password1234');

    // A member holding ONLY invoices.read: neither reports.read nor purchasing.read.
    const roles = await request(app.getHttpServer())
      .post('/api/v1/roles')
      .set('Cookie', adminCookie)
      .send({ name: `Attention reader-${Date.now()}`, key: `attention-reader-${Date.now()}`, permissionCodes: ['invoices.read'] })
      .expect(201);
    const readerEmail = `preader-att-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', adminCookie)
      .send({ email: readerEmail, name: 'Purchasing Reader', password: 'Password1234', roleIds: [roles.body.id] })
      .expect(201);
    otherNoReportsCookie = await loginAndChangePassword(app, readerEmail, 'Password1234');

    const category = await request(app.getHttpServer())
      .post('/api/v1/product-categories')
      .set('Cookie', adminCookie)
      .send({ name: 'Attention category' })
      .expect(201);
    categoryId = category.body.id as string;

    const units = await request(app.getHttpServer())
      .get('/api/v1/units-of-measure')
      .set('Cookie', adminCookie)
      .expect(200);
    unitId = (units.body as Array<{ id: string; name: string }>).find((unit) => unit.name === 'roll')!.id;

    const warehouses = await request(app.getHttpServer())
      .get('/api/v1/warehouses')
      .set('Cookie', adminCookie)
      .expect(200);
    const warehouseId = (warehouses.body.items as Array<{ id: string; isDefault: boolean }>).find((w) => w.isDefault)!.id;

    const product = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({
        sku: `SKU-ATT-${Date.now()}`,
        name: 'Attention bolt',
        categoryId,
        unitId,
        purchasePrice: '1.0000',
        sellingPrice: '10.0000',
      })
      .expect(201);
    productId = product.body.id as string;

    const lowProduct = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({
        sku: `SKU-ATT-LOW-${Date.now()}`,
        name: 'Attention low stock',
        categoryId,
        unitId,
        purchasePrice: '1.0000',
        sellingPrice: '5.0000',
        lowStockThreshold: '5.000',
      })
      .expect(201);
    lowStockProductId = lowProduct.body.id as string;

    await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `att-stock-a-${Date.now()}`)
      .send({ warehouseId, productId, quantity: '1000.000', reason: 'COUNT_CORRECTION', note: 'Attention suite stock.' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `att-stock-b-${Date.now()}`)
      .send({ warehouseId, productId: lowStockProductId, quantity: '2.000', reason: 'COUNT_CORRECTION', note: 'Attention suite low stock.' })
      .expect(201);

    const supplier = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Cookie', adminCookie)
      .send({ name: 'Attention Supplier', isSupplier: true })
      .expect(201);
    supplierId = supplier.body.id as string;

    const customer = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Cookie', adminCookie)
      .send({ name: 'Attention Customer', isCustomer: true })
      .expect(201);
    customerId = customer.body.id as string;

    // PO-1: confirmed, awaiting receipt.
    const po1 = await request(app.getHttpServer())
      .post('/api/v1/purchase-orders')
      .set('Cookie', adminCookie)
      .send({
        supplierId,
        warehouseId,
        orderDate: '2026-11-16',
        expectedDate: null,
        notes: '',
        lines: [{ productId, quantity: '10.000', unitCost: '10.0000' }],
      })
      .expect(201);
    poConfirmedId = po1.body.id as string;
    await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${poConfirmedId}/confirm`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', nextKey())
      .send({ version: 1 })
      .expect(200);

    // PO-2: partially received, still awaiting the rest.
    const po2 = await request(app.getHttpServer())
      .post('/api/v1/purchase-orders')
      .set('Cookie', adminCookie)
      .send({
        supplierId,
        warehouseId,
        orderDate: '2026-11-16',
        expectedDate: null,
        notes: '',
        lines: [{ productId, quantity: '10.000', unitCost: '10.0000' }],
      })
      .expect(201);
    poPartialId = po2.body.id as string;
    const po2Detail = await request(app.getHttpServer())
      .get(`/api/v1/purchase-orders/${poPartialId}`)
      .set('Cookie', adminCookie)
      .expect(200);
    const lineId = (po2Detail.body.lines as Array<{ id: string }>)[0]!.id;
    await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${poPartialId}/confirm`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', nextKey())
      .send({ version: 1 })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${poPartialId}/receipts`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', nextKey())
      .send({ lines: [{ lineId, productId, quantity: '4.000' }] })
      .expect(201);

    // A draft purchase order: must never appear in "awaiting receipt".
    await request(app.getHttpServer())
      .post('/api/v1/purchase-orders')
      .set('Cookie', adminCookie)
      .send({
        supplierId,
        warehouseId,
        orderDate: '2026-11-16',
        expectedDate: null,
        notes: '',
        lines: [{ productId, quantity: '1.000', unitCost: '10.0000' }],
      })
      .expect(201);

    // An overdue receivable: ship, invoice, issue, backdate.
    const order = await request(app.getHttpServer())
      .post('/api/v1/sales-orders')
      .set('Cookie', adminCookie)
      .send({
        customerId,
        warehouseId,
        orderDate: '2026-11-16',
        notes: '',
        lines: [{ productId, quantity: '1.000', unitPrice: '10.0000' }],
      })
      .expect(201);
    const orderId = order.body.id as string;
    await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/confirm`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', nextKey())
      .send({ version: 1 })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/shipments`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', nextKey())
      .send({})
      .expect(201);
    const draft = await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/invoices`)
      .set('Cookie', adminCookie)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/invoices/${draft.body.id}/issue`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', nextKey())
      .send({})
      .expect(200);
    // An overdue invoice cannot be manufactured inside a suite - the
    // immutability trigger allows due_date changes only on drafts. The
    // overdue figures are asserted against an honest empty selection.
  }, 240_000);

  afterAll(async () => {
    await app.close();
  }, 120_000);

  it('lists CONFIRMED and PARTIALLY_RECEIVED together, and never the draft', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/purchase-orders?status=CONFIRMED,PARTIALLY_RECEIVED&page=1&pageSize=10')
      .set('Cookie', adminCookie)
      .expect(200);

    const numbers = (res.body.items as Array<{ id: string }>).map((row) => row.id);
    expect(numbers).toContain(poConfirmedId);
    expect(numbers).toContain(poPartialId);
    expect(numbers).toHaveLength(2);
    expect(res.body.total).toBe(2);
  });

  it('accepts the comma-separated list only when every part is a known status', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/purchase-orders?status=CONFIRMED,BOGUS')
      .set('Cookie', adminCookie)
      .expect(400);
  });

  it('honours the single-status form exactly as before', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/purchase-orders?status=PARTIALLY_RECEIVED&page=1&pageSize=10')
      .set('Cookie', adminCookie)
      .expect(200);

    const numbers = (res.body.items as Array<{ id: string }>).map((row) => row.id);
    expect(numbers).toEqual([poPartialId]);
  });

  it('does not leak purchase orders across organizations', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/purchase-orders?status=CONFIRMED,PARTIALLY_RECEIVED&page=1&pageSize=10')
      .set('Cookie', otherCookie)
      .expect(200);

    expect(res.body.items).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('refuses the list without purchasing.read', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/purchase-orders?status=CONFIRMED,PARTIALLY_RECEIVED')
      .set('Cookie', otherNoReportsCookie)
      .expect(403);
  });

  it('counts the same low-stock products the low-stock filter counts', async () => {
    const kpi = await request(app.getHttpServer())
      .get('/api/v1/reports/kpi-summary?start=2026-10-01&end=2026-12-31')
      .set('Cookie', adminCookie)
      .expect(200);
    const list = await request(app.getHttpServer())
      .get('/api/v1/inventory/stock-balances?lowStockOnly=true&page=1&pageSize=1')
      .set('Cookie', adminCookie)
      .expect(200);

    const lowStockKpi = (kpi.body.kpis as Array<{ key: string; value: string }>).find((entry) => entry.key === 'lowStockProductCount');
    expect(lowStockKpi?.value).toBe(String(list.body.total));
    expect(lowStockKpi?.value).toBe('1');
  });

  it('agrees with the invoice list about the outstanding figure, and an empty overdue selection', async () => {
    const kpi = await request(app.getHttpServer())
      .get('/api/v1/reports/kpi-summary?start=2026-10-01&end=2026-12-31')
      .set('Cookie', adminCookie)
      .expect(200);
    const listAll = await request(app.getHttpServer())
      .get('/api/v1/invoices')
      .set('Cookie', adminCookie)
      .expect(200);
    const listOverdue = await request(app.getHttpServer())
      .get('/api/v1/invoices?overdue=true')
      .set('Cookie', adminCookie)
      .expect(200);

    const outstandingKpi = (kpi.body.kpis as Array<{ key: string; value: string }>).find((entry) => entry.key === 'outstanding');
    const outstandingCountKpi = (kpi.body.kpis as Array<{ key: string; value: string }>).find((entry) => entry.key === 'outstandingInvoiceCount');
    const overdueKpi = (kpi.body.kpis as Array<{ key: string; value: string }>).find((entry) => entry.key === 'overdueInvoiceCount');
    expect(outstandingKpi?.value).toBe(listAll.body.outstanding);
    expect(outstandingCountKpi?.value).toBe('1');
    // No invoice in this suite is overdue, and both sides say so.
    expect(listOverdue.body.items).toEqual([]);
    expect(overdueKpi?.value).toBe('0');
  });
});
