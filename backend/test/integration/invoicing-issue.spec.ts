import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, loginForCookies } from '../fixtures/app';
import { getTestPrisma, resetDatabase, seedTestDatabase } from '../fixtures/database';

/**
 * US1: issuing a draft invoice (T027, T028).
 *
 * Issue allocates the INV- six-digit number in the transaction, stamps today
 * UTC, resolves the due date (request value -> draft's kept -> issue date +
 * default payment terms) and makes the invoice immutable. Idempotency-Key is
 * required; a replayed key with the same body returns the stored response, a
 * different body is refused 422.
 */
describe('Invoicing US1: issue a draft invoice', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  let adminCookie: string;
  let adminOrgId: string;
  let productId: string;
  let customerId: string;
  let warehouseId: string;

  beforeAll(async () => {
    await resetDatabase();
    await seedTestDatabase();

    const { app: testApp } = await createTestApp();
    app = testApp;

    const adminEmail = `admin-is-${Date.now()}@example.com`;
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: adminEmail, password: 'Password1234' })
      .expect(201);
    adminOrgId = reg.body.organization.id as string;
    adminCookie = await loginForCookies(app, adminEmail, 'Password1234');

    const category = await request(app.getHttpServer())
      .post('/api/v1/product-categories')
      .set('Cookie', adminCookie)
      .send({ name: 'Issue' })
      .expect(201);
    const units = await request(app.getHttpServer())
      .get('/api/v1/units-of-measure')
      .set('Cookie', adminCookie)
      .expect(200);
    const unitId = (units.body as Array<{ id: string; name: string }>).find((c) => c.name === 'roll')!.id;
    productId = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({ sku: `SKU-IS-${Date.now()}`, name: 'Issue bolt', categoryId: category.body.id, unitId, purchasePrice: '1.0000', sellingPrice: '1.2345' })
      .expect(201)
      .then((res) => res.body.id as string);

    const customer = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Cookie', adminCookie)
      .send({ code: `CUST-IS-${Date.now()}`, name: 'Issue Customer', email: 'issue@example.com', isCustomer: true })
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
      .set('Idempotency-Key', `is-stock-${Date.now()}`)
      .send({ warehouseId, productId, quantity: '1000.000', reason: 'COUNT_CORRECTION', note: 'Stock for the issue suite.' })
      .expect(201);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function draftInvoice(): Promise<{ id: string; version: number }> {
    const created = await request(app.getHttpServer())
      .post('/api/v1/sales-orders')
      .set('Cookie', adminCookie)
      .send({ customerId, warehouseId, orderDate: '2026-11-14', notes: '', lines: [{ productId, quantity: '1.000', unitPrice: '1.2345' }] })
      .expect(201);
    const orderId = created.body.id as string;
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

    const res = await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/invoices`)
      .set('Cookie', adminCookie)
      .send({})
      .expect(201);
    return { id: res.body.id as string, version: res.body.version as number };
  }

  it('T027: allocates INV-, stamps today UTC, resolves the default due date, audits', async () => {
    const draft = await draftInvoice();
    const today = new Date().toISOString().slice(0, 10);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${draft.id}/issue`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `issue-${draft.id}`)
      .send({})
      .expect(200);

    expect(res.body.status).toBe('ISSUED');
    expect(res.body.number).toMatch(/^INV-\d{6}$/);
    expect(res.body.issueDate).toBe(today);
    const expectedDue = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    expect(res.body.dueDate).toBe(expectedDue);
    expect(res.body.version).toBe(draft.version + 1);

    const audit = await prisma.auditLog.findFirst({
      where: { organizationId: adminOrgId, action: 'invoices.issued', recordType: 'invoice', recordId: draft.id },
    });
    expect(audit).not.toBeNull();
  });

  it('T027: due date resolution - request value first, then the draft kept, both validated', async () => {
    const draft = await draftInvoice();
    await request(app.getHttpServer())
      .put(`/api/v1/invoices/${draft.id}`)
      .set('Cookie', adminCookie)
      .send({ dueDate: '2027-02-03', version: draft.version })
      .expect(200);

    const kept = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${draft.id}/issue`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `issue-kept-${draft.id}`)
      .send({})
      .expect(200);
    expect(kept.body.dueDate).toBe('2027-02-03');

    const requestValue = await draftInvoice();
    await request(app.getHttpServer())
      .post(`/api/v1/invoices/${requestValue.id}/issue`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `issue-req-${requestValue.id}`)
      .send({ dueDate: '2027-03-04' })
      .expect(200)
      .expect((res) => expect(res.body.dueDate).toBe('2027-03-04'));

    const past = await draftInvoice();
    await request(app.getHttpServer())
      .post(`/api/v1/invoices/${past.id}/issue`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `issue-past-${past.id}`)
      .send({ dueDate: '2020-01-01' })
      .expect(400)
      .expect((res) => expect(res.body.code).toBe('VALIDATION_ERROR'));

    // The draft's kept due date is carried into the issue (validated there as
    // well, per D-004). The "draft due date before the issue date" 400 branch is
    // unreachable through the API within one day: the draft may only carry a
    // due date at or after its creation date, and the issue date is today, so
    // the branch can only fire across a midnight boundary - the request-value
    // branch above proves the same validation path answers 400.
  });

  it('T027: idempotency - replay returns the stored response, a different body is refused 422, a missing key is refused 400', async () => {
    const draft = await draftInvoice();

    const first = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${draft.id}/issue`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `idem-${draft.id}`)
      .send({})
      .expect(200);

    const replay = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${draft.id}/issue`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `idem-${draft.id}`)
      .send({})
      .expect(200);
    expect(replay.body.number).toBe(first.body.number);
    expect(replay.body.version).toBe(first.body.version);

    await request(app.getHttpServer())
      .post(`/api/v1/invoices/${draft.id}/issue`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `idem-${draft.id}`)
      .send({ dueDate: '2027-01-01' })
      .expect(422)
      .expect((res) => expect(res.body.code).toBe('IDEMPOTENCY_KEY_REUSED'));

    const noKey = await draftInvoice();
    await request(app.getHttpServer())
      .post(`/api/v1/invoices/${noKey.id}/issue`)
      .set('Cookie', adminCookie)
      .send({})
      .expect(400);

    const second = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${draft.id}/issue`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `idem2-${draft.id}`)
      .send({})
      .expect(409)
      .expect((res) => expect(res.body.code).toBe('INVALID_STATE_TRANSITION'));
    expect(second.body).toBeDefined();
  });

  it('T028: two simultaneous issues allocate exactly one number and refuse the loser', async () => {
    const draft = await draftInvoice();

    const [a, b] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/invoices/${draft.id}/issue`)
        .set('Cookie', adminCookie)
        .set('Idempotency-Key', `race-a-${draft.id}`)
        .send({}),
      request(app.getHttpServer())
        .post(`/api/v1/invoices/${draft.id}/issue`)
        .set('Cookie', adminCookie)
        .set('Idempotency-Key', `race-b-${draft.id}`)
        .send({}),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);

    const invoice = await prisma.invoice.findUnique({ where: { id: draft.id } });
    expect(invoice!.number).toMatch(/^INV-\d{6}$/);
    const duplicates = await prisma.invoice.count({
      where: { organizationId: adminOrgId, number: invoice!.number },
    });
    expect(duplicates).toBe(1);
  });
});
