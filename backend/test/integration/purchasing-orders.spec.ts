import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, loginForCookies } from '../fixtures/app';
import { getTestPrisma, resetDatabase, seedTestDatabase } from '../fixtures/database';

/**
 * Purchase orders, end to end.
 *
 * A purchase order is the organization's commitment to buy: a draft can be
 * edited, a confirmed order cannot, and every change carries the version the
 * caller read so two buyers cannot overwrite each other. The numbers are
 * exact, and the totals are the sum of the already-rounded line totals.
 */
describe('Purchase orders: end to end', () => {
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

  beforeAll(async () => {
    await resetDatabase();
    await seedTestDatabase();

    const { app: testApp } = await createTestApp();
    app = testApp;

    const adminEmail = `admin-orders-${Date.now()}@example.com`;
    const reg1 = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: adminEmail, password: 'Password1234' })
      .expect(201);
    adminOrgId = reg1.body.organization.id;
    adminCookie = await loginForCookies(app, adminEmail, 'Password1234');

    const otherEmail = `other-orders-${Date.now()}@example.com`;
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

    // The organization starts with the default units of measure; the order
    // lines capture their abbreviation, so two different units are needed.
    const units = await request(app.getHttpServer())
      .get('/api/v1/units-of-measure')
      .set('Cookie', adminCookie)
      .expect(200);
    const unitList = units.body as Array<{ id: string; name: string }>;
    const unit = unitList.find((candidate) => candidate.name === 'roll');
    const secondUnit = unitList.find((candidate) => candidate.name === 'box');
    unitId = unit!.id;
    otherUnitId = secondUnit!.id;

    const product = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({
        sku: 'SKU-PO-1',
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
        sku: 'SKU-PO-2',
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

  /** A minimal valid order body. */
  const orderBody = (lines?: unknown[]) => ({
    supplierId,
    warehouseId,
    orderDate: '2026-11-13',
    expectedDate: null,
    notes: '',
    ...(lines === undefined ? {} : { lines }),
  });

  it('creates a draft with a PO number, its lines and a server-calculated total', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/purchase-orders')
      .set('Cookie', adminCookie)
      .send(
        orderBody([
          { productId, quantity: '3.333', unitCost: '1.2345' },
          { productId: secondProductId, quantity: '2.500', unitCost: '4.5000' },
        ]),
      )
      .expect(201);

    expect(created.body).toMatchObject({
      status: 'DRAFT',
      version: 1,
      supplierId,
      warehouseId,
      orderDate: '2026-11-13',
      expectedDate: null,
      notes: '',
      total: '15.36',
    });
    expect(created.body.number).toMatch(/^PO-\d{6}$/);
    expect(created.body.lines).toHaveLength(2);

    const lines = created.body.lines as Array<{
      productId: string;
      quantity: string;
      received: string;
      outstanding: string;
      unitCost: string;
      unitOfMeasure: string;
      lineTotal: string;
    }>;
    const rollLine = lines.find((line) => line.productId === productId);
    expect(rollLine).toMatchObject({
      productId,
      quantity: '3.333',
      received: '0.000',
      outstanding: '3.333',
      unitCost: '1.2345',
      unitOfMeasure: 'roll',
      lineTotal: '4.11',
    });
    const boxLine = lines.find((line) => line.productId === secondProductId);
    expect(boxLine).toMatchObject({
      productId: secondProductId,
      unitOfMeasure: 'box',
      lineTotal: '11.25',
    });

    // A draft may be saved with no lines at all; it simply has no total.
    const empty = await request(app.getHttpServer())
      .post('/api/v1/purchase-orders')
      .set('Cookie', adminCookie)
      .send(orderBody([]))
      .expect(201);
    expect(empty.body).toMatchObject({ status: 'DRAFT', total: '0.00', lines: [] });
  });

  it('rounds every line half-up and totals the already-rounded lines', async () => {
    const vectors: Array<[string, string, string]> = [
      ['3.333', '1.2345', '4.11'],
      ['1.000', '0.0050', '0.01'],
      ['2.500', '4.5000', '11.25'],
    ];

    // One product appears at most once on an order, so each vector is read on
    // its own order.
    for (const [quantity, unitCost, expected] of vectors) {
      const single = await request(app.getHttpServer())
        .post('/api/v1/purchase-orders')
        .set('Cookie', adminCookie)
        .send(orderBody([{ productId, quantity, unitCost }]))
        .expect(201);
      expect(single.body.lines[0].lineTotal).toBe(expected);
      expect(single.body.total).toBe(expected);
    }

    // Two lines on one order: the total is the sum of the ROUNDED line totals.
    const combined = await request(app.getHttpServer())
      .post('/api/v1/purchase-orders')
      .set('Cookie', adminCookie)
      .send(
        orderBody([
          { productId, quantity: '3.333', unitCost: '1.2345' },
          { productId: secondProductId, quantity: '1.000', unitCost: '0.0050' },
        ]),
      )
      .expect(201);
    const combinedLines = combined.body.lines as Array<{ productId: string; lineTotal: string }>;
    const rollCombined = combinedLines.find((line) => line.productId === productId);
    const nutCombined = combinedLines.find((line) => line.productId === secondProductId);
    expect(rollCombined?.lineTotal).toBe('4.11');
    expect(nutCombined?.lineTotal).toBe('0.01');
    expect(combined.body.total).toBe('4.12');
  });

  it('edits a draft with the current version and refuses a stale one', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/purchase-orders')
      .set('Cookie', adminCookie)
      .send(orderBody([{ productId, quantity: '1.000', unitCost: '2.0000' }]))
      .expect(201);
    const id = created.body.id as string;

    const updated = await request(app.getHttpServer())
      .put(`/api/v1/purchase-orders/${id}`)
      .set('Cookie', adminCookie)
      .send({
        ...orderBody([{ productId, quantity: '5.000', unitCost: '2.0000' }]),
        version: 1,
      })
      .expect(200);
    expect(updated.body).toMatchObject({ version: 2, total: '10.00' });
    expect(updated.body.lines[0].quantity).toBe('5.000');

    const stale = await request(app.getHttpServer())
      .put(`/api/v1/purchase-orders/${id}`)
      .set('Cookie', adminCookie)
      .send({
        ...orderBody([{ productId, quantity: '9.000', unitCost: '2.0000' }]),
        version: 1,
      })
      .expect(409);
    expect(stale.body.code).toBe('STALE_VERSION');

    // Nothing changed.
    const reread = await request(app.getHttpServer())
      .get(`/api/v1/purchase-orders/${id}`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(reread.body.version).toBe(2);
    expect(reread.body.lines[0].quantity).toBe('5.000');
  });

  it('confirms and cancels, and refuses the transitions that are not allowed', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/purchase-orders')
      .set('Cookie', adminCookie)
      .send(orderBody([{ productId, quantity: '2.000', unitCost: '1.5000' }]))
      .expect(201);
    const id = created.body.id as string;

    // A draft with no lines cannot be confirmed.
    const empty = await request(app.getHttpServer())
      .post('/api/v1/purchase-orders')
      .set('Cookie', adminCookie)
      .send(orderBody([]))
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${empty.body.id}/confirm`)
      .set('Cookie', adminCookie)
      .send({ version: 1 })
      .expect(400);

    const confirmed = await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${id}/confirm`)
      .set('Cookie', adminCookie)
      .send({ version: 1 })
      .expect(200);
    expect(confirmed.body).toMatchObject({ status: 'CONFIRMED', version: 2 });

    // A confirmed order is not editable any more.
    await request(app.getHttpServer())
      .put(`/api/v1/purchase-orders/${id}`)
      .set('Cookie', adminCookie)
      .send({
        ...orderBody([{ productId, quantity: '2.000', unitCost: '1.5000' }]),
        version: 2,
      })
      .expect(409);

    // Confirming twice is refused.
    await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${id}/confirm`)
      .set('Cookie', adminCookie)
      .send({ version: 2 })
      .expect(409);

    const cancelled = await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${id}/cancel`)
      .set('Cookie', adminCookie)
      .send({ version: 2 })
      .expect(200);
    expect(cancelled.body).toMatchObject({ status: 'CANCELLED', version: 3 });

    // A cancelled order is closed.
    await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${id}/cancel`)
      .set('Cookie', adminCookie)
      .send({ version: 3 })
      .expect(409);
  });

  it('refuses the content that does not belong on an order', async () => {
    // The same product twice on one order.
    await request(app.getHttpServer())
      .post('/api/v1/purchase-orders')
      .set('Cookie', adminCookie)
      .send(
        orderBody([
          { productId, quantity: '1.000', unitCost: '1.0000' },
          { productId, quantity: '1.000', unitCost: '1.0000' },
        ]),
      )
      .expect(400);

    // The expected date before the order date.
    await request(app.getHttpServer())
      .post('/api/v1/purchase-orders')
      .set('Cookie', adminCookie)
      .send({
        ...orderBody([{ productId, quantity: '1.000', unitCost: '1.0000' }]),
        expectedDate: '2026-11-01',
      })
      .expect(400);

    // A zero quantity, a negative quantity, too many decimals.
    await request(app.getHttpServer())
      .post('/api/v1/purchase-orders')
      .set('Cookie', adminCookie)
      .send(orderBody([{ productId, quantity: '0.000', unitCost: '1.0000' }]))
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/purchase-orders')
      .set('Cookie', adminCookie)
      .send(orderBody([{ productId, quantity: '-1.000', unitCost: '1.0000' }]))
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/purchase-orders')
      .set('Cookie', adminCookie)
      .send(orderBody([{ productId, quantity: '1.0001', unitCost: '1.0000' }]))
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/purchase-orders')
      .set('Cookie', adminCookie)
      .send(orderBody([{ productId, quantity: '1.000', unitCost: '1.00001' }]))
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/purchase-orders')
      .set('Cookie', adminCookie)
      .send(orderBody([{ productId, quantity: '1.000', unitCost: '-1.0000' }]))
      .expect(400);

    // A contact that is not a supplier.
    const customer = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Cookie', adminCookie)
      .send({ name: 'Walk-in Buyer', isCustomer: true })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/purchase-orders')
      .set('Cookie', adminCookie)
      .send({
        ...orderBody([{ productId, quantity: '1.000', unitCost: '1.0000' }]),
        supplierId: customer.body.id,
      })
      .expect(400);

    // An archived product: a fresh one that no open order references.
    const archiveProduct = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({
        sku: 'SKU-PO-ARCH',
        name: 'Archive bolt',
        categoryId,
        unitId,
        purchasePrice: '1.0000',
        sellingPrice: '9.9900',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/products/${archiveProduct.body.id}/archive`)
      .set('Cookie', adminCookie)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/purchase-orders')
      .set('Cookie', adminCookie)
      .send(orderBody([{ productId: archiveProduct.body.id, quantity: '1.000', unitCost: '1.0000' }]))
      .expect(409);
    await request(app.getHttpServer())
      .post(`/api/v1/products/${archiveProduct.body.id}/restore`)
      .set('Cookie', adminCookie)
      .expect(200);
  });

  it('writes an audit entry for every change, in the same transaction', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/purchase-orders')
      .set('Cookie', adminCookie)
      .send(orderBody([{ productId, quantity: '1.000', unitCost: '1.0000' }]))
      .expect(201);
    const id = created.body.id as string;

    await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${id}/confirm`)
      .set('Cookie', adminCookie)
      .send({ version: 1 })
      .expect(200);

    const entries = await prisma.auditLog.findMany({
      where: { organizationId: adminOrgId, recordId: id },
      orderBy: { createdAt: 'asc' },
    });
    const actions = entries.map((entry) => entry.action);
    expect(actions).toContain('purchase_orders.created');
    expect(actions).toContain('purchase_orders.confirmed');
  });

  it('keeps another organization out, and refuses a caller without the permission', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/purchase-orders')
      .set('Cookie', adminCookie)
      .send(orderBody([{ productId, quantity: '1.000', unitCost: '1.0000' }]))
      .expect(201);
    const id = created.body.id as string;

    // Another organization sees nothing and cannot touch it.
    await request(app.getHttpServer())
      .get(`/api/v1/purchase-orders/${id}`)
      .set('Cookie', otherCookie)
      .expect(404);
    await request(app.getHttpServer())
      .put(`/api/v1/purchase-orders/${id}`)
      .set('Cookie', otherCookie)
      .send({
        ...orderBody([{ productId, quantity: '1.000', unitCost: '1.0000' }]),
        version: 1,
      })
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${id}/confirm`)
      .set('Cookie', otherCookie)
      .send({ version: 1 })
      .expect(404);

    // A member of THIS organization without purchasing.write cannot create
    // an order. The sales role holds no purchasing permission.
    const salesRole = await prisma.role.findFirst({
      where: { organizationId: adminOrgId, key: 'sales' },
    });
    const memberEmail = `member-orders-${Date.now()}@example.com`;
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
    const member = await request(app.getHttpServer())
      .post('/api/v1/purchase-orders')
      .set('Cookie', memberCookie)
      .send(orderBody([{ productId, quantity: '1.000', unitCost: '1.0000' }]))
      .expect(403);
    expect(member.body.code).toBe('FORBIDDEN');
  });
});
