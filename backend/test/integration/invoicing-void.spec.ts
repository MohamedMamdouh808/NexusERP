import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, loginForCookies } from '../fixtures/app';
import { getTestPrisma, resetDatabase, seedTestDatabase } from '../fixtures/database';

/**
 * US1: voiding an invoice (T029).
 *
 * DRAFT and ISSUED-with-zero-active-allocations void; anything with an active
 * allocation refuses 409 INVOICE_HAS_PAYMENTS. The reason, timestamp and actor
 * are stored together; the invoice stays readable as VOID and its order may be
 * invoiced again. Void is idempotent.
 */
describe('Invoicing US1: void an invoice', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  let adminCookie: string;
  let adminUserId: string;
  let productId: string;
  let customerId: string;
  let warehouseId: string;

  beforeAll(async () => {
    await resetDatabase();
    await seedTestDatabase();

    const { app: testApp } = await createTestApp();
    app = testApp;

    const adminEmail = `admin-vo-${Date.now()}@example.com`;
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: adminEmail, password: 'Password1234' })
      .expect(201);
    adminUserId = reg.body.user.id as string;
    adminCookie = await loginForCookies(app, adminEmail, 'Password1234');

    const category = await request(app.getHttpServer())
      .post('/api/v1/product-categories')
      .set('Cookie', adminCookie)
      .send({ name: 'Void' })
      .expect(201);
    const units = await request(app.getHttpServer())
      .get('/api/v1/units-of-measure')
      .set('Cookie', adminCookie)
      .expect(200);
    const unitId = (units.body as Array<{ id: string; name: string }>).find((c) => c.name === 'roll')!.id;
    productId = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({ sku: `SKU-VO-${Date.now()}`, name: 'Void bolt', categoryId: category.body.id, unitId, purchasePrice: '1.0000', sellingPrice: '1.2345' })
      .expect(201)
      .then((res) => res.body.id as string);

    const customer = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Cookie', adminCookie)
      .send({ code: `CUST-VO-${Date.now()}`, name: 'Void Customer', email: 'void@example.com', isCustomer: true })
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
      .set('Idempotency-Key', `vo-stock-${Date.now()}`)
      .send({ warehouseId, productId, quantity: '1000.000', reason: 'COUNT_CORRECTION', note: 'Stock for the void suite.' })
      .expect(201);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function issuedInvoice(): Promise<string> {
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

    const draft = await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/invoices`)
      .set('Cookie', adminCookie)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/invoices/${draft.body.id}/issue`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `issue-${draft.body.id}`)
      .send({})
      .expect(200);
    return draft.body.id as string;
  }

  it('T029: voids a DRAFT and an ISSUED invoice with zero allocations, storing reason/at/by together', async () => {
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
    const draft = await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/invoices`)
      .set('Cookie', adminCookie)
      .send({})
      .expect(201);

    const voidDraft = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${draft.body.id}/void`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `void-${draft.body.id}`)
      .send({ reason: 'Customer cancelled the order' })
      .expect(200);
    expect(voidDraft.body.status).toBe('VOID');
    expect(voidDraft.body.voidReason).toBe('Customer cancelled the order');
    expect(voidDraft.body.voidedAt).not.toBeNull();

    const row = await prisma.invoice.findUnique({ where: { id: draft.body.id } });
    expect(row!.voidReason).toBe('Customer cancelled the order');
    expect(row!.voidedAt).not.toBeNull();
    expect(row!.voidedById).toBe(adminUserId);

    // VOID stays readable, and the order may be invoiced again.
    await request(app.getHttpServer())
      .get(`/api/v1/invoices/${draft.body.id}`)
      .set('Cookie', adminCookie)
      .expect(200);
    const again = await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/invoices`)
      .set('Cookie', adminCookie)
      .send({})
      .expect(201);
    expect(again.body.status).toBe('DRAFT');

    const issuedId = await issuedInvoice();
    await request(app.getHttpServer())
      .post(`/api/v1/invoices/${issuedId}/void`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `void-${issuedId}`)
      .send({ reason: 'Issued by mistake' })
      .expect(200);
  });

  it('T029: refuses without a reason, with an allocation, and twice', async () => {
    const issuedId = await issuedInvoice();

    await request(app.getHttpServer())
      .post(`/api/v1/invoices/${issuedId}/void`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `noreason-${issuedId}`)
      .send({})
      .expect(400)
      .expect((res) => expect(res.body.code).toBe('VALIDATION_ERROR'));

    // An active allocation blocks the void: record 0.60 of the 1.23 invoice
    // through the API, leaving it PARTIALLY_PAID with 0.60 allocated - a
    // state that agrees with its allocated balance.
    const block = await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `void-block-${issuedId}`)
      .send({
        customerId,
        amount: '0.60',
        paymentDate: '2026-11-14',
        method: 'CASH',
        allocations: [{ invoiceId: issuedId, amount: '0.60', expectedBalance: '1.23' }],
      })
      .expect(201);
    expect(block.body.status).toBe('RECORDED');

    await request(app.getHttpServer())
      .post(`/api/v1/invoices/${issuedId}/void`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `blocked-${issuedId}`)
      .send({ reason: 'Should not void' })
      .expect(409)
      .expect((res) => expect(res.body.code).toBe('INVOICE_HAS_PAYMENTS'));

    const after = await prisma.invoice.findUnique({ where: { id: issuedId } });
    expect(after!.status).toBe('PARTIALLY_PAID');
    expect(after!.voidReason).toBeNull();
  });

  it('T029: void is idempotent on a replayed key', async () => {
    const issuedId = await issuedInvoice();
    const first = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${issuedId}/void`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `idem-${issuedId}`)
      .send({ reason: 'Duplicate void attempt' })
      .expect(200);
    const replay = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${issuedId}/void`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `idem-${issuedId}`)
      .send({ reason: 'Duplicate void attempt' })
      .expect(200);
    expect(replay.body.status).toBe(first.body.status);
    expect(replay.body.voidedAt).toBe(first.body.voidedAt);
  });
});
