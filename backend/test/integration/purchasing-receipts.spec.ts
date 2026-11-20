import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, loginForCookies } from '../fixtures/app';
import { getTestPrisma, resetDatabase, seedTestDatabase } from '../fixtures/database';
import { AuditService } from '../../src/modules/audit/audit.service';

/**
 * Goods receipts, end to end.
 *
 * Receiving goods is the write that turns a purchase order into real stock,
 * so it carries the highest integrity risk: an over-receipt, a duplicated
 * posting, a partial write or two receipts racing each other. The receipt is
 * ONE transaction - the receipt, its lines, the movements, the stock, the
 * received quantities, the order's status, the audit entry and the idempotency
 * claim - and a failure anywhere leaves nothing behind.
 */
describe('Goods receipts: end to end', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  let adminCookie: string;
  let adminOrgId: string;
  let otherCookie: string;
  let categoryId: string;
  let unitId: string;
  let productId: string;
  let secondProductId: string;
  let supplierId: string;
  let warehouseId: string;

  let keyCounter = 0;
  const nextKey = (): string => `receipt-key-${Date.now()}-${(keyCounter += 1)}`;

  beforeAll(async () => {
    await resetDatabase();
    await seedTestDatabase();

    const { app: testApp } = await createTestApp();
    app = testApp;

    const adminEmail = `admin-receipts-${Date.now()}@example.com`;
    const reg1 = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: adminEmail, password: 'Password1234' })
      .expect(201);
    adminOrgId = reg1.body.organization.id;
    adminCookie = await loginForCookies(app, adminEmail, 'Password1234');

    const otherEmail = `other-receipts-${Date.now()}@example.com`;
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
    unitId = (units.body as Array<{ id: string; name: string }>).find(
      (unit) => unit.name === 'roll',
    )!.id;

    const product = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({
        sku: 'SKU-RC-1',
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
        sku: 'SKU-RC-2',
        name: 'Steel nut',
        categoryId,
        unitId,
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

  /** A confirmed order with two lines, and the order's lines. */
  const confirmedOrder = async (quantity = '10.000') => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/purchase-orders')
      .set('Cookie', adminCookie)
      .send({
        supplierId,
        warehouseId,
        orderDate: '2026-11-13',
        expectedDate: null,
        notes: '',
        lines: [
          { productId, quantity, unitCost: '1.2345' },
          { productId: secondProductId, quantity, unitCost: '4.5000' },
        ],
      })
      .expect(201);
    const confirmed = await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${created.body.id}/confirm`)
      .set('Cookie', adminCookie)
      .send({ version: 1 })
      .expect(200);
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/purchase-orders/${created.body.id}`)
      .set('Cookie', adminCookie)
      .expect(200);
    return { order: detail.body, version: confirmed.body.version };
  };

  /** The order's lines as the detail endpoint returns them, found by product. */
  const lineFor = (order: { lines: Array<{ id: string; productId: string }> }, product: string) =>
    order.lines.find((line) => line.productId === product)!;

  it('posts a receipt: the receipt, the movements, the stock and the status', async () => {
    const { order } = await confirmedOrder();
    const firstLine = lineFor(order, productId);
    const secondLine = lineFor(order, secondProductId);

    const posted = await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${order.id}/receipts`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', nextKey())
      .send({
        lines: [
          { lineId: firstLine.id, productId, quantity: '2.500' },
          { lineId: secondLine.id, productId: secondProductId, quantity: '0.000' },
        ],
      })
      .expect(201);

    expect(posted.body.receipt.number).toMatch(/^GR-\d{6}$/);
    expect(posted.body.order.status).toBe('PARTIALLY_RECEIVED');

    // One receipt, one receipt line (the zero quantity creates nothing).
    const receipts = await prisma.goodsReceipt.findMany({ where: { organizationId: adminOrgId } });
    expect(receipts).toHaveLength(1);
    const receiptLines = await prisma.goodsReceiptLine.findMany({
      where: { organizationId: adminOrgId },
    });
    expect(receiptLines).toHaveLength(1);
    expect(receiptLines[0]!.quantity.toFixed(3)).toBe('2.500');
    expect(receiptLines[0]!.unitOfMeasure).toBe('roll');

    // One movement, and the stock grew by exactly what was received.
    const movements = await prisma.stockMovement.findMany({
      where: { organizationId: adminOrgId },
    });
    expect(movements).toHaveLength(1);
    expect(movements[0]!.type).toBe('RECEIPT');
    expect(movements[0]!.sourceType).toBe('RECEIPT');
    expect(movements[0]!.sourceNumber).toBe(posted.body.receipt.number);
    expect(movements[0]!.quantityDelta.toFixed(3)).toBe('2.500');

    const balances = await prisma.stockBalance.findMany({ where: { organizationId: adminOrgId } });
    expect(balances).toHaveLength(1);
    expect(balances[0]!.onHand.toFixed(3)).toBe('2.500');

    // The line and the order know what arrived.
    const receivedByProduct = new Map(
      (
        await prisma.purchaseOrderLine.findMany({
          where: { organizationId: adminOrgId, purchaseOrderId: order.id },
        })
      ).map((line) => [line.productId, line.quantityReceived.toFixed(3)]),
    );
    expect(receivedByProduct.get(productId)).toBe('2.500');
    expect(receivedByProduct.get(secondProductId)).toBe('0.000');

    // One audit entry, in the same transaction.
    const audit = await prisma.auditLog.findMany({
      where: { organizationId: adminOrgId, action: 'goods_receipts.posted' },
    });
    expect(audit).toHaveLength(1);
  });

  it('posts the same request twice only once', async () => {
    const { order } = await confirmedOrder('5.000');
    const line = lineFor(order, productId);
    const key = nextKey();
    const body = { lines: [{ lineId: line.id, productId, quantity: '1.000' }] };

    const first = await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${order.id}/receipts`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);

    const second = await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${order.id}/receipts`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);

    expect(second.body.receipt.number).toBe(first.body.receipt.number);

    const receipts = await prisma.goodsReceipt.findMany({
      where: { organizationId: adminOrgId, purchaseOrderId: order.id },
    });
    expect(receipts).toHaveLength(1);

    const receipt = receipts[0]!;
    const movements = await prisma.stockMovement.findMany({
      where: { organizationId: adminOrgId, sourceId: receipt.id },
    });
    expect(movements).toHaveLength(1);
    expect(movements[0]!.quantityDelta.toFixed(3)).toBe('1.000');
  });

  it('refuses the same key with a different body, and a request without a key', async () => {
    const { order } = await confirmedOrder('5.000');
    const line = lineFor(order, productId);
    const key = nextKey();

    await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${order.id}/receipts`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', key)
      .send({ lines: [{ lineId: line.id, productId, quantity: '1.000' }] })
      .expect(201);

    const reused = await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${order.id}/receipts`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', key)
      .send({ lines: [{ lineId: line.id, productId, quantity: '2.000' }] })
      .expect(422);
    expect(reused.body.code).toBe('IDEMPOTENCY_KEY_REUSED');

    await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${order.id}/receipts`)
      .set('Cookie', adminCookie)
      .send({ lines: [{ lineId: line.id, productId, quantity: '1.000' }] })
      .expect(400);
  });

  it('refuses what must not be received', async () => {
    const { order } = await confirmedOrder('5.000');
    const line = lineFor(order, productId);

    // More than the outstanding quantity.
    const over = await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${order.id}/receipts`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', nextKey())
      .send({ lines: [{ lineId: line.id, productId, quantity: '5.001' }] })
      .expect(400);
    expect(over.body.code).toBe('OVER_RECEIPT');
    expect(JSON.stringify(over.body.details)).toContain('5.000');

    // Nothing at all.
    await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${order.id}/receipts`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', nextKey())
      .send({ lines: [{ lineId: line.id, productId, quantity: '0.000' }] })
      .expect(400);

    // A line from another order.
    const other = await confirmedOrder('5.000');
    await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${order.id}/receipts`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', nextKey())
      .send({ lines: [{ lineId: lineFor(other.order, productId).id, productId, quantity: '1.000' }] })
      .expect(400);

    // A product that does not match the line.
    await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${order.id}/receipts`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', nextKey())
      .send({ lines: [{ lineId: line.id, productId: secondProductId, quantity: '1.000' }] })
      .expect(400);

    // The same line twice.
    await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${order.id}/receipts`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', nextKey())
      .send({
        lines: [
          { lineId: line.id, productId, quantity: '1.000' },
          { lineId: line.id, productId, quantity: '1.000' },
        ],
      })
      .expect(400);

    // Nothing was written by any of those.
    const receipts = await prisma.goodsReceipt.findMany({
      where: { organizationId: adminOrgId, purchaseOrderId: order.id },
    });
    expect(receipts).toHaveLength(0);
  });

  it('refuses to receive against an order that cannot be received', async () => {
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
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/purchase-orders/${created.body.id}`)
      .set('Cookie', adminCookie)
      .expect(200);

    // A draft is not receivable.
    const refused = await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${created.body.id}/receipts`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', nextKey())
      .send({
        lines: [{ lineId: lineFor(detail.body, productId).id, productId, quantity: '1.000' }],
      })
      .expect(409);
    expect(refused.body.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('refuses a receipt against a deactivated warehouse', async () => {
    // A warehouse of its own: the shared one holds stock by now, and a
    // warehouse that holds stock cannot be deactivated.
    const spare = await request(app.getHttpServer())
      .post('/api/v1/warehouses')
      .set('Cookie', adminCookie)
      .send({ name: 'Spare depot' })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post('/api/v1/purchase-orders')
      .set('Cookie', adminCookie)
      .send({
        supplierId,
        warehouseId: spare.body.id,
        orderDate: '2026-11-13',
        expectedDate: null,
        notes: '',
        lines: [{ productId, quantity: '5.000', unitCost: '1.2345' }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${created.body.id}/confirm`)
      .set('Cookie', adminCookie)
      .send({ version: 1 })
      .expect(200);
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/purchase-orders/${created.body.id}`)
      .set('Cookie', adminCookie)
      .expect(200);

    // A warehouse whose open order names it cannot be deactivated through the
    // API - the usage guard refuses it (see purchasing-usage-guards.spec.ts).
    // The receipt-time guard exists for the race where the warehouse goes
    // inactive after the order was confirmed, so simulate exactly that race by
    // flipping the row directly; the refusal that matters is the receipt's.
    await prisma.warehouse.update({
      where: { id: spare.body.id },
      data: { isActive: false },
    });

    const refused = await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${created.body.id}/receipts`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', nextKey())
      .send({
        lines: [{ lineId: lineFor(detail.body, productId).id, productId, quantity: '1.000' }],
      })
      .expect(409);
    expect(refused.body.code).toBe('INACTIVE_WAREHOUSE');

    await prisma.warehouse.update({
      where: { id: spare.body.id },
      data: { isActive: true },
    });
  });

  it('keeps another organization out, and refuses a caller without inventory.receive', async () => {
    const { order } = await confirmedOrder('5.000');
    const line = lineFor(order, productId);
    const body = { lines: [{ lineId: line.id, productId, quantity: '1.000' }] };

    await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${order.id}/receipts`)
      .set('Cookie', otherCookie)
      .set('Idempotency-Key', nextKey())
      .send(body)
      .expect(404);

    // A member of THIS organization without inventory.receive cannot post a
    // receipt. The sales role holds no inventory permission.
    const salesRole = await prisma.role.findFirst({
      where: { organizationId: adminOrgId, key: 'sales' },
    });
    const memberEmail = `member-receipts-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', adminCookie)
      .send({
        email: memberEmail,
        name: 'Sales Member',
        password: 'Password1234',
        roleIds: [salesRole!.id],
      })
      .expect(201);
    const memberCookie = await loginForCookies(app, memberEmail, 'Password1234');
    await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${order.id}/receipts`)
      .set('Cookie', memberCookie)
      .set('Idempotency-Key', nextKey())
      .send(body)
      .expect(403);
  });

  it('refuses to change a posted receipt', async () => {
    const { order } = await confirmedOrder('5.000');
    const line = lineFor(order, productId);

    await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${order.id}/receipts`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', nextKey())
      .send({ lines: [{ lineId: line.id, productId, quantity: '1.000' }] })
      .expect(201);

    const receipt = await prisma.goodsReceipt.findFirst({
      where: { organizationId: adminOrgId, purchaseOrderId: order.id },
    });

    await expect(
      prisma.goodsReceipt.update({
        where: { id: receipt!.id },
        data: { number: 'GR-999999' },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.goodsReceipt.delete({ where: { id: receipt!.id } }),
    ).rejects.toThrow();
  });
});

