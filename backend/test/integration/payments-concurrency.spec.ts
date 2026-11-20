import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, loginForCookies } from '../fixtures/app';
import { getTestPrisma, resetDatabase, seedTestDatabase } from '../fixtures/database';

/**
 * US2 T039: concurrency control for payment recording and voiding.
 *
 * Two simultaneous payments on one invoice must never over-allocate.
 * A payment racing a void of the same invoice yields exactly one consistent outcome.
 * No invoice ends PAID with a positive balance.
 */
describe('Invoicing US2 T039: payment concurrency', () => {
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

    const adminEmail = `admin-pc-${Date.now()}@example.com`;
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: adminEmail, password: 'Password1234' })
      .expect(201);
    adminOrgId = reg.body.organization.id as string;
    adminCookie = await loginForCookies(app, adminEmail, 'Password1234');

    const category = await request(app.getHttpServer())
      .post('/api/v1/product-categories')
      .set('Cookie', adminCookie)
      .send({ name: 'Concurrency' })
      .expect(201);
    const units = await request(app.getHttpServer())
      .get('/api/v1/units-of-measure')
      .set('Cookie', adminCookie)
      .expect(200);
    const unitId = (units.body as Array<{ id: string; name: string }>).find((c) => c.name === 'roll')!.id;
    productId = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({ sku: `SKU-PC-${Date.now()}`, name: 'Concurrency bolt', categoryId: category.body.id, unitId, purchasePrice: '1.0000', sellingPrice: '1.2345' })
      .expect(201)
      .then((res) => res.body.id as string);

    const customer = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Cookie', adminCookie)
      .send({ code: 'CUST-PC', name: 'Concurrency Customer', email: 'pc@example.com', isCustomer: true })
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
      .set('Idempotency-Key', `pc-stock-${Date.now()}`)
      .send({ warehouseId, productId, quantity: '1000.000', reason: 'COUNT_CORRECTION', note: 'Stock for the concurrency suite.' })
      .expect(201);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function issuedInvoice(unitPrice: string): Promise<{ id: string; total: string }> {
    const created = await request(app.getHttpServer())
      .post('/api/v1/sales-orders')
      .set('Cookie', adminCookie)
      .send({ customerId, warehouseId, orderDate: '2026-11-14', notes: '', lines: [{ productId, quantity: '1.000', unitPrice }] })
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
    return { id: draft.body.id as string, total: draft.body.total as string };
  }

  function recordPayment(invoice: { id: string; total: string }, amount: string, expectedBalance?: string): request.Test {
    return request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `pay-${invoice.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      .send({
        customerId,
        amount,
        paymentDate: '2026-11-14',
        method: 'CASH',
        reference: 'TXN-CONC',
        allocations: [{ invoiceId: invoice.id, amount, expectedBalance: expectedBalance ?? invoice.total }],
      });
  }

  it('T039: two simultaneous payments against one invoice never over-allocate', async () => {
    const invoice = await issuedInvoice('100.0000');

    // Fire two 60.00 payments at the same 100.00 invoice concurrently.
    const [a, b] = await Promise.all([
      recordPayment(invoice, '60.00').expect((res) => {
        if (res.status === 201) {
          expect(res.body.number).toMatch(/^PAY-\d{6}$/);
          expect(res.body.status).toBe('RECORDED');
        }
      }),
      recordPayment(invoice, '60.00').expect((res) => {
        if (res.status === 201) {
          expect(res.body.number).toMatch(/^PAY-\d{6}$/);
          expect(res.body.status).toBe('RECORDED');
        }
      }),
    ]);

    // Exactly one succeeds, one is refused 409 BALANCE_CHANGED.
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);

    const refused = a.status === 409 ? a : b;
    expect(refused.body.code).toBe('BALANCE_CHANGED');
    expect(refused.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ invoiceId: invoice.id, currentBalance: '40.00' }),
      ]),
    );

    // The winner paid 60.00; the invoice balance is 40.00; never 120.00 allocated.
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${invoice.id}`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(detail.body.paid).toBe('60.00');
    expect(detail.body.balance).toBe('40.00');
    expect(detail.body.status).toBe('PARTIALLY_PAID');

    // The view also reflects it.
    const viewRow = await prisma.$queryRawUnsafe<Array<{ balance: unknown; allocated: unknown }>>(
      `SELECT balance, allocated FROM invoice_balances WHERE invoice_id = $1::uuid AND organization_id = $2::uuid`,
      invoice.id,
      adminOrgId,
    );
    expect(Number(viewRow[0]!.balance).toFixed(2)).toBe('40.00');
    expect(Number(viewRow[0]!.allocated).toFixed(2)).toBe('60.00');
  });

  it('T039: a payment racing a void of the same invoice yields exactly one consistent outcome', async () => {
    const invoice = await issuedInvoice('100.0000');

    // Fire: a full payment (100.00) and a void request concurrently.
    const paymentPromise = request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `pay-race-${invoice.id}`)
      .send({
        customerId,
        amount: '100.00',
        paymentDate: '2026-11-14',
        method: 'CARD',
        reference: 'RACE-PAY',
        allocations: [{ invoiceId: invoice.id, amount: '100.00', expectedBalance: '100.00' }],
      });

    const voidPromise = request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoice.id}/void`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `void-race-${invoice.id}`)
      .send({ reason: 'Concurrency test' });

    const [payRes, voidRes] = await Promise.all([paymentPromise, voidPromise]);

    // Exactly one returns a success status (2xx).
    const voidSuccess = voidRes.status >= 200 && voidRes.status < 300;
    const paySuccess = payRes.status >= 200 && payRes.status < 300;
    expect(paySuccess !== voidSuccess).toBe(true); // exactly one

    if (paySuccess) {
      // Payment won: it is RECORDED, invoice PAID, void refused 409 INVOICE_HAS_PAYMENTS.
      expect(payRes.body.status).toBe('RECORDED');
      expect(voidRes.body.code).toBe('INVOICE_HAS_PAYMENTS');

      const detail = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoice.id}`)
        .set('Cookie', adminCookie)
        .expect(200);
      expect(detail.body.status).toBe('PAID');
      expect(detail.body.balance).toBe('0.00');
      expect(detail.body.paid).toBe('100.00');
    } else {
      // Void won: invoice VOID, payment refused 409 INVALID_STATE_TRANSITION.
      expect(voidRes.body.status).toBe('VOID');
      expect(payRes.body.code).toBe('INVALID_STATE_TRANSITION');

      const detail = await request(app.getHttpServer())
        .get(`/api/v1/invoices/${invoice.id}`)
        .set('Cookie', adminCookie)
        .expect(200);
      expect(detail.body.status).toBe('VOID');
      // A voided invoice has no active allocations; paid remains 0.
      expect(detail.body.paid).toBe('0.00');
    }

    // In neither case is there an over-allocation or a PAID invoice with positive balance.
    const payments = await prisma.payment.findMany({ where: { organizationId: adminOrgId, reference: { in: ['RACE-PAY'] } } });
    expect(payments.length).toBeLessThanOrEqual(1);
    if (payments.length === 1) {
      // The status is derived, not stored: RECORDED means no reversal row.
      const reversal = await prisma.paymentReversal.findUnique({
        where: { organizationId_paymentId: { organizationId: adminOrgId, paymentId: payments[0]!.id } },
      });
      expect(reversal).toBeNull();
    }
  });

  it('T039: no invoice in the organization ends PAID with a positive balance', async () => {
    // This assertion covers the whole test schema state after the concurrency runs.
    const rows = await prisma.$queryRawUnsafe<Array<{ invoice_id: string; status: string; balance: string; allocated: string; total: string }>>(
      `SELECT ib.invoice_id, i.status, ib.balance, ib.allocated, ib.total
       FROM invoice_balances ib
       JOIN invoices i ON i.id = ib.invoice_id AND i.organization_id = ib.organization_id
       WHERE ib.organization_id = $1::uuid`,
      adminOrgId,
    );

    for (const row of rows) {
      // paid = allocated; balance = total - allocated (never negative)
      const allocated = Number(row.allocated);
      const total = Number(row.total);
      const balance = Number(row.balance);
      expect(allocated).toBeLessThanOrEqual(total + 1e-9); // numeric tolerance
      expect(balance).toBeGreaterThanOrEqual(-1e-9);
      // If status is PAID, balance must be exactly zero.
      if (row.status === 'PAID') {
        expect(balance).toBe(0);
      }
    }
  });
});