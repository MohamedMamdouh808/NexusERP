import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, loginForCookies } from '../fixtures/app';
import { getTestPrisma, resetDatabase, seedTestDatabase } from '../fixtures/database';
import { AuditService } from '../../src/modules/audit/audit.service';

/**
 * Sales shipments: end to end.
 *
 * Shipping is where a confirmed order becomes stock that left: one shipment
 * ships the whole order, the `SH-` number comes from the same sequence
 * discipline as the orders, the reservation per line is consumed, a SHIPMENT
 * movement is posted per line, and the order reads SHIPPED with a bumped
 * version. The shipment is permanent: the database refuses UPDATE, DELETE and
 * TRUNCATE.
 */
describe('Sales shipments: end to end', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  let adminCookie: string;
  let adminOrgId: string;
  let otherCookie: string;
  let productId: string;
  let customerId: string;
  let warehouseId: string;

  beforeAll(async () => {
    await resetDatabase();
    await seedTestDatabase();

    const { app: testApp } = await createTestApp();
    app = testApp;

    const adminEmail = `admin-sh-${Date.now()}@example.com`;
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: adminEmail, password: 'Password1234' })
      .expect(201);
    adminOrgId = reg.body.organization.id;
    adminCookie = await loginForCookies(app, adminEmail, 'Password1234');

    const otherEmail = `other-sh-${Date.now()}@example.com`;
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

    const product = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({
        sku: 'SKU-SH',
        name: 'Ship test bolt',
        categoryId,
        unitId,
        purchasePrice: '1.0000',
        sellingPrice: '1.2345',
      })
      .expect(201);
    productId = product.body.id;

    const customer = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Cookie', adminCookie)
      .send({
        code: 'CUST-SH',
        name: 'Ship Customer',
        email: 'ship@example.com',
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

    // Stock the product: the adjustment is the inventory module's own write path.
    await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', 'shipments-suite-opening-stock')
      .send({
        warehouseId,
        productId,
        quantity: '100.000',
        reason: 'COUNT_CORRECTION',
        note: 'Opening stock for the shipments suite.',
      })
      .expect(201);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // -----------------------------------------------------------------------
  // T041: the shipment happy path
  // -----------------------------------------------------------------------

  async function createAndConfirm(key: string): Promise<string> {
    const order = await request(app.getHttpServer())
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
    const id = order.body.id as string;

    await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${id}/confirm`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `confirm-${key}`)
      .send({ version: 1 })
      .expect(200);

    return id;
  }

  it('ships a confirmed order: shipment, movement, consumed reservation, SHIPPED', async () => {
    const orderId = await createAndConfirm('happy');

    const res = await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/shipments`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', 'ship-happy')
      .send({})
      .expect(201);

    expect(res.body.shipment.number).toMatch(/^SH-\d{6}$/);
    expect(res.body.shipment.shippedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(res.body.order).toMatchObject({ id: orderId, status: 'SHIPPED', version: 3 });

    const movements = await prisma.stockMovement.findMany({
      where: { organizationId: adminOrgId, type: 'SHIPMENT' },
    });
    expect(movements).toHaveLength(1);
    expect(movements[0]!.quantityDelta.toFixed(3)).toBe('-2.000');

    const balance = await prisma.stockBalance.findFirst({
      where: { organizationId: adminOrgId, warehouseId, productId },
    });
    expect(balance!.onHand.toFixed(3)).toBe('98.000');
    expect(balance!.reserved.toFixed(3)).toBe('0.000');

    const reservations = await prisma.stockReservation.findMany({
      where: { organizationId: adminOrgId, status: 'CONSUMED' },
    });
    expect(reservations).toHaveLength(1);

    const audit = await prisma.auditLog.findMany({
      where: { organizationId: adminOrgId, recordType: 'shipment', recordId: res.body.shipment.id },
    });
    expect(audit.some((entry) => entry.action === 'shipments.posted')).toBe(true);
  });

  // -----------------------------------------------------------------------
  // T042: what refuses to ship
  // -----------------------------------------------------------------------

  it('refuses shipping a DRAFT, a CANCELLED and a SHIPPED order', async () => {
    const draft = await request(app.getHttpServer())
      .post('/api/v1/sales-orders')
      .set('Cookie', adminCookie)
      .send({
        customerId,
        warehouseId,
        orderDate: '2026-11-14',
        notes: '',
        lines: [{ productId, quantity: '1.000', unitPrice: '1.2345' }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${draft.body.id}/shipments`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `ship-draft-${draft.body.id}`)
      .send({})
      .expect(409);

    const orderId = await createAndConfirm('cancel-then-ship');
    await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/cancel`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `cancel-then-ship-${orderId}`)
      .send({ version: 2 })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/shipments`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `ship-cancelled-${orderId}`)
      .send({})
      .expect(409);

    // Already shipped.
    const shippedId = await createAndConfirm('already-shipped');
    await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${shippedId}/shipments`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `ship-first-${shippedId}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${shippedId}/shipments`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `ship-second-${shippedId}`)
      .send({})
      .expect(409);
  });

  it('refuses shipping a confirmed order whose active reservation was removed', async () => {
    const orderId = await createAndConfirm('missing-reservation');

    // Simulate the reservation vanishing (data corruption or a manual fix):
    // the shipment must refuse rather than ship unreserved stock.
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
    for (const reservation of reservations) {
      await prisma.stockReservation.update({
        where: { id: reservation.id },
        data: { status: 'RELEASED' },
      });
    }

    await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/shipments`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `ship-missing-${orderId}`)
      .send({})
      .expect(409);
  });

  // -----------------------------------------------------------------------
  // T043: idempotency
  // -----------------------------------------------------------------------

  it('replays the stored response for the same key and body, without acting twice', async () => {
    const orderId = await createAndConfirm('idem');

    const first = await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/shipments`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `ship-idem-${orderId}`)
      .send({})
      .expect(201);

    const second = await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/shipments`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `ship-idem-${orderId}`)
      .send({})
      .expect(201);

    expect(second.body.shipment.number).toBe(first.body.shipment.number);
    expect(second.body.shipment.shippedAt).toBe(first.body.shipment.shippedAt);

    const movements = await prisma.stockMovement.findMany({
      where: { organizationId: adminOrgId, type: 'SHIPMENT', sourceId: first.body.shipment.id },
    });
    expect(movements).toHaveLength(1);

    const shipments = await prisma.shipment.findMany({
      where: { organizationId: adminOrgId, salesOrderId: orderId },
    });
    expect(shipments).toHaveLength(1);
  });

  it('refuses a second ship under a different key with 409 once the order has shipped', async () => {
    const orderId = await createAndConfirm('second-key');

    await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/shipments`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `ship-first-idem-${orderId}`)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/shipments`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `ship-second-idem-${orderId}`)
      .send({})
      .expect(409);

    const shipments = await prisma.shipment.findMany({
      where: { organizationId: adminOrgId, salesOrderId: orderId },
    });
    expect(shipments).toHaveLength(1);
  });

  it('refuses a missing idempotency key with 400', async () => {
    const orderId = await createAndConfirm('missing-key');

    await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/shipments`)
      .set('Cookie', adminCookie)
      .send({})
      .expect(400);
  });

  // -----------------------------------------------------------------------
  // T044: ship racing cancel
  // -----------------------------------------------------------------------

  it('a ship racing a cancel has one consistent outcome, never both', async () => {
    const orderId = await createAndConfirm('race');

    const [shipRes, cancelRes] = await Promise.allSettled([
      request(app.getHttpServer())
        .post(`/api/v1/sales-orders/${orderId}/shipments`)
        .set('Cookie', adminCookie)
        .set('Idempotency-Key', `race-ship-${orderId}`)
        .send({}),
      request(app.getHttpServer())
        .post(`/api/v1/sales-orders/${orderId}/cancel`)
        .set('Cookie', adminCookie)
        .set('Idempotency-Key', `race-cancel-${orderId}`)
        .send({ version: 2 }),
    ]);

    const shipWon = shipRes.status === 'fulfilled' && shipRes.value.status === 201;
    const cancelWon = cancelRes.status === 'fulfilled' && cancelRes.value.status === 200;

    expect(shipWon !== cancelWon).toBe(true);

    const order = await prisma.salesOrder.findUnique({
      where: { organizationId_id: { organizationId: adminOrgId, id: orderId } },
    });
    const shipments = await prisma.shipment.findMany({
      where: { organizationId: adminOrgId, salesOrderId: orderId },
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

    if (shipWon) {
      expect(order!.status).toBe('SHIPPED');
      expect(shipments).toHaveLength(1);
      expect(reservations.every((reservation) => reservation.status === 'CONSUMED')).toBe(true);
    } else {
      expect(cancelWon).toBe(true);
      expect(order!.status).toBe('CANCELLED');
      expect(shipments).toHaveLength(0);
      expect(reservations.every((reservation) => reservation.status === 'RELEASED')).toBe(true);
    }
  });

  // -----------------------------------------------------------------------
  // T046: immutability of posted shipments
  // -----------------------------------------------------------------------

  it('the database refuses UPDATE and DELETE on shipments', async () => {
    const orderId = await createAndConfirm('immutable');
    const res = await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/shipments`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `ship-immutable-${orderId}`)
      .send({})
      .expect(201);

    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "shipments" SET "number" = "number" WHERE id = $1::uuid`,
        res.body.shipment.id,
      ),
    ).rejects.toThrow(/append-only|not permitted/i);

    await expect(
      prisma.$executeRawUnsafe(
        `DELETE FROM "shipments" WHERE id = $1::uuid`,
        res.body.shipment.id,
      ),
    ).rejects.toThrow(/append-only|not permitted/i);
  });

  // -----------------------------------------------------------------------
  // T047: tenant isolation and permissions
  // -----------------------------------------------------------------------

  it('another organization sees neither the order nor the shipment', async () => {
    const orderId = await createAndConfirm('tenant');
    const res = await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/shipments`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `ship-tenant-${orderId}`)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/v1/shipments/${res.body.shipment.id}`)
      .set('Cookie', otherCookie)
      .expect(404);

    await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/shipments`)
      .set('Cookie', otherCookie)
      .set('Idempotency-Key', `other-ship-${orderId}`)
      .send({})
      .expect(404);
  });
});

/**
 * The rollback of a failed shipment.
 *
 * The audit entry travels in the same transaction as the shipment, so an
 * audit write that fails must undo the shipment, the movements, the stock
 * change and the reservation consumption too.
 */
describe('Sales shipments: a failed audit write rolls the shipment back', () => {
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
    const adminEmail = `admin-sh-rollback-${Date.now()}@example.com`;
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
        sku: 'SKU-SH-RBK',
        name: 'Rollback ship bolt',
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
        code: 'CUST-SH-RBK',
        name: 'Rollback Customer',
        email: 'sh-rollback@example.com',
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
      .set('Idempotency-Key', 'ship-rollback-opening-stock')
      .send({
        warehouseId,
        productId,
        quantity: '10.000',
        reason: 'COUNT_CORRECTION',
        note: 'Opening stock for the shipments rollback suite.',
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

    await request(workingApp.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/confirm`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `confirm-rollback-${orderId}`)
      .send({ version: 1 })
      .expect(200);

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

  it('leaves no shipment, no movement, no stock change and no reservation consumed behind', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/shipments`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `ship-rollback-${orderId}`)
      .send({})
      .expect(500);

    expect(await prisma.shipment.count({ where: { organizationId: adminOrgId } })).toBe(0);
    expect(await prisma.shipmentLine.count({ where: { organizationId: adminOrgId } })).toBe(0);
    expect(await prisma.stockMovement.count({ where: { organizationId: adminOrgId, type: 'SHIPMENT' } })).toBe(0);
    expect(await prisma.idempotencyKey.count({ where: { organizationId: adminOrgId, endpoint: `/sales-orders/${orderId}/shipments` } })).toBe(0);

    const order = await prisma.salesOrder.findUnique({
      where: { organizationId_id: { organizationId: adminOrgId, id: orderId } },
    });
    expect(order!.status).toBe('CONFIRMED');

    const balance = await prisma.stockBalance.findFirst({
      where: { organizationId: adminOrgId, warehouseId, productId },
    });
    expect(balance!.onHand.toFixed(3)).toBe('10.000');
    expect(balance!.reserved.toFixed(3)).toBe('2.000');

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
    expect(reservations.every((reservation) => reservation.status === 'ACTIVE')).toBe(true);
  });
});