/**
 * The rollback of a failed receipt.
 *
 * The audit entry is written in the same transaction as the receipt, so an
 * audit write that fails must undo the receipt, the movements and the stock
 * too. The audit service is the seam that makes this provable.
 */
describe('Goods receipts: a failed audit write rolls the receipt back', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  let adminCookie: string;
  let adminOrgId: string;
  let productId: string;
  let supplierId: string;
  let warehouseId: string;
  let orderId: string;
  let lineId: string;

  beforeAll(async () => {
    await resetDatabase();
    await seedTestDatabase();

    const { app: workingApp } = await createTestApp();
    const working = workingApp;

    const adminEmail = `admin-receipt-rollback-${Date.now()}@example.com`;
    const registration = await request(working.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: adminEmail, password: 'Password1234' })
      .expect(201);
    adminOrgId = registration.body.organization.id;
    adminCookie = await loginForCookies(working, adminEmail, 'Password1234');

    const category = await request(working.getHttpServer())
      .post('/api/v1/product-categories')
      .set('Cookie', adminCookie)
      .send({ name: 'Hardware' })
      .expect(201);
    const units = await request(working.getHttpServer())
      .get('/api/v1/units-of-measure')
      .set('Cookie', adminCookie)
      .expect(200);
    const unitId = (units.body as Array<{ id: string; name: string }>).find(
      (unit) => unit.name === 'roll',
    )!.id;

    const product = await request(working.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({
        sku: 'SKU-RC-RBK',
        name: 'Rollback bolt',
        categoryId: category.body.id,
        unitId,
        purchasePrice: '1.2345',
        sellingPrice: '9.9900',
      })
      .expect(201);
    productId = product.body.id;

    const supplier = await request(working.getHttpServer())
      .post('/api/v1/contacts')
      .set('Cookie', adminCookie)
      .send({ name: 'Acme Supplies', isSupplier: true })
      .expect(201);
    supplierId = supplier.body.id;

    const warehouse = await request(working.getHttpServer())
      .post('/api/v1/warehouses')
      .set('Cookie', adminCookie)
      .send({ name: 'Main warehouse' })
      .expect(201);
    warehouseId = warehouse.body.id;

    const order = await request(working.getHttpServer())
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
    orderId = order.body.id;
    await request(working.getHttpServer())
      .post(`/api/v1/purchase-orders/${orderId}/confirm`)
      .set('Cookie', adminCookie)
      .send({ version: 1 })
      .expect(200);
    const detail = await request(working.getHttpServer())
      .get(`/api/v1/purchase-orders/${orderId}`)
      .set('Cookie', adminCookie)
      .expect(200);
    lineId = detail.body.lines[0].id;

    await working.close();

    const { app: failingApp } = await createTestApp([
      {
        token: AuditService,
        useValue: {
          record: () => Promise.reject(new Error('the audit write failed')),
        },
      },
    ]);
    app = failingApp;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('leaves no receipt, no movement, no stock and no claim behind', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${orderId}/receipts`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', 'receipt-rollback-key')
      .send({ lines: [{ lineId, productId, quantity: '1.000' }] })
      .expect(500);

    expect(await prisma.goodsReceipt.count({ where: { organizationId: adminOrgId } })).toBe(0);
    expect(await prisma.goodsReceiptLine.count({ where: { organizationId: adminOrgId } })).toBe(0);
    expect(await prisma.stockMovement.count({ where: { organizationId: adminOrgId } })).toBe(0);
    expect(await prisma.stockBalance.count({ where: { organizationId: adminOrgId } })).toBe(0);
    expect(await prisma.idempotencyKey.count({ where: { organizationId: adminOrgId } })).toBe(0);

    const lines = await prisma.purchaseOrderLine.findMany({
      where: { organizationId: adminOrgId, purchaseOrderId: orderId },
    });
    expect(lines[0]!.quantityReceived.toFixed(3)).toBe('0.000');
  });
});
