import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, loginForCookies } from '../fixtures/app';
import { getTestPrisma, resetDatabase, seedTestDatabase } from '../fixtures/database';

// The suite builds several invoices and payments end-to-end against the hosted
// database; the setup alone can outlast Jest's default hook budget.
jest.setTimeout(300_000);

/**
 * US4: browsing payments (T057-T058).
 *
 * The payment list has no stored status: `RECORDED`/`REVERSED` is derived from
 * the presence of a `payment_reversals` row in ONE left join, so the derived
 * status filter, the rows and the total can never disagree. The method filter
 * is independent of the status filter, and search matches the number or the
 * customer name.
 *
 * The date range bounds `payment_date` inclusively; an end before the start is
 * a mistaken request (400 naming the date field), not an empty result.
 */
describe('Invoicing US4: browse payments', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  let adminCookie: string;
  let adminUserId: string;
  let productId: string;
  let warehouseId: string;
  let payOneCustomerId: string;
  let payTwoCustomerId: string;

  let paymentA: { id: string; number: string };
  let paymentB: { id: string; number: string };
  let paymentC: { id: string; number: string };
  let paymentD: { id: string; number: string };

  beforeAll(async () => {
    await resetDatabase();
    await seedTestDatabase();

    const { app: testApp } = await createTestApp();
    app = testApp;

    const adminEmail = `admin-pb-${Date.now()}@example.com`;
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: adminEmail, password: 'Password1234' })
      .expect(201);
    adminUserId = reg.body.user.id as string;
    adminCookie = await loginForCookies(app, adminEmail, 'Password1234');

    const category = await request(app.getHttpServer())
      .post('/api/v1/product-categories')
      .set('Cookie', adminCookie)
      .send({ name: 'Payment browsing' })
      .expect(201);
    const units = await request(app.getHttpServer())
      .get('/api/v1/units-of-measure')
      .set('Cookie', adminCookie)
      .expect(200);
    const unitId = (units.body as Array<{ id: string; name: string }>).find((c) => c.name === 'roll')!.id;
    productId = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({ sku: `SKU-PB-${Date.now()}`, name: 'Payment browsing bolt', categoryId: category.body.id, unitId, purchasePrice: '1.0000', sellingPrice: '1.2345' })
      .expect(201)
      .then((res) => res.body.id as string);

    const warehouses = await request(app.getHttpServer())
      .get('/api/v1/warehouses')
      .set('Cookie', adminCookie)
      .expect(200);
    warehouseId = (warehouses.body.items as Array<{ id: string; isDefault: boolean }>).find((w) => w.isDefault)!.id;

    await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `pb-stock-${Date.now()}`)
      .send({ warehouseId, productId, quantity: '1000.000', reason: 'COUNT_CORRECTION', note: 'Stock for the payments browsing suite.' })
      .expect(201);

    payOneCustomerId = await createCustomer('Pay One', 'CUST-PAY-1');
    payTwoCustomerId = await createCustomer('Pay Two', 'CUST-PAY-2');

    // Four payments across two dates and three methods, one of them reversed.
    paymentA = await pay(payOneCustomerId, '10.00', '2026-11-10', 'CASH', 'PAY-A');
    paymentB = await pay(payTwoCustomerId, '20.00', '2026-11-12', 'CASH', 'PAY-B');
    paymentC = await pay(payTwoCustomerId, '30.00', '2026-11-14', 'CARD', 'PAY-C');
    paymentD = await pay(payOneCustomerId, '5.00', '2026-11-11', 'BANK_TRANSFER', 'PAY-D');

    await request(app.getHttpServer())
      .post(`/api/v1/payments/${paymentB.id}/reverse`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `rev-pb-${paymentB.id}`)
      .send({ reason: 'Recorded on the wrong customer' })
      .expect(200);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Creates a customer and returns its id. */
  async function createCustomer(name: string, code: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Cookie', adminCookie)
      .send({ code, name, email: `${code.toLowerCase()}@example.com`, isCustomer: true })
      .expect(201);
    return response.body.id as string;
  }

  /** Creates, ships and issues one 100.00 invoice for the customer. */
  async function issuedInvoice(customerId: string): Promise<string> {
    const created = await request(app.getHttpServer())
      .post('/api/v1/sales-orders')
      .set('Cookie', adminCookie)
      .send({ customerId, warehouseId, orderDate: '2026-11-14', notes: '', lines: [{ productId, quantity: '1.000', unitPrice: '100.0000' }] })
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
    const issued = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${draft.body.id}/issue`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `issue-${draft.body.id}`)
      .send({})
      .expect(200);
    return issued.body.id as string;
  }

  /** Records one payment against a fresh invoice and returns its id and number. */
  async function pay(
    customerId: string,
    amount: string,
    paymentDate: string,
    method: string,
    reference: string,
  ): Promise<{ id: string; number: string }> {
    const invoiceId = await issuedInvoice(customerId);
    const response = await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `pay-pb-${reference}-${Date.now()}`)
      .send({
        customerId,
        amount,
        paymentDate,
        method,
        reference,
        allocations: [{ invoiceId, amount, expectedBalance: '100.00' }],
      })
      .expect(201);
    return { id: response.body.id as string, number: response.body.number as string };
  }

  /** GET /payments with the given query. */
  function listPayments(query: Record<string, string | number>): request.Test {
    return request(app.getHttpServer()).get('/api/v1/payments').query(query).set('Cookie', adminCookie);
  }

  it('T057: searches, filters by derived status and method, bounds the date range, and pages one selection', async () => {
    // Search matches the payment number and the customer name.
    const byNumber = await listPayments({ search: paymentB.number, page: 1, pageSize: 100 }).expect(200);
    expect(byNumber.body.total).toBe(1);
    expect(byNumber.body.items[0].id).toBe(paymentB.id);
    const byCustomer = await listPayments({ search: 'Pay One', page: 1, pageSize: 100 }).expect(200);
    expect(byCustomer.body.total).toBe(2);
    expect(byCustomer.body.items.map((row: { id: string }) => row.id).sort()).toEqual([paymentA.id, paymentD.id].sort());

    // An inverted range is refused, naming the date field.
    await listPayments({ dateFrom: '2026-11-12', dateTo: '2026-11-10' })
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(res.body.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'dateTo' })]));
      });

    // Both ends are inclusive.
    const window = await listPayments({ dateFrom: '2026-11-10', dateTo: '2026-11-12', page: 1, pageSize: 100 }).expect(200);
    expect(window.body.total).toBe(3);
    expect(window.body.items.map((row: { id: string }) => row.id).sort()).toEqual([paymentA.id, paymentB.id, paymentD.id].sort());

    // The derived status filter: active is RECORDED, reversed is REVERSED, all is the default.
    const active = await listPayments({ status: 'active', page: 1, pageSize: 100 }).expect(200);
    expect(active.body.total).toBe(3);
    expect(active.body.items.every((row: { status: string; reversedAt: string | null }) => row.status === 'RECORDED' && row.reversedAt === null)).toBe(true);
    const reversed = await listPayments({ status: 'reversed', page: 1, pageSize: 100 }).expect(200);
    expect(reversed.body.total).toBe(1);
    expect(reversed.body.items[0].id).toBe(paymentB.id);
    expect(reversed.body.items[0].status).toBe('REVERSED');
    expect(reversed.body.items[0].reversedAt).toEqual(expect.any(String));
    const all = await listPayments({ status: 'all', page: 1, pageSize: 100 }).expect(200);
    expect(all.body.total).toBe(4);
    const defaulted = await listPayments({ page: 1, pageSize: 100 }).expect(200);
    expect(defaulted.body.total).toBe(4);

    // The method filter is independent of the status filter and combines with it.
    const cashActive = await listPayments({ method: 'CASH', status: 'active', page: 1, pageSize: 100 }).expect(200);
    expect(cashActive.body.items.map((row: { id: string }) => row.id)).toEqual([paymentA.id]);
    const cashAll = await listPayments({ method: 'CASH', status: 'all', page: 1, pageSize: 100 }).expect(200);
    expect(cashAll.body.items.map((row: { id: string }) => row.id).sort()).toEqual([paymentA.id, paymentB.id].sort());
    const cardReversed = await listPayments({ method: 'CARD', status: 'reversed', page: 1, pageSize: 100 }).expect(200);
    expect(cardReversed.body.total).toBe(0);

    // The rows, the derived status and the total come from one selection across pages.
    const firstPage = await listPayments({ status: 'all', page: 1, pageSize: 1 }).expect(200);
    expect(firstPage.body.total).toBe(4);
    const seen: string[] = [];
    for (let page = 1; page <= firstPage.body.total; page += 1) {
      const response = await listPayments({ status: 'all', page, pageSize: 1 }).expect(200);
      expect(response.body.total).toBe(4);
      expect(response.body.items).toHaveLength(1);
      seen.push(response.body.items[0].id as string);
    }
    expect(seen).toEqual([paymentC.id, paymentB.id, paymentD.id, paymentA.id]);

    // Default sort is paymentDate desc, with id ascending as the tie-break.
    expect(all.body.items.map((row: { id: string }) => row.id)).toEqual([paymentC.id, paymentB.id, paymentD.id, paymentA.id]);

    // Unknown sort keys and methods are refused, naming the field.
    await listPayments({ sortBy: 'amount', page: 1, pageSize: 25 })
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(res.body.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'sortBy' })]));
      });
    await listPayments({ method: 'CHEQUE', page: 1, pageSize: 25 }).expect(400);
  });

  it('T058: the payment detail carries the computed status, the allocations and the reversal block', async () => {
    const active = await request(app.getHttpServer())
      .get(`/api/v1/payments/${paymentA.id}`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(active.body).toEqual(
      expect.objectContaining({
        id: paymentA.id,
        number: paymentA.number,
        customerId: payOneCustomerId,
        customerName: 'Pay One',
        amount: '10.00',
        paymentDate: '2026-11-10',
        method: 'CASH',
        reference: 'PAY-A',
        status: 'RECORDED',
        reversal: null,
        recordedBy: adminUserId,
      }),
    );
    expect(Number.isNaN(Date.parse(active.body.recordedAt as string))).toBe(false);
    expect(active.body.allocations).toHaveLength(1);
    expect(active.body.allocations[0]).toEqual(
      expect.objectContaining({
        invoiceId: expect.any(String),
        invoiceNumber: expect.stringMatching(/^INV-\d{6}$/),
        amount: '10.00',
        reversed: false,
      }),
    );

    const reversed = await request(app.getHttpServer())
      .get(`/api/v1/payments/${paymentB.id}`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(reversed.body.status).toBe('REVERSED');
    expect(reversed.body.allocations[0].reversed).toBe(true);
    expect(reversed.body.reversal).toEqual(
      expect.objectContaining({
        reason: 'Recorded on the wrong customer',
        reversedBy: adminUserId,
      }),
    );
    expect(Number.isNaN(Date.parse(reversed.body.reversal.reversedAt as string))).toBe(false);

    // A payment of another organization, or one that does not exist, is not found.
    await request(app.getHttpServer())
      .get('/api/v1/payments/00000000-0000-4000-8000-000000000000')
      .set('Cookie', adminCookie)
      .expect(404)
      .expect((res) => expect(res.body.code).toBe('NOT_FOUND'));
  });
});
