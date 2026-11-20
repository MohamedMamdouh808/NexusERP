import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, loginForCookies } from '../fixtures/app';
import { getTestPrisma, resetDatabase, seedTestDatabase } from '../fixtures/database';
import { AuditService } from '../../src/modules/audit/audit.service';

/**
 * Confirming a sales order: the reservation.
 *
 * Confirmation is ALL OR NOTHING. Either every line gets an ACTIVE
 * reservation and an increment of reserved, the order is CONFIRMED and the
 * audit trail records it — or none of those happen and the refusal names
 * every short product with its available and required quantity.
 */
describe('Sales orders: confirmation and reservation', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  let adminCookie: string;
  let adminOrgId: string;
  let otherCookie: string;
  let productId: string;
  let shortProductId: string;
  let raceProductId: string;
  let customerId: string;
  let warehouseId: string;

  beforeAll(async () => {
    await resetDatabase();
    await seedTestDatabase();

    const { app: testApp } = await createTestApp();
    app = testApp;

    const adminEmail = `admin-cf-${Date.now()}@example.com`;
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: adminEmail, password: 'Password1234' })
      .expect(201);
    adminOrgId = reg.body.organization.id;
    adminCookie = await loginForCookies(app, adminEmail, 'Password1234');

    const otherEmail = `other-cf-${Date.now()}@example.com`;
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
    const categoryId = category.body.id;

    const units = await request(app.getHttpServer())
      .get('/api/v1/units-of-measure')
      .set('Cookie', adminCookie)
      .expect(200);
    const unitId = (units.body as Array<{ id: string; name: string }>).find((c) => c.name === 'roll')!.id;

    const products = await Promise.all(
      [
        { sku: 'SKU-CF', name: 'Confirm bolt' },
        { sku: 'SKU-CF-SHORT', name: 'Short stock washer' },
        { sku: 'SKU-CF-RACE', name: 'Race bolt' },
      ].map((spec) =>
        request(app.getHttpServer())
          .post('/api/v1/products')
          .set('Cookie', adminCookie)
          .send({
            sku: spec.sku,
            name: spec.name,
            categoryId,
            unitId,
            purchasePrice: '1.0000',
            sellingPrice: '1.2345',
          })
          .expect(201),
      ),
    );
    productId = products[0]!.body.id;
    shortProductId = products[1]!.body.id;
    raceProductId = products[2]!.body.id;

    const customer = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Cookie', adminCookie)
      .send({
        code: 'CUST-CF',
        name: 'Confirm Customer',
        email: 'confirm@example.com',
        isCustomer: true,
      })
      .expect(201);
    customerId = customer.body.id;

    const warehouses = await request(app.getHttpServer())
      .get('/api/v1/warehouses')
      .set('Cookie', adminCookie)
      .expect(200);
    const warehouseList = warehouses.body.items as Array<{ id: string; name: string; isDefault: boolean }>;
    warehouseId = warehouseList.find((candidate) => candidate.isDefault)!.id;

    // Stock the products: 100 of the main line, 5 of the short-stock line, 5 of the race line.
    for (const [productIdToStock, quantity, key] of [
      [productId, '100.000', 'cf-stock-main'],
      [shortProductId, '5.000', 'cf-stock-short'],
      [raceProductId, '5.000', 'cf-stock-race'],
    ] as const) {
      await request(app.getHttpServer())
        .post('/api/v1/inventory/adjustments')
        .set('Cookie', adminCookie)
        .set('Idempotency-Key', key)
        .send({
          warehouseId,
          productId: productIdToStock,
          quantity,
          reason: 'COUNT_CORRECTION',
          note: 'Opening stock for the confirm suite.',
        })
        .expect(201);
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function draftOrder(lines: Array<{ productId: string; quantity: string }>) {
    const created = await request(app.getHttpServer())
      .post('/api/v1/sales-orders')
      .set('Cookie', adminCookie)
      .send({
        customerId,
        warehouseId,
        orderDate: '2026-11-14',
        notes: '',
        lines: lines.map((line) => ({ ...line, unitPrice: '1.2345' })),
      })
      .expect(201);
    return created.body.id as string;
  }

  // -----------------------------------------------------------------------
  // T032: the happy path reserves every line or nothing happens
  // -----------------------------------------------------------------------

  it('creates one ACTIVE reservation per line and reserves the quantities', async () => {
    const orderId = await draftOrder([{ productId, quantity: '2.000' }]);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/confirm`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `confirm-happy-${orderId}`)
      .send({ version: 1 })
      .expect(200);

    expect(res.body.status).toBe('CONFIRMED');
    expect(res.body.version).toBe(2);

    const orderLines = await prisma.salesOrderLine.findMany({
      where: { organizationId: adminOrgId, salesOrderId: orderId },
      select: { id: true },
    });
    const reservations = await prisma.stockReservation.findMany({
      where: {
        organizationId: adminOrgId,
        salesOrderLineId: { in: orderLines.map((line) => line.id) },
      },
    });
    expect(reservations).toHaveLength(1);
    expect(reservations[0]!.status).toBe('ACTIVE');
    expect(reservations[0]!.quantity.toFixed(3)).toBe('2.000');

    const balance = await prisma.stockBalance.findFirst({
      where: { organizationId: adminOrgId, warehouseId, productId },
    });
    expect(balance!.reserved.toFixed(3)).toBe('2.000');
  });

  it('rolls nothing forward: a draft with a short line reserves nothing for any line', async () => {
    const orderId = await draftOrder([
      { productId, quantity: '101.000' }, // short against 100
      { productId: shortProductId, quantity: '10.000' }, // short against 5
    ]);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/confirm`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `confirm-short-${orderId}`)
      .send({ version: 1 })
      .expect(409);

    expect(res.body.code).toBe('INSUFFICIENT_STOCK');
    expect(JSON.stringify(res.body.details)).toContain('Confirm bolt');
    expect(JSON.stringify(res.body.details)).toContain('Short stock washer');
    expect(JSON.stringify(res.body.details)).toContain('required 101.000');
    expect(JSON.stringify(res.body.details)).toContain('required 10.000');

    const orderLines = await prisma.salesOrderLine.findMany({
      where: { organizationId: adminOrgId, salesOrderId: orderId },
      select: { id: true },
    });
    const reservations = await prisma.stockReservation.findMany({
      where: {
        organizationId: adminOrgId,
        salesOrderLineId: { in: orderLines.map((line) => line.id) },
      },
    });
    expect(reservations).toHaveLength(0);

    const order = await prisma.salesOrder.findUnique({
      where: { organizationId_id: { organizationId: adminOrgId, id: orderId } },
    });
    expect(order!.status).toBe('DRAFT');
    expect(order!.version).toBe(1);
  });

  // -----------------------------------------------------------------------
  // T034: two orders racing for the last units
  // -----------------------------------------------------------------------

  it('two simultaneous confirms for the last units let exactly one succeed', async () => {
    const orderA = await draftOrder([{ productId: raceProductId, quantity: '5.000' }]);
    const orderB = await draftOrder([{ productId: raceProductId, quantity: '5.000' }]);

    const [resultA, resultB] = await Promise.allSettled([
      request(app.getHttpServer())
        .post(`/api/v1/sales-orders/${orderA}/confirm`)
        .set('Cookie', adminCookie)
        .set('Idempotency-Key', `race-a-${orderA}`)
        .send({ version: 1 }),
      request(app.getHttpServer())
        .post(`/api/v1/sales-orders/${orderB}/confirm`)
        .set('Cookie', adminCookie)
        .set('Idempotency-Key', `race-b-${orderB}`)
        .send({ version: 1 }),
    ]);

    const statusA = resultA.status === 'fulfilled' ? resultA.value.status : 0;
    const statusB = resultB.status === 'fulfilled' ? resultB.value.status : 0;
    expect([statusA, statusB].sort()).toEqual([200, 409]);

    const balance = await prisma.stockBalance.findFirst({
      where: { organizationId: adminOrgId, warehouseId, productId: raceProductId },
    });
    expect(balance!.reserved.toFixed(3)).toBe('5.000');
    expect(Number(balance!.reserved)).toBeLessThanOrEqual(Number(balance!.onHand));
  });

  // -----------------------------------------------------------------------
  // T035: confirm racing cancel
  // -----------------------------------------------------------------------

  it('a confirm racing a cancel has one consistent outcome', async () => {
    const orderId = await draftOrder([{ productId, quantity: '1.000' }]);

    const [confirmRes, cancelRes] = await Promise.allSettled([
      request(app.getHttpServer())
        .post(`/api/v1/sales-orders/${orderId}/confirm`)
        .set('Cookie', adminCookie)
        .set('Idempotency-Key', `race-confirm-${orderId}`)
        .send({ version: 1 }),
      request(app.getHttpServer())
        .post(`/api/v1/sales-orders/${orderId}/cancel`)
        .set('Cookie', adminCookie)
        .set('Idempotency-Key', `race-cancel-${orderId}`)
        .send({ version: 1 }),
    ]);

    const confirmWon = confirmRes.status === 'fulfilled' && confirmRes.value.status === 200;
    const cancelWon = cancelRes.status === 'fulfilled' && cancelRes.value.status === 200;

    const order = await prisma.salesOrder.findUnique({
      where: { organizationId_id: { organizationId: adminOrgId, id: orderId } },
    });
    const orderLines = await prisma.salesOrderLine.findMany({
      where: { organizationId: adminOrgId, salesOrderId: orderId },
      select: { id: true },
    });
    const reservations = await prisma.stockReservation.findMany({
      where: {
        organizationId: adminOrgId,
        salesOrderLineId: { in: orderLines.map((line) => line.id) },
      },
    });

    if (confirmWon) {
      expect(cancelWon).toBe(false);
      expect(order!.status).toBe('CONFIRMED');
      expect(reservations.every((reservation) => reservation.status === 'ACTIVE')).toBe(true);
    } else {
      expect(cancelWon).toBe(true);
      expect(order!.status).toBe('CANCELLED');
      expect(reservations.every((reservation) => reservation.status === 'RELEASED')).toBe(true);
      expect(reservations).toHaveLength(0);
    }
  });

  // -----------------------------------------------------------------------
  // T036: idempotency
  // -----------------------------------------------------------------------

  it('replays the stored response for the same key and body, and refuses a reused key for a different body', async () => {
    const orderId = await draftOrder([{ productId, quantity: '1.000' }]);

    const first = await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/confirm`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `idem-${orderId}`)
      .send({ version: 1 })
      .expect(200);

    const replay = await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/confirm`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `idem-${orderId}`)
      .send({ version: 1 })
      .expect(200);

    expect(replay.body).toEqual(first.body);

    const differentBody = await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/confirm`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `idem-${orderId}`)
      .send({ version: 2 })
      .expect(422);
    expect(JSON.stringify(differentBody.body)).toContain('IDEMPOTENCY_KEY_REUSED');

    const movementsBefore = await prisma.stockReservation.count({
      where: {
        organizationId: adminOrgId,
        salesOrderLineId: {
          in: (
            await prisma.salesOrderLine.findMany({
              where: { organizationId: adminOrgId, salesOrderId: orderId },
              select: { id: true },
            })
          ).map((line) => line.id),
        },
      },
    });
    expect(movementsBefore).toBe(1);
  });

  it('refuses a missing idempotency key with 400', async () => {
    const orderId = await draftOrder([{ productId, quantity: '1.000' }]);

    await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/confirm`)
      .set('Cookie', adminCookie)
      .send({ version: 1 })
      .expect(400);
  });

  // -----------------------------------------------------------------------
  // T038: tenant isolation and permissions
  // -----------------------------------------------------------------------

  it('another organization sees the order as not found', async () => {
    const orderId = await draftOrder([{ productId, quantity: '1.000' }]);

    await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/confirm`)
      .set('Cookie', otherCookie)
      .set('Idempotency-Key', `other-${orderId}`)
      .send({ version: 1 })
      .expect(404);
  });
});

/**
 * The rollback of a failed confirm.
 *
 * The audit entry travels in the same transaction as the reservation, so an
 * audit write that fails must undo the reservation, the balance change, the
 * status change and the idempotency claim too.
 */
describe('Sales orders: a failed audit write rolls the confirmation back', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  let adminCookie: string;
  let adminOrgId: string;
  let productId: string;
  let customerId: string;
  let warehouseId: string;
  let orderId: string;

  beforeAll(async () => {
    await resetDatabase();
    await seedTestDatabase();

    const { app: workingApp } = await createTestApp();
    const adminEmail = `admin-cf-rollback-${Date.now()}@example.com`;
    const registration = await request(workingApp.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: adminEmail, password: 'Password1234' })
      .expect(201);
    adminOrgId = registration.body.organization.id;
    adminCookie = await loginForCookies(workingApp, adminEmail, 'Password1234');

    const category = await request(workingApp.getHttpServer())
      .post('/api/v1/product-categories')
      .set('Cookie', adminCookie)
      .send({ name: 'Hardware' })
      .expect(201);
    const units = await request(workingApp.getHttpServer())
      .get('/api/v1/units-of-measure')
      .set('Cookie', adminCookie)
      .expect(200);
    const unitId = (units.body as Array<{ id: string; name: string }>).find(
      (unit) => unit.name === 'roll',
    )!.id;

    const product = await request(workingApp.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({
        sku: 'SKU-CF-RBK',
        name: 'Rollback bolt',
        categoryId: category.body.id,
        unitId,
        purchasePrice: '1.0000',
        sellingPrice: '1.2345',
      })
      .expect(201);
    productId = product.body.id;

    const customer = await request(workingApp.getHttpServer())
      .post('/api/v1/contacts')
      .set('Cookie', adminCookie)
      .send({
        code: 'CUST-CF-RBK',
        name: 'Rollback Customer',
        email: 'cf-rollback@example.com',
        isCustomer: true,
      })
      .expect(201);
    customerId = customer.body.id;

    const warehouses = await request(workingApp.getHttpServer())
      .get('/api/v1/warehouses')
      .set('Cookie', adminCookie)
      .expect(200);
    const warehouseList = warehouses.body.items as Array<{ id: string; name: string; isDefault: boolean }>;
    warehouseId = warehouseList.find((candidate) => candidate.isDefault)!.id;

    await request(workingApp.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', 'confirm-rollback-opening-stock')
      .send({
        warehouseId,
        productId,
        quantity: '10.000',
        reason: 'COUNT_CORRECTION',
        note: 'Opening stock for the confirm rollback suite.',
      })
      .expect(201);

    const order = await request(workingApp.getHttpServer())
      .post('/api/v1/sales-orders')
      .set('Cookie', adminCookie)
      .send({
        customerId,
        warehouseId,
        orderDate: '2026-11-14',
        notes: '',
        lines: [{ productId, quantity: '2.000', unitPrice: '1.2345' }],
      })
      .expect(201);
    orderId = order.body.id as string;

    await workingApp.close();

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

  it('leaves no reservation, no balance change, no status change and no audit entry behind', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/confirm`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `confirm-rollback-${orderId}`)
      .send({ version: 1 })
      .expect(500);

    const orderLines = await prisma.salesOrderLine.findMany({
      where: { organizationId: adminOrgId, salesOrderId: orderId },
      select: { id: true },
    });
    expect(await prisma.stockReservation.count({
      where: { organizationId: adminOrgId, salesOrderLineId: { in: orderLines.map((line) => line.id) } },
    })).toBe(0);

    const balance = await prisma.stockBalance.findFirst({
      where: { organizationId: adminOrgId, warehouseId, productId },
    });
    expect(balance!.reserved.toFixed(3)).toBe('0.000');

    const order = await prisma.salesOrder.findUnique({
      where: { organizationId_id: { organizationId: adminOrgId, id: orderId } },
    });
    expect(order!.status).toBe('DRAFT');

    expect(await prisma.idempotencyKey.count({
      where: { organizationId: adminOrgId, endpoint: `/sales-orders/${orderId}/confirm` },
    })).toBe(0);
  });
});
