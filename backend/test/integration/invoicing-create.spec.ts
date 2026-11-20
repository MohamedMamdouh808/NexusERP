import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, loginForCookies, loginAndChangePassword } from '../fixtures/app';
import { getTestPrisma, resetDatabase, seedTestDatabase } from '../fixtures/database';

/**
 * US1: creating an invoice from a shipped order (T024, T025).
 *
 * The draft copies the order's customer, lines, quantities and unit prices with
 * server-computed half-up line totals; the create is NOT idempotent; only
 * `invoices.write` is required (the order is read through the Sales service
 * inside the transaction, so no sales permission is needed).
 */
describe('Invoicing US1: create an invoice from a shipped order', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  let adminCookie: string;
  let adminOrgId: string;
  let otherCookie: string;
  let productA: string;
  let productB: string;
  let customerId: string;
  let warehouseId: string;
  let writeOnlyCookie: string;
  let salesOnlyCookie: string;

  beforeAll(async () => {
    await resetDatabase();
    await seedTestDatabase();

    const { app: testApp } = await createTestApp();
    app = testApp;

    const adminEmail = `admin-inv-${Date.now()}@example.com`;
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: adminEmail, password: 'Password1234' })
      .expect(201);
    adminOrgId = reg.body.organization.id as string;
    adminCookie = await loginForCookies(app, adminEmail, 'Password1234');

    const otherEmail = `other-inv-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: otherEmail, password: 'Password1234' })
      .expect(201);
    otherCookie = await loginForCookies(app, otherEmail, 'Password1234');

    const category = await request(app.getHttpServer())
      .post('/api/v1/product-categories')
      .set('Cookie', adminCookie)
      .send({ name: 'Invoicing' })
      .expect(201);
    const units = await request(app.getHttpServer())
      .get('/api/v1/units-of-measure')
      .set('Cookie', adminCookie)
      .expect(200);
    const unitId = (units.body as Array<{ id: string; name: string }>).find((c) => c.name === 'roll')!.id;

    [productA, productB] = (await Promise.all(
      ['SKU-INV-A', 'SKU-INV-B'].map((sku) =>
        request(app.getHttpServer())
          .post('/api/v1/products')
          .set('Cookie', adminCookie)
          .send({ sku, name: `Invoice ${sku}`, categoryId: category.body.id, unitId, purchasePrice: '1.0000', sellingPrice: '1.2345' })
          .expect(201)
          .then((res) => res.body.id as string),
      ),
    )) as [string, string];

    const customer = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Cookie', adminCookie)
      .send({ code: 'CUST-INV', name: 'Invoice Customer', email: 'inv@example.com', isCustomer: true })
      .expect(201);
    customerId = customer.body.id as string;

    const warehouses = await request(app.getHttpServer())
      .get('/api/v1/warehouses')
      .set('Cookie', adminCookie)
      .expect(200);
    warehouseId = (warehouses.body.items as Array<{ id: string; isDefault: boolean }>).find((w) => w.isDefault)!.id;

    await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `inv-stock-${Date.now()}`)
      .send({ warehouseId, productId: productA, quantity: '1000.000', reason: 'COUNT_CORRECTION', note: 'Stock for invoicing suite.' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `inv-stock-b-${Date.now()}`)
      .send({ warehouseId, productId: productB, quantity: '1000.000', reason: 'COUNT_CORRECTION', note: 'Stock for invoicing suite.' })
      .expect(201);

    // A member holding invoices.write only, and one holding sales.write only.
    const writeOnly = await request(app.getHttpServer())
      .post('/api/v1/roles')
      .set('Cookie', adminCookie)
      .send({ name: 'Invoice writer', key: `invoice-writer-${Date.now()}`, permissionCodes: ['invoices.write'] })
      .expect(201);
    const writeEmail = `invw-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', adminCookie)
      .send({ email: writeEmail, name: 'Invoice Writer', password: 'Password1234', roleIds: [writeOnly.body.id] })
      .expect(201);
    writeOnlyCookie = await loginAndChangePassword(app, writeEmail, 'Password1234');

    const salesOnly = await request(app.getHttpServer())
      .post('/api/v1/roles')
      .set('Cookie', adminCookie)
      .send({ name: 'Sales writer', key: `sales-writer-${Date.now()}`, permissionCodes: ['sales.write'] })
      .expect(201);
    const salesEmail = `saw-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', adminCookie)
      .send({ email: salesEmail, name: 'Sales Writer', password: 'Password1234', roleIds: [salesOnly.body.id] })
      .expect(201);
    salesOnlyCookie = await loginAndChangePassword(app, salesEmail, 'Password1234');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Draft, confirm and ship an order, returning its id. */
  async function shippedOrder(lines: Array<{ productId: string; quantity: string; unitPrice: string }>): Promise<string> {
    const created = await request(app.getHttpServer())
      .post('/api/v1/sales-orders')
      .set('Cookie', adminCookie)
      .send({ customerId, warehouseId, orderDate: '2026-11-14', notes: '', lines })
      .expect(201);
    const id = created.body.id as string;
    await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${id}/confirm`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `confirm-${id}`)
      .send({ version: 1 })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${id}/shipments`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `ship-${id}`)
      .send({})
      .expect(201);
    return id;
  }

  it('T024: saves a DRAFT copying the order, with rounded line totals and an audit entry', async () => {
    const orderId = await shippedOrder([
      { productId: productA, quantity: '2.000', unitPrice: '1.2345' }, // 2.469 -> 2.47
      { productId: productB, quantity: '0.125', unitPrice: '1.0000' }, // 0.125 -> 0.13 half-up
    ]);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/invoices`)
      .set('Cookie', adminCookie)
      .send({})
      .expect(201);

    expect(res.body.status).toBe('DRAFT');
    expect(res.body.number).toBeNull();
    expect(res.body.issueDate).toBeNull();
    expect(res.body.version).toBe(1);
    expect(res.body.label).toBe('Operational invoice - not a tax invoice');
    expect(res.body.customerId).toBe(customerId);
    expect(res.body.total).toBe('2.60');
    expect(res.body.paid).toBe('0.00');
    expect(res.body.balance).toBe('2.60');
    expect(res.body.lines).toHaveLength(2);
    expect(res.body.lines.map((line: { lineTotal: string }) => line.lineTotal)).toEqual(['2.47', '0.13']);

    const audit = await prisma.auditLog.findFirst({
      where: { organizationId: adminOrgId, action: 'invoices.created', recordType: 'invoice', recordId: res.body.id },
    });
    expect(audit).not.toBeNull();
  });

  it('T025: refuses another organization, a non-shipped order and a second invoice', async () => {
    const shippedId = await shippedOrder([{ productId: productA, quantity: '1.000', unitPrice: '1.2345' }]);
    const draft = await request(app.getHttpServer())
      .post('/api/v1/sales-orders')
      .set('Cookie', adminCookie)
      .send({ customerId, warehouseId, orderDate: '2026-11-14', notes: '', lines: [{ productId: productA, quantity: '1.000', unitPrice: '1.2345' }] })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${shippedId}/invoices`)
      .set('Cookie', otherCookie)
      .send({})
      .expect(404);

    await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${draft.body.id}/invoices`)
      .set('Cookie', adminCookie)
      .send({})
      .expect(409)
      .expect((res) => expect(res.body.code).toBe('INVALID_STATE_TRANSITION'));

    await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${shippedId}/invoices`)
      .set('Cookie', adminCookie)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${shippedId}/invoices`)
      .set('Cookie', adminCookie)
      .send({})
      .expect(409)
      .expect((res) => expect(res.body.code).toBe('INVOICE_ALREADY_EXISTS'));

    // The refusal left nothing behind: still exactly one invoice on the order.
    const invoices = await prisma.invoice.findMany({ where: { organizationId: adminOrgId, salesOrderId: shippedId } });
    expect(invoices).toHaveLength(1);
  });

  it('T025: a VOID invoice does not block re-invoicing the order', async () => {
    const orderId = await shippedOrder([{ productId: productA, quantity: '1.000', unitPrice: '1.2345' }]);

    const first = await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/invoices`)
      .set('Cookie', adminCookie)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/invoices/${first.body.id}/void`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `void-${first.body.id}`)
      .send({ reason: 'Customer cancelled' })
      .expect(200);

    const second = await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/invoices`)
      .set('Cookie', adminCookie)
      .send({})
      .expect(201);
    expect(second.body.id).not.toBe(first.body.id);
    expect(second.body.status).toBe('DRAFT');
  });

  it('T025: invoices.write without sales.read can create; sales.write without invoices.write gets 403', async () => {
    const orderId = await shippedOrder([{ productId: productA, quantity: '1.000', unitPrice: '1.2345' }]);

    await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/invoices`)
      .set('Cookie', writeOnlyCookie)
      .send({})
      .expect(201);

    const otherOrderId = await shippedOrder([{ productId: productB, quantity: '1.000', unitPrice: '1.2345' }]);
    await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${otherOrderId}/invoices`)
      .set('Cookie', salesOnlyCookie)
      .send({})
      .expect(403)
      .expect((res) => expect(res.body.code).toBe('FORBIDDEN'));
  });
});
