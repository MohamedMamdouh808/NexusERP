import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, loginForCookies } from '../fixtures/app';
import { getTestPrisma, resetDatabase, seedTestDatabase } from '../fixtures/database';

/**
 * US1: updating a draft invoice (T026).
 *
 * Only `dueDate` is editable, only while DRAFT; a due date before the creation
 * date is refused with 400 VALIDATION_ERROR naming the field, a stale version
 * with 409 STALE_VERSION, and any state but DRAFT with 409
 * INVALID_STATE_TRANSITION. No Idempotency-Key is required.
 */
describe('Invoicing US1: draft update', () => {
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

    const adminEmail = `admin-dr-${Date.now()}@example.com`;
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: adminEmail, password: 'Password1234' })
      .expect(201);
    adminOrgId = reg.body.organization.id as string;
    adminCookie = await loginForCookies(app, adminEmail, 'Password1234');

    const category = await request(app.getHttpServer())
      .post('/api/v1/product-categories')
      .set('Cookie', adminCookie)
      .send({ name: 'Draft' })
      .expect(201);
    const units = await request(app.getHttpServer())
      .get('/api/v1/units-of-measure')
      .set('Cookie', adminCookie)
      .expect(200);
    const unitId = (units.body as Array<{ id: string; name: string }>).find((c) => c.name === 'roll')!.id;
    productId = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({ sku: `SKU-DR-${Date.now()}`, name: 'Draft bolt', categoryId: category.body.id, unitId, purchasePrice: '1.0000', sellingPrice: '1.2345' })
      .expect(201)
      .then((res) => res.body.id as string);

    const customer = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Cookie', adminCookie)
      .send({ code: `CUST-DR-${Date.now()}`, name: 'Draft Customer', email: 'draft@example.com', isCustomer: true })
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
      .set('Idempotency-Key', `dr-stock-${Date.now()}`)
      .send({ warehouseId, productId, quantity: '1000.000', reason: 'COUNT_CORRECTION', note: 'Stock for the draft suite.' })
      .expect(201);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function shippedOrder(): Promise<string> {
    const created = await request(app.getHttpServer())
      .post('/api/v1/sales-orders')
      .set('Cookie', adminCookie)
      .send({ customerId, warehouseId, orderDate: '2026-11-14', notes: '', lines: [{ productId, quantity: '1.000', unitPrice: '1.2345' }] })
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

  async function draftInvoice(): Promise<{ id: string; version: number }> {
    const orderId = await shippedOrder();
    const res = await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/invoices`)
      .set('Cookie', adminCookie)
      .send({})
      .expect(201);
    return { id: res.body.id as string, version: res.body.version as number };
  }

  it('T026: updates only the due date, increments the version, writes the audit entry', async () => {
    const draft = await draftInvoice();

    const res = await request(app.getHttpServer())
      .put(`/api/v1/invoices/${draft.id}`)
      .set('Cookie', adminCookie)
      .send({ dueDate: '2027-01-02', version: draft.version })
      .expect(200);

    expect(res.body.status).toBe('DRAFT');
    expect(res.body.dueDate).toBe('2027-01-02');
    expect(res.body.version).toBe(draft.version + 1);

    const audit = await prisma.auditLog.findFirst({
      where: { organizationId: adminOrgId, action: 'invoices.updated', recordType: 'invoice', recordId: draft.id },
    });
    expect(audit).not.toBeNull();
  });

  it('T026: refuses a due date before the creation date, naming the field', async () => {
    const draft = await draftInvoice();

    const res = await request(app.getHttpServer())
      .put(`/api/v1/invoices/${draft.id}`)
      .set('Cookie', adminCookie)
      .send({ dueDate: '2020-01-01', version: draft.version })
      .expect(400);

    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(res.body.details)).toContain('dueDate');
  });

  it('T026: refuses a non-draft and a stale version', async () => {
    const draft = await draftInvoice();

    await request(app.getHttpServer())
      .post(`/api/v1/invoices/${draft.id}/issue`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `issue-${draft.id}`)
      .send({})
      .expect(200);

    await request(app.getHttpServer())
      .put(`/api/v1/invoices/${draft.id}`)
      .set('Cookie', adminCookie)
      .send({ dueDate: '2027-01-02', version: draft.version + 1 })
      .expect(409)
      .expect((res) => expect(res.body.code).toBe('INVALID_STATE_TRANSITION'));

    const freshDraft = await draftInvoice();
    await request(app.getHttpServer())
      .put(`/api/v1/invoices/${freshDraft.id}`)
      .set('Cookie', adminCookie)
      .send({ dueDate: '2027-01-02', version: freshDraft.version + 5 })
      .expect(409)
      .expect((res) => expect(res.body.code).toBe('STALE_VERSION'));
  });
});
