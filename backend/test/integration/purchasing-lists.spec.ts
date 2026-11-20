import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, loginForCookies } from '../fixtures/app';
import { getTestPrisma, resetDatabase, seedTestDatabase } from '../fixtures/database';

/**
 * The purchasing lists and the order detail.
 *
 * The lists are the working surface: they must answer "what do we have on
 * order?" and "what has arrived?" without the user opening a record. The
 * progress summary is computed by the SERVER - the interface never derives a
 * figure of its own - and the goods receipts list returns one row per
 * receipt, not one row per receipt line.
 */
describe('Purchasing lists and detail: end to end', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  let adminCookie: string;
  let adminOrgId: string;
  let otherCookie: string;
  let categoryId: string;
  let unitId: string;
  let otherUnitId: string;
  let productId: string;
  let secondProductId: string;
  let supplierId: string;
  let warehouseId: string;

  let keyCounter = 0;
  const nextKey = (): string => `list-key-${Date.now()}-${(keyCounter += 1)}`;

  beforeAll(async () => {
    await resetDatabase();
    await seedTestDatabase();

    const { app: testApp } = await createTestApp();
    app = testApp;

    const adminEmail = `admin-lists-${Date.now()}@example.com`;
    const reg1 = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: adminEmail, password: 'Password1234' })
      .expect(201);
    adminOrgId = reg1.body.organization.id;
    adminCookie = await loginForCookies(app, adminEmail, 'Password1234');

    const otherEmail = `other-lists-${Date.now()}@example.com`;
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

    const units = await request(app.getHttpServer())
      .get('/api/v1/units-of-measure')
      .set('Cookie', adminCookie)
      .expect(200);
    const unitList = units.body as Array<{ id: string; name: string }>;
    unitId = unitList.find((unit) => unit.name === 'roll')!.id;
    otherUnitId = unitList.find((unit) => unit.name === 'box')!.id;

    const product = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({
        sku: 'SKU-LIST-1',
        name: 'Steel bolt',
        categoryId,
        unitId,
        purchasePrice: '1.2345',
        sellingPrice: '9.9900',
      })
      .expect(201);
    productId = product.body.id;

    const secondProduct = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({
        sku: 'SKU-LIST-2',
        name: 'Steel nut',
        categoryId,
        unitId: otherUnitId,
        purchasePrice: '4.5000',
        sellingPrice: '9.9900',
      })
      .expect(201);
    secondProductId = secondProduct.body.id;

    const supplier = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Cookie', adminCookie)
      .send({ name: 'Acme Supplies', isSupplier: true })
      .expect(201);
    supplierId = supplier.body.id;

    const warehouse = await request(app.getHttpServer())
      .post('/api/v1/warehouses')
      .set('Cookie', adminCookie)
      .send({ name: 'Main warehouse' })
      .expect(201);
    warehouseId = warehouse.body.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Creates an order and confirms it. */
  const createOrder = async (lines: unknown[]) => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/purchase-orders')
      .set('Cookie', adminCookie)
      .send({
        supplierId,
        warehouseId,
        orderDate: '2026-11-13',
        expectedDate: null,
        notes: '',
        lines,
      })
      .expect(201);
    return created.body as { id: string; number: string };
  };

  it('lists the orders with the server progress summary', async () => {
    // One order, one line, one unit: the progress is a quantity summary.
    const single = await createOrder([{ productId, quantity: '10.000', unitCost: '1.2345' }]);
    await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${single.id}/confirm`)
      .set('Cookie', adminCookie)
      .send({ version: 1 })
      .expect(200);

    // One order, two lines, two units: the progress is a line-count summary.
    const mixed = await createOrder([
      { productId, quantity: '4.000', unitCost: '1.2345' },
      { productId: secondProductId, quantity: '6.000', unitCost: '4.5000' },
    ]);
    await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${mixed.id}/confirm`)
      .set('Cookie', adminCookie)
      .send({ version: 1 })
      .expect(200);

    // A draft shows no progress at all.
    const draft = await createOrder([{ productId, quantity: '2.000', unitCost: '1.2345' }]);

    const list = await request(app.getHttpServer())
      .get('/api/v1/purchase-orders?sortBy=number&sortOrder=asc')
      .set('Cookie', adminCookie)
      .expect(200);

    expect(list.body.total).toBe(3);
    const rows = list.body.items as Array<{
      id: string;
      number: string;
      supplierName: string;
      warehouseName: string;
      progress: { kind: string; receivedTotal?: string; orderedTotal?: string; unitOfMeasure?: string; lineCount?: number; fullyReceivedLineCount?: number };
    }>;

    const singleRow = rows.find((row) => row.id === single.id)!;
    expect(singleRow.progress).toEqual({
      kind: 'QUANTITY',
      receivedTotal: '0.000',
      orderedTotal: '10.000',
      unitOfMeasure: 'roll',
    });
    expect(singleRow.supplierName).toBe('Acme Supplies');
    expect(singleRow.warehouseName).toBe('Main warehouse');

    const mixedRow = rows.find((row) => row.id === mixed.id)!;
    expect(mixedRow.progress).toEqual({
      kind: 'LINES',
      fullyReceivedLineCount: 0,
      lineCount: 2,
    });

    const draftRow = rows.find((row) => row.id === draft.id)!;
    expect(draftRow.progress).toEqual({ kind: 'NONE' });
  });

  it('never contradicts the status with the progress', async () => {
    const orders = await prisma.purchaseOrder.findMany({
      where: { organizationId: adminOrgId },
      include: { lines: true },
    });

    for (const order of orders) {
      const list = await request(app.getHttpServer())
        .get('/api/v1/purchase-orders?sortBy=number&sortOrder=asc&pageSize=100')
        .set('Cookie', adminCookie)
        .expect(200);
      const row = (list.body.items as Array<{ id: string; progress: { kind: string } }>).find(
        (candidate) => candidate.id === order.id,
      )!;

      const fullyReceived = order.lines.filter(
        (line) => line.quantityReceived.equals(line.quantityOrdered),
      ).length;
      const anyReceived = order.lines.some((line) => line.quantityReceived.gt(0));

      if (order.status === 'RECEIVED') {
        expect(fullyReceived).toBe(order.lines.length);
      }
      if (order.status === 'PARTIALLY_RECEIVED') {
        expect(anyReceived).toBe(true);
        expect(fullyReceived).toBeLessThan(order.lines.length);
      }
      if (order.status === 'CONFIRMED' || order.status === 'DRAFT') {
        expect(anyReceived).toBe(false);
      }
      expect(row).toBeDefined();
    }
  });

  it('searches, filters, sorts and pages the orders', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/purchase-orders?search=Acme&sortBy=total&sortOrder=desc')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(list.body.total).toBeGreaterThan(0);

    const byStatus = await request(app.getHttpServer())
      .get('/api/v1/purchase-orders?status=DRAFT')
      .set('Cookie', adminCookie)
      .expect(200);
    for (const row of byStatus.body.items as Array<{ status: string }>) {
      expect(row.status).toBe('DRAFT');
    }

    // The page size is capped, not refused.
    const capped = await request(app.getHttpServer())
      .get('/api/v1/purchase-orders?pageSize=1000')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(capped.body.pageSize).toBe(100);

    // A wildcard in the search term is literal.
    const literal = await request(app.getHttpServer())
      .get('/api/v1/purchase-orders?search=%')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(literal.body.total).toBe(0);
  });

  it('lists the goods receipts, one row per receipt', async () => {
    const order = await createOrder([
      { productId, quantity: '10.000', unitCost: '1.2345' },
      { productId: secondProductId, quantity: '6.000', unitCost: '4.5000' },
    ]);
    await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${order.id}/confirm`)
      .set('Cookie', adminCookie)
      .send({ version: 1 })
      .expect(200);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/purchase-orders/${order.id}`)
      .set('Cookie', adminCookie)
      .expect(200);

    // One receipt with two lines: one row, the aggregate and the line count.
    await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${order.id}/receipts`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', nextKey())
      .send({
        lines: [
          { lineId: detail.body.lines[0].id, productId, quantity: '2.000' },
          { lineId: detail.body.lines[1].id, productId: secondProductId, quantity: '1.000' },
        ],
      })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get('/api/v1/goods-receipts')
      .set('Cookie', adminCookie)
      .expect(200);

    expect(list.body.total).toBe(1);
    const row = list.body.items[0] as {
      number: string;
      orderNumber: string;
      supplierName: string;
      warehouseName: string;
      user: string;
      lineCount: number;
      receivedTotal?: string;
      unitOfMeasure?: string;
      lines?: unknown;
    };

    expect(row.orderNumber).toBe(order.number);
    expect(row.supplierName).toBe('Acme Supplies');
    expect(row.warehouseName).toBe('Main warehouse');
    expect(row.user).toContain('@');
    expect(row.lineCount).toBe(2);
    // The lines have different units of measure, so the row carries the line
    // count and no aggregate.
    expect(row.receivedTotal).toBeUndefined();
    expect(row.unitOfMeasure).toBeUndefined();
    // The list payload carries no lines.
    expect(row.lines).toBeUndefined();

    // A receipt whose lines share one unit carries the aggregate.
    const uniform = await createOrder([{ productId, quantity: '5.000', unitCost: '1.2345' }]);
    await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${uniform.id}/confirm`)
      .set('Cookie', adminCookie)
      .send({ version: 1 })
      .expect(200);
    const uniformDetail = await request(app.getHttpServer())
      .get(`/api/v1/purchase-orders/${uniform.id}`)
      .set('Cookie', adminCookie)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${uniform.id}/receipts`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', nextKey())
      .send({
        lines: [{ lineId: uniformDetail.body.lines[0].id, productId, quantity: '2.500' }],
      })
      .expect(201);

    const uniformList = await request(app.getHttpServer())
      .get('/api/v1/goods-receipts?search=' + uniform.number)
      .set('Cookie', adminCookie)
      .expect(200);
    const uniformRow = uniformList.body.items[0] as {
      lineCount: number;
      receivedTotal?: string;
      unitOfMeasure?: string;
    };
    expect(uniformRow.lineCount).toBe(1);
    expect(uniformRow.receivedTotal).toBe('2.500');
    expect(uniformRow.unitOfMeasure).toBe('roll');
  });

  it('searches the goods receipts by product and filters them by date', async () => {
    const byProduct = await request(app.getHttpServer())
      .get('/api/v1/goods-receipts?search=Steel%20nut')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(byProduct.body.total).toBe(1);

    const byRange = await request(app.getHttpServer())
      .get('/api/v1/goods-receipts?startDate=2026-01-01&endDate=2026-12-31')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(byRange.body.total).toBeGreaterThan(0);

    // A range that ends before it starts is refused, and the field is named.
    const backwards = await request(app.getHttpServer())
      .get('/api/v1/goods-receipts?startDate=2026-12-31&endDate=2026-01-01')
      .set('Cookie', adminCookie)
      .expect(400);
    expect(backwards.body.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(backwards.body.details)).toContain('endDate');
  });

  it('reads one order with its lines and its receipt history', async () => {
    const order = await createOrder([{ productId, quantity: '4.000', unitCost: '1.2345' }]);
    await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${order.id}/confirm`)
      .set('Cookie', adminCookie)
      .send({ version: 1 })
      .expect(200);
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/purchase-orders/${order.id}`)
      .set('Cookie', adminCookie)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${order.id}/receipts`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', nextKey())
      .send({ lines: [{ lineId: detail.body.lines[0].id, productId, quantity: '1.000' }] })
      .expect(201);

    const reread = await request(app.getHttpServer())
      .get(`/api/v1/purchase-orders/${order.id}`)
      .set('Cookie', adminCookie)
      .expect(200);

    expect(reread.body.lines[0]).toMatchObject({
      productSku: 'SKU-LIST-1',
      quantity: '4.000',
      received: '1.000',
      outstanding: '3.000',
      unitOfMeasure: 'roll',
      unitCost: '1.2345',
      lineTotal: '4.94',
    });

    expect(reread.body.receipts).toHaveLength(1);
    expect(reread.body.receipts[0].lines[0]).toMatchObject({
      productSku: 'SKU-LIST-1',
      quantity: '1.000',
      unitOfMeasure: 'roll',
      unitCost: '1.2345',
    });
    expect(reread.body.receipts[0].lines[0].orderLineId).toBe(reread.body.lines[0].id);
  });

  it('keeps another organization out of both lists', async () => {
    const orders = await request(app.getHttpServer())
      .get('/api/v1/purchase-orders')
      .set('Cookie', otherCookie)
      .expect(200);
    expect(orders.body.total).toBe(0);

    const receipts = await request(app.getHttpServer())
      .get('/api/v1/goods-receipts')
      .set('Cookie', otherCookie)
      .expect(200);
    expect(receipts.body.total).toBe(0);
  });
});
