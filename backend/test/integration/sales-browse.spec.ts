import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, loginForCookies } from '../fixtures/app';
import { getTestPrisma, resetDatabase, seedTestDatabase } from '../fixtures/database';

/**
 * Sales reads: the list and the detail.
 *
 * Every total counts the whole filtered selection, not the page. The list is
 * searchable by order number or customer name, filterable by status, sortable,
 * and clamps a page size above 100 back to 100 instead of refusing.
 */
describe('Sales reads: the list', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  let adminCookie: string;
  let otherCookie: string;
  let productId: string;
  let customerId: string;
  let warehouseId: string;

  beforeAll(async () => {
    await resetDatabase();
    await seedTestDatabase();

    const { app: testApp } = await createTestApp();
    app = testApp;

    const adminEmail = `admin-browse-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: adminEmail, password: 'Password1234' })
      .expect(201);
    adminCookie = await loginForCookies(app, adminEmail, 'Password1234');

    const otherEmail = `other-browse-${Date.now()}@example.com`;
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
    const units = await request(app.getHttpServer())
      .get('/api/v1/units-of-measure')
      .set('Cookie', adminCookie)
      .expect(200);
    const unitId = (units.body as Array<{ id: string; name: string }>).find(
      (unit) => unit.name === 'roll',
    )!.id;

    const product = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({
        sku: 'SKU-BR',
        name: 'Browse bolt',
        categoryId: category.body.id,
        unitId,
        purchasePrice: '1.0000',
        sellingPrice: '5.0000',
      })
      .expect(201);
    productId = product.body.id;

    const customer = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Cookie', adminCookie)
      .send({
        code: 'CUST-BR',
        name: 'Browse Customer',
        email: 'browse@example.com',
        isCustomer: true,
      })
      .expect(201);
    customerId = customer.body.id;

    const warehouses = await request(app.getHttpServer())
      .get('/api/v1/warehouses')
      .set('Cookie', adminCookie)
      .expect(200);
    warehouseId = (warehouses.body.items as Array<{ id: string; isDefault: boolean }>).find(
      (candidate) => candidate.isDefault,
    )!.id;

    // Stock the product so one order can be confirmed and shipped: the reads
    // assert on real shipment history.
    await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', 'browse-suite-opening-stock')
      .send({
        warehouseId,
        productId,
        quantity: '10.000',
        reason: 'COUNT_CORRECTION',
        note: 'Opening stock for the reads suite.',
      })
      .expect(201);

    // Seed a draft order.
    await request(app.getHttpServer())
      .post('/api/v1/sales-orders')
      .set('Cookie', adminCookie)
      .send({
        customerId,
        warehouseId,
        orderDate: '2026-11-10',
        notes: '',
        lines: [{ productId, quantity: '1.000', unitPrice: '5.0000' }],
      })
      .expect(201);

    // Seed a second draft order, so there are at least two rows.
    await request(app.getHttpServer())
      .post('/api/v1/sales-orders')
      .set('Cookie', adminCookie)
      .send({
        customerId,
        warehouseId,
        orderDate: '2026-11-12',
        notes: 'second',
        lines: [{ productId, quantity: '2.000', unitPrice: '5.0000' }],
      })
      .expect(201);

    // Seed a third order, confirmed and shipped, so the shipment history and
    // the shipments list have something real to return.
    const shippable = await request(app.getHttpServer())
      .post('/api/v1/sales-orders')
      .set('Cookie', adminCookie)
      .send({
        customerId,
        warehouseId,
        orderDate: '2026-11-13',
        notes: 'to ship',
        lines: [{ productId, quantity: '1.000', unitPrice: '5.0000' }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${shippable.body.id}/confirm`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `browse-confirm-${shippable.body.id}`)
      .send({ version: 1 })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${shippable.body.id}/shipments`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `browse-ship-${shippable.body.id}`)
      .send({})
      .expect(201);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // -----------------------------------------------------------------------
  // T052: the order list
  // -----------------------------------------------------------------------

  it('lists orders with server-paginated rows and a whole-selection total', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/sales-orders?page=1&pageSize=100')
      .set('Cookie', adminCookie)
      .expect(200);

    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(100);
    expect(res.body.total).toBeGreaterThanOrEqual(2);
    for (const row of res.body.items) {
      expect(row.number).toMatch(/^SO-\d{6}$/);
      expect(row.customerName).toBe('Browse Customer');
      expect(row).toHaveProperty('warehouseName');
      expect(row).toHaveProperty('status');
      expect(row).toHaveProperty('orderDate');
      expect(row).toHaveProperty('total');
      expect(row).toHaveProperty('version');
    }
  });

  it('clamps a pageSize above 100 back to 100 instead of refusing', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/sales-orders?page=1&pageSize=500')
      .set('Cookie', adminCookie)
      .expect(200);

    expect(res.body.pageSize).toBe(100);
  });

  it('searches by order number and by customer name', async () => {
    const all = await request(app.getHttpServer())
      .get('/api/v1/sales-orders')
      .set('Cookie', adminCookie)
      .expect(200);
    const number = (all.body.items as Array<{ number: string }>)[0]!.number;

    const byNumber = await request(app.getHttpServer())
      .get(`/api/v1/sales-orders?search=${encodeURIComponent(number)}`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(byNumber.body.items.length).toBeGreaterThanOrEqual(1);
    expect(byNumber.body.items.every((row: { number: string }) => row.number === number)).toBe(true);

    const byCustomer = await request(app.getHttpServer())
      .get('/api/v1/sales-orders?search=Browse%20Customer')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(byCustomer.body.total).toBeGreaterThanOrEqual(1);
  });

  it('filters by status and refuses an unknown status with 400', async () => {
    const drafts = await request(app.getHttpServer())
      .get('/api/v1/sales-orders?status=DRAFT')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(drafts.body.total).toBeGreaterThanOrEqual(2);
    expect(drafts.body.items.every((row: { status: string }) => row.status === 'DRAFT')).toBe(true);

    await request(app.getHttpServer())
      .get('/api/v1/sales-orders?status=BOGUS')
      .set('Cookie', adminCookie)
      .expect(400);
  });

  it('sorts by total descending', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/sales-orders?sortBy=total&sortOrder=desc&status=DRAFT')
      .set('Cookie', adminCookie)
      .expect(200);
    const totals = (res.body.items as Array<{ total: string }>).map((row) => Number(row.total));
    const sorted = [...totals].sort((a, b) => b - a);
    expect(totals).toEqual(sorted);
  });

  it('refuses an unknown sortBy with 400', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/sales-orders?sortBy=nope')
      .set('Cookie', adminCookie)
      .expect(400);
  });

  // -----------------------------------------------------------------------
  // T053: the order detail, with shipment history
  // -----------------------------------------------------------------------

  it('returns the order with its lines and its shipment history', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/sales-orders?status=SHIPPED')
      .set('Cookie', adminCookie)
      .expect(200);
    const shipped = (list.body.items as Array<{ id: string }>)[0]!;

    const res = await request(app.getHttpServer())
      .get(`/api/v1/sales-orders/${shipped.id}`)
      .set('Cookie', adminCookie)
      .expect(200);

    expect(res.body.id).toBe(shipped.id);
    expect(res.body.status).toBe('SHIPPED');
    expect(res.body.lines.length).toBeGreaterThanOrEqual(1);
    for (const line of res.body.lines) {
      expect(line).toHaveProperty('productSku');
      expect(line).toHaveProperty('productName');
      expect(line).toHaveProperty('quantity');
      expect(line).toHaveProperty('unitPrice');
      expect(line).toHaveProperty('lineTotal');
    }
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('version');

    // The shipment history names the shipment and carries its lines.
    expect(Array.isArray(res.body.shipments)).toBe(true);
    expect(res.body.shipments.length).toBe(1);
    const history = res.body.shipments[0]!;
    expect(history.number).toMatch(/^SH-\d{6}$/);
    expect(history.lines.length).toBe(res.body.lines.length);
    const shipmentLine = history.lines[0]!;
    expect(shipmentLine).toHaveProperty('orderLineId');
    expect(shipmentLine).toHaveProperty('productSku');
    expect(shipmentLine).toHaveProperty('quantity');
  });

  // -----------------------------------------------------------------------
  // T054: the shipments list
  // -----------------------------------------------------------------------

  it('lists the shipment with its number, order and line count', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/shipments?page=1&pageSize=25')
      .set('Cookie', adminCookie)
      .expect(200);

    expect(res.body.total).toBeGreaterThanOrEqual(1);
    const row = res.body.items.find((item: { orderNumber?: string }) => item.orderNumber?.startsWith('SO-'))!;
    expect(row.number).toMatch(/^SH-\d{6}$/);
    expect(row).toHaveProperty('orderNumber');
    expect(row).toHaveProperty('customerName');
    expect(row).toHaveProperty('warehouseName');
    expect(row).toHaveProperty('shippedAt');
    expect(row).toHaveProperty('user');
    expect(row.lineCount).toBeGreaterThanOrEqual(1);
  });

  it('returns one shipment with its lines, and 404 for another organization', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/shipments')
      .set('Cookie', adminCookie)
      .expect(200);
    const shipmentId = (list.body.items as Array<{ id: string }>)[0]!.id;

    const res = await request(app.getHttpServer())
      .get(`/api/v1/shipments/${shipmentId}`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(res.body.id).toBe(shipmentId);
    expect(Array.isArray(res.body.lines)).toBe(true);
    expect(res.body.lines.length).toBeGreaterThanOrEqual(1);
    const line = res.body.lines[0]!;
    expect(line).toHaveProperty('lineId');
    expect(line).toHaveProperty('orderLineId');
    expect(line).toHaveProperty('productSku');
    expect(line).toHaveProperty('quantity');

    await request(app.getHttpServer())
      .get(`/api/v1/shipments/${shipmentId}`)
      .set('Cookie', otherCookie)
      .expect(404);
  });

  it('filters the shipment list by date range and refuses an inverted range', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/shipments?startDate=2026-01-01&endDate=2026-12-31')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(res.body).toHaveProperty('items');
    expect(res.body).toHaveProperty('total');
    expect(res.body.pageSize).toBe(25);

    const inverted = await request(app.getHttpServer())
      .get('/api/v1/shipments?startDate=2026-12-31&endDate=2026-01-01')
      .set('Cookie', adminCookie)
      .expect(400);
    expect(JSON.stringify(inverted.body)).toContain('endDate');
  });

  it('searches shipments by order number', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/shipments?search=SO-')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(typeof res.body.total).toBe('number');
  });

  // -----------------------------------------------------------------------
  // T055/T056: tenant isolation and permissions
  // -----------------------------------------------------------------------

  it('another organization sees none of the records on any endpoint', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/sales-orders')
      .set('Cookie', adminCookie)
      .expect(200);
    const orderId = (list.body.items as Array<{ id: string }>)[0]!.id;

    await request(app.getHttpServer())
      .get(`/api/v1/sales-orders/${orderId}`)
      .set('Cookie', otherCookie)
      .expect(404);

    const otherList = await request(app.getHttpServer())
      .get('/api/v1/sales-orders')
      .set('Cookie', otherCookie)
      .expect(200);
    expect(otherList.body.total).toBe(0);
    expect(otherList.body.items).toHaveLength(0);
  });
});
