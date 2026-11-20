import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, loginAndChangePassword, loginForCookies } from '../fixtures/app';
import { getTestPrisma, resetDatabase, seedTestDatabase } from '../fixtures/database';

/**
 * US1: tenant isolation and permissions across the invoice endpoints (T031).
 *
 * Another organization's record answers 404, never 403 - existence is not
 * disclosed. Reads need invoices.read, create/update invoices.write, issue
 * invoices.issue, void invoices.void. The Invoicing module gate is declared
 * once on the controller and currently allows every request, which is why the
 * cross-organization refusal is the tenant check and not the gate.
 */
describe('Invoicing US1: tenant isolation and permissions', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  let adminCookie: string;
  let otherCookie: string;
  let noInvoiceCookie: string;
  let invoicesReaderCookie: string;
  let paymentsReaderCookie: string;
  let productId: string;
  let customerId: string;
  let warehouseId: string;
  let issuedInvoiceId: string;
  let draftInvoiceId: string;
  let orderId: string;
  let paymentId: string;
  let paymentNumber: string;

  beforeAll(async () => {
    await resetDatabase();
    await seedTestDatabase();

    const { app: testApp } = await createTestApp();
    app = testApp;

    const adminEmail = `admin-io-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: adminEmail, password: 'Password1234' })
      .expect(201);
    adminCookie = await loginForCookies(app, adminEmail, 'Password1234');

    const otherEmail = `other-io-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: otherEmail, password: 'Password1234' })
      .expect(201);
    otherCookie = await loginForCookies(app, otherEmail, 'Password1234');

    // A member whose role carries no invoicing permission at all.
    const noneRole = await request(app.getHttpServer())
      .post('/api/v1/roles')
      .set('Cookie', adminCookie)
      .send({ name: 'No invoicing', key: `no-invoicing-${Date.now()}`, permissionCodes: ['contacts.read'] })
      .expect(201);
    const noneEmail = `none-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', adminCookie)
      .send({ email: noneEmail, name: 'No Invoicing', password: 'Password1234', roleIds: [noneRole.body.id] })
      .expect(201);
    noInvoiceCookie = await loginAndChangePassword(app, noneEmail, 'Password1234');

    // Two read-only members: one may read invoices, the other may read payments.
    const invoiceReaderRole = await request(app.getHttpServer())
      .post('/api/v1/roles')
      .set('Cookie', adminCookie)
      .send({ name: 'Invoice reader', key: `io-invoice-reader-${Date.now()}`, permissionCodes: ['invoices.read'] })
      .expect(201);
    const invoiceReaderEmail = `io-inv-reader-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', adminCookie)
      .send({ email: invoiceReaderEmail, name: 'Invoice Reader', password: 'Password1234', roleIds: [invoiceReaderRole.body.id] })
      .expect(201);
    invoicesReaderCookie = await loginAndChangePassword(app, invoiceReaderEmail, 'Password1234');

    const paymentReaderRole = await request(app.getHttpServer())
      .post('/api/v1/roles')
      .set('Cookie', adminCookie)
      .send({ name: 'Payment reader', key: `io-payment-reader-${Date.now()}`, permissionCodes: ['payments.read'] })
      .expect(201);
    const paymentReaderEmail = `io-pay-reader-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', adminCookie)
      .send({ email: paymentReaderEmail, name: 'Payment Reader', password: 'Password1234', roleIds: [paymentReaderRole.body.id] })
      .expect(201);
    paymentsReaderCookie = await loginAndChangePassword(app, paymentReaderEmail, 'Password1234');

    const category = await request(app.getHttpServer())
      .post('/api/v1/product-categories')
      .set('Cookie', adminCookie)
      .send({ name: 'Isolation' })
      .expect(201);
    const units = await request(app.getHttpServer())
      .get('/api/v1/units-of-measure')
      .set('Cookie', adminCookie)
      .expect(200);
    const unitId = (units.body as Array<{ id: string; name: string }>).find((c) => c.name === 'roll')!.id;
    productId = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({ sku: `SKU-IO-${Date.now()}`, name: 'Isolation bolt', categoryId: category.body.id, unitId, purchasePrice: '1.0000', sellingPrice: '1.2345' })
      .expect(201)
      .then((res) => res.body.id as string);

    const customer = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Cookie', adminCookie)
      .send({ code: `CUST-IO-${Date.now()}`, name: 'Isolation Customer', email: 'iso@example.com', isCustomer: true })
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
      .set('Idempotency-Key', `io-stock-${Date.now()}`)
      .send({ warehouseId, productId, quantity: '1000.000', reason: 'COUNT_CORRECTION', note: 'Stock for the isolation suite.' })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post('/api/v1/sales-orders')
      .set('Cookie', adminCookie)
      .send({ customerId, warehouseId, orderDate: '2026-11-14', notes: '', lines: [{ productId, quantity: '1.000', unitPrice: '1.2345' }] })
      .expect(201);
    orderId = created.body.id as string;
    await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/confirm`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `confirm-${orderId}`)
      .send({ version: 1 })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/shipments`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `ship-${orderId}`)
      .send({})
      .expect(201);

    draftInvoiceId = await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/invoices`)
      .set('Cookie', adminCookie)
      .send({})
      .expect(201)
      .then((res) => res.body.id as string);

    const secondOrder = await request(app.getHttpServer())
      .post('/api/v1/sales-orders')
      .set('Cookie', adminCookie)
      .send({ customerId, warehouseId, orderDate: '2026-11-14', notes: '', lines: [{ productId, quantity: '1.000', unitPrice: '1.2345' }] })
      .expect(201);
    const secondId = secondOrder.body.id as string;
    await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${secondId}/confirm`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `confirm-${secondId}`)
      .send({ version: 1 })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${secondId}/shipments`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `ship-${secondId}`)
      .send({})
      .expect(201);
    issuedInvoiceId = await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${secondId}/invoices`)
      .set('Cookie', adminCookie)
      .send({})
      .expect(201)
      .then((res) => res.body.id as string);
    await request(app.getHttpServer())
      .post(`/api/v1/invoices/${issuedInvoiceId}/issue`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `issue-${issuedInvoiceId}`)
      .send({})
      .expect(200);

    // One payment on it, so the payments reads have a real record to find.
    const paid = await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `io-payment-${issuedInvoiceId}`)
      .send({
        customerId,
        amount: '1.23',
        paymentDate: '2026-11-14',
        method: 'CASH',
        reference: 'IO-PAYMENT',
        allocations: [{ invoiceId: issuedInvoiceId, amount: '1.23', expectedBalance: '1.23' }],
      })
      .expect(201);
    paymentId = paid.body.id as string;
    paymentNumber = paid.body.number as string;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('T031: another organization is 404 on every invoice endpoint', async () => {
    await request(app.getHttpServer()).get(`/api/v1/invoices/${issuedInvoiceId}`).set('Cookie', otherCookie).expect(404);
    await request(app.getHttpServer()).put(`/api/v1/invoices/${issuedInvoiceId}`).set('Cookie', otherCookie).send({ dueDate: '2027-01-01', version: 2 }).expect(404);
    await request(app.getHttpServer()).post(`/api/v1/invoices/${issuedInvoiceId}/issue`).set('Cookie', otherCookie).set('Idempotency-Key', 'io-other-issue').send({}).expect(404);
    await request(app.getHttpServer()).post(`/api/v1/invoices/${issuedInvoiceId}/void`).set('Cookie', otherCookie).set('Idempotency-Key', 'io-other-void').send({ reason: 'x' }).expect(404);
    await request(app.getHttpServer()).post(`/api/v1/sales-orders/${orderId}/invoices`).set('Cookie', otherCookie).send({}).expect(404);
    // The list endpoints (GET /invoices, GET /invoices/open) are US4 surface;
    // their isolation coverage arrives with T059.
  });

  it('T031: a member with no invoicing permission is refused 403 everywhere', async () => {
    await request(app.getHttpServer()).get(`/api/v1/invoices/${issuedInvoiceId}`).set('Cookie', noInvoiceCookie).expect(403).expect((res) => expect(res.body.code).toBe('FORBIDDEN'));
    // GET /invoices and GET /invoices/open are US4 surface; covered by T059.
    await request(app.getHttpServer()).post(`/api/v1/sales-orders/${orderId}/invoices`).set('Cookie', noInvoiceCookie).send({}).expect(403);
    await request(app.getHttpServer()).put(`/api/v1/invoices/${draftInvoiceId}`).set('Cookie', noInvoiceCookie).send({ dueDate: '2027-01-01', version: 1 }).expect(403);
    await request(app.getHttpServer()).post(`/api/v1/invoices/${draftInvoiceId}/issue`).set('Cookie', noInvoiceCookie).set('Idempotency-Key', 'io-none-issue').send({}).expect(403);
    await request(app.getHttpServer()).post(`/api/v1/invoices/${draftInvoiceId}/void`).set('Cookie', noInvoiceCookie).set('Idempotency-Key', 'io-none-void').send({ reason: 'x' }).expect(403);
  });

  it('T031: the module gate passes a session member through to the tenant check', async () => {
    // The gate is allow-all today; the cross-organization 404 above is reached
    // only because SessionGuard and the gate both let the request through.
    // A disabled module would answer MODULE_DISABLED here instead.
    const res = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${issuedInvoiceId}`)
      .set('Cookie', otherCookie)
      .expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('T059: the list and detail reads are tenant-scoped and each needs its own permission', async () => {
    const issued = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${issuedInvoiceId}`)
      .set('Cookie', adminCookie)
      .expect(200);
    const invoiceNumber = issued.body.number as string;

    // Another organization sees none of these records. The lists come back
    // empty rather than leaking a count, and the identifiers it holds answer 404.
    const otherInvoices = await request(app.getHttpServer())
      .get('/api/v1/invoices')
      .query({ search: invoiceNumber, page: 1, pageSize: 100 })
      .set('Cookie', otherCookie)
      .expect(200);
    expect(otherInvoices.body.total).toBe(0);
    expect(otherInvoices.body.items).toEqual([]);
    const otherPayments = await request(app.getHttpServer())
      .get('/api/v1/payments')
      .query({ search: paymentNumber, page: 1, pageSize: 100 })
      .set('Cookie', otherCookie)
      .expect(200);
    expect(otherPayments.body.total).toBe(0);
    expect(otherPayments.body.items).toEqual([]);
    await request(app.getHttpServer())
      .get('/api/v1/invoices/open')
      .query({ customerId })
      .set('Cookie', otherCookie)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/payments/${paymentId}`)
      .set('Cookie', otherCookie)
      .expect(404)
      .expect((res) => expect(res.body.code).toBe('NOT_FOUND'));

    // A member without an invoicing or payments permission is refused 403 on
    // every list and detail read - the module gate lets the request through and
    // the permission guard is what refuses it.
    const noPermissionReads: Array<[string, Record<string, string>]> = [
      ['/api/v1/invoices', {}],
      ['/api/v1/invoices/open', { customerId }],
      [`/api/v1/invoices/${issuedInvoiceId}`, {}],
      ['/api/v1/payments', {}],
      [`/api/v1/payments/${paymentId}`, {}],
    ];
    for (const [path, query] of noPermissionReads) {
      await request(app.getHttpServer())
        .get(path)
        .query(query)
        .set('Cookie', noInvoiceCookie)
        .expect(403)
        .expect((res) => expect(res.body.code).toBe('FORBIDDEN'));
    }

    // invoices.read opens the invoice reads, and only those.
    for (const [path, query] of [
      ['/api/v1/invoices', {}],
      ['/api/v1/invoices/open', { customerId }],
      [`/api/v1/invoices/${issuedInvoiceId}`, {}],
    ] as Array<[string, Record<string, string>]>) {
      await request(app.getHttpServer())
        .get(path)
        .query(query)
        .set('Cookie', invoicesReaderCookie)
        .expect(200);
    }
    for (const path of ['/api/v1/payments', `/api/v1/payments/${paymentId}`]) {
      await request(app.getHttpServer())
        .get(path)
        .set('Cookie', invoicesReaderCookie)
        .expect(403)
        .expect((res) => expect(res.body.code).toBe('FORBIDDEN'));
    }

    // payments.read opens the payment reads, and only those.
    for (const path of ['/api/v1/payments', `/api/v1/payments/${paymentId}`]) {
      const response = await request(app.getHttpServer())
        .get(path)
        .set('Cookie', paymentsReaderCookie)
        .expect(200);
      expect(response.body.code).toBeUndefined();
    }
    for (const [path, query] of [
      ['/api/v1/invoices', {}],
      ['/api/v1/invoices/open', { customerId }],
      [`/api/v1/invoices/${issuedInvoiceId}`, {}],
    ] as Array<[string, Record<string, string>]>) {
      await request(app.getHttpServer())
        .get(path)
        .query(query)
        .set('Cookie', paymentsReaderCookie)
        .expect(403)
        .expect((res) => expect(res.body.code).toBe('FORBIDDEN'));
    }
  });
});
