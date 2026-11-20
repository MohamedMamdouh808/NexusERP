import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuditService } from '../../src/modules/audit/audit.service';
import { createTestApp, loginForCookies, loginAndChangePassword } from '../fixtures/app';
import { getTestPrisma, resetDatabase, seedTestDatabase } from '../fixtures/database';

/**
 * US2: recording a payment with allocations (T036-T038, T040-T042).
 *
 * One transaction per posting: PAY- number at creation, allocations within
 * balance under ascending-id invoice locks, the exact-sum rule, status moves
 * to PARTIALLY_PAID or PAID, the audit entry, and the idempotency response
 * commit together or not at all. Stale reads answer 409 BALANCE_CHANGED with
 * the current balance; over-allocation answers 400 OVER_ALLOCATION.
 */
describe('Invoicing US2: record a payment with allocations', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  let adminCookie: string;
  let adminOrgId: string;
  let productId: string;
  let customerId: string;
  let warehouseId: string;
  let recorderCookie: string;
  let readerCookie: string;

  beforeAll(async () => {
    await resetDatabase();
    await seedTestDatabase();

    const { app: testApp } = await createTestApp();
    app = testApp;

    const adminEmail = `admin-pr-${Date.now()}@example.com`;
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: adminEmail, password: 'Password1234' })
      .expect(201);
    adminOrgId = reg.body.organization.id as string;
    adminCookie = await loginForCookies(app, adminEmail, 'Password1234');

    const category = await request(app.getHttpServer())
      .post('/api/v1/product-categories')
      .set('Cookie', adminCookie)
      .send({ name: 'Payments' })
      .expect(201);
    const units = await request(app.getHttpServer())
      .get('/api/v1/units-of-measure')
      .set('Cookie', adminCookie)
      .expect(200);
    const unitId = (units.body as Array<{ id: string; name: string }>).find((c) => c.name === 'roll')!.id;
    productId = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({ sku: `SKU-PR-${Date.now()}`, name: 'Payment bolt', categoryId: category.body.id, unitId, purchasePrice: '1.0000', sellingPrice: '1.2345' })
      .expect(201)
      .then((res) => res.body.id as string);

    const customer = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Cookie', adminCookie)
      .send({ code: 'CUST-PR', name: 'Payment Customer', email: 'pay@example.com', isCustomer: true })
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
      .set('Idempotency-Key', `pr-stock-${Date.now()}`)
      .send({ warehouseId, productId, quantity: '1000.000', reason: 'COUNT_CORRECTION', note: 'Stock for the payments suite.' })
      .expect(201);

    // A member holding payments.record only, and one holding payments.read only.
    const recorderRole = await request(app.getHttpServer())
      .post('/api/v1/roles')
      .set('Cookie', adminCookie)
      .send({ name: 'Payment recorder', key: `pay-rec-${Date.now()}`, permissionCodes: ['payments.record'] })
      .expect(201);
    const recorderEmail = `prr-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', adminCookie)
      .send({ email: recorderEmail, name: 'Payment Recorder', password: 'Password1234', roleIds: [recorderRole.body.id] })
      .expect(201);
    recorderCookie = await loginAndChangePassword(app, recorderEmail, 'Password1234');

    const readerRole = await request(app.getHttpServer())
      .post('/api/v1/roles')
      .set('Cookie', adminCookie)
      .send({ name: 'Payment reader', key: `pay-read-${Date.now()}`, permissionCodes: ['payments.read'] })
      .expect(201);
    const readerEmail = `prd-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', adminCookie)
      .send({ email: readerEmail, name: 'Payment Reader', password: 'Password1234', roleIds: [readerRole.body.id] })
      .expect(201);
    readerCookie = await loginAndChangePassword(app, readerEmail, 'Password1234');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Creates, issues and returns one invoice of the given unit price. */
  async function issuedInvoice(unitPrice: string, forCustomerId?: string): Promise<{ id: string; total: string }> {
    const created = await request(app.getHttpServer())
      .post('/api/v1/sales-orders')
      .set('Cookie', adminCookie)
      .send({ customerId: forCustomerId ?? customerId, warehouseId, orderDate: '2026-11-14', notes: '', lines: [{ productId, quantity: '1.000', unitPrice }] })
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

  /** Creates a DRAFT invoice (no issue step) of the given unit price. */
  async function draftInvoice(unitPrice: string): Promise<{ id: string; total: string }> {
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
    return { id: draft.body.id as string, total: draft.body.total as string };
  }

  /** Records a payment against one invoice, returning the response. */
  function recordPayment(invoice: { id: string; total: string }, amount: string, expectedBalance?: string): request.Test {
    return request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `pay-${invoice.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      .send({
        customerId,
        amount,
        paymentDate: '2026-11-14',
        method: 'CARD',
        reference: 'TXN-123',
        allocations: [{ invoiceId: invoice.id, amount, expectedBalance: expectedBalance ?? invoice.total }],
      });
  }
  it('T036: records the payment, allocates it, moves the invoices and audits (0.10+0.20=0.30 and 128.45-100.00-28.45=0.00)', async () => {
    // The exact-sum vectors: 0.10 + 0.20 = 0.30, and 128.45 - (100.00, 28.45) = 0.00.
    const small = await issuedInvoice('0.1000');
    const medium = await issuedInvoice('0.2000');
    const large = await issuedInvoice('128.4500');

    // One payment split across two invoices; both reach PAID at exactly zero.
    const first = await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `pay-split-${Date.now()}`)
      .send({
        customerId,
        amount: '0.30',
        paymentDate: '2026-11-14',
        method: 'BANK_TRANSFER',
        reference: 'WIRE-1',
        allocations: [
          { invoiceId: small.id, amount: '0.10', expectedBalance: small.total },
          { invoiceId: medium.id, amount: '0.20', expectedBalance: medium.total },
        ],
      })
      .expect(201);
    expect(first.body.number).toMatch(/^PAY-\d{6}$/);
    expect(first.body.status).toBe('RECORDED');
    expect(first.body.amount).toBe('0.30');
    expect(first.body.allocations).toHaveLength(2);
    expect(first.body.allocations.map((a: { invoiceId: string }) => a.invoiceId)).toEqual(
      expect.arrayContaining([small.id, medium.id]),
    );

    const smallDetail = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${small.id}`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(smallDetail.body.status).toBe('PAID');
    expect(smallDetail.body.paid).toBe('0.10');
    expect(smallDetail.body.balance).toBe('0.00');

    // A partial payment leaves PARTIALLY_PAID with the exact remainder.
    const partial = await recordPayment(large, '100.00').expect(201);
    expect(partial.body.number).toMatch(/^PAY-\d{6}$/);
    const partialDetail = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${large.id}`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(partialDetail.body.status).toBe('PARTIALLY_PAID');
    expect(partialDetail.body.paid).toBe('100.00');
    expect(partialDetail.body.balance).toBe('28.45');

    // The remainder pays it off exactly: PAID at zero.
    await recordPayment(large, '28.45', '28.45').expect(201);
    const paidDetail = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${large.id}`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(paidDetail.body.status).toBe('PAID');
    expect(paidDetail.body.paid).toBe('128.45');
    expect(paidDetail.body.balance).toBe('0.00');

    // The audit entries committed with the postings.
    const audits = await prisma.auditLog.findMany({
      where: { organizationId: adminOrgId, action: 'payments.recorded', recordType: 'payment' },
    });
    expect(audits.length).toBe(3);
  });

  it('T037: refuses over-allocation, non-exact sums, a duplicate invoice, unusable invoices, bad amount/date/method', async () => {
    const invoice = await issuedInvoice('128.4500');
    const voidedInvoice = await issuedInvoice('50.0000');
    await request(app.getHttpServer())
      .post(`/api/v1/invoices/${voidedInvoice.id}/void`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `void-${voidedInvoice.id}`)
      .send({ reason: 'Voided before payment' })
      .expect(200);

    // Allocation above the recomputed balance, with the expected balance matching: 400 OVER_ALLOCATION.
    await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `pay-over-${Date.now()}`)
      .send({
        customerId,
        amount: '200.00',
        paymentDate: '2026-11-14',
        method: 'CASH',
        allocations: [{ invoiceId: invoice.id, amount: '200.00', expectedBalance: '128.45' }],
      })
      .expect(400)
      .expect((res) => expect(res.body.code).toBe('OVER_ALLOCATION'))
      .expect((res) => expect(res.body.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'allocations' })])));

    // Allocations not summing exactly to the amount: 400 VALIDATION_ERROR.
    await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `pay-sum-${Date.now()}`)
      .send({
        customerId,
        amount: '128.45',
        paymentDate: '2026-11-14',
        method: 'CASH',
        allocations: [
          { invoiceId: invoice.id, amount: '100.00', expectedBalance: '128.45' },
          { invoiceId: invoice.id, amount: '28.44', expectedBalance: '128.45' },
        ],
      })
      .expect(400)
      .expect((res) => expect(res.body.code).toBe('VALIDATION_ERROR'));

    // The same invoice twice in one payment: 400 VALIDATION_ERROR.
    await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `pay-dup-${Date.now()}`)
      .send({
        customerId,
        amount: '200.00',
        paymentDate: '2026-11-14',
        method: 'CASH',
        allocations: [
          { invoiceId: invoice.id, amount: '100.00', expectedBalance: '128.45' },
          { invoiceId: invoice.id, amount: '100.00', expectedBalance: '128.45' },
        ],
      })
      .expect(400)
      .expect((res) => expect(res.body.code).toBe('VALIDATION_ERROR'));

    // A DRAFT invoice, a VOID invoice and a PAID invoice: 409.
    const draft = await draftInvoice('10.0000');
    for (const target of [draft.id, voidedInvoice.id]) {
      await request(app.getHttpServer())
        .post('/api/v1/payments')
        .set('Cookie', adminCookie)
        .set('Idempotency-Key', `pay-state-${Date.now()}-${target}`)
        .send({
          customerId,
          amount: '10.00',
          paymentDate: '2026-11-14',
          method: 'CASH',
          allocations: [{ invoiceId: target, amount: '10.00', expectedBalance: '10.00' }],
        })
        .expect(409)
        .expect((res) => expect(res.body.code).toBe('INVALID_STATE_TRANSITION'));
    }
    const paid = await issuedInvoice('20.0000');
    await recordPayment(paid, '20.00').expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `pay-paid-${Date.now()}`)
      .send({
        customerId,
        amount: '20.00',
        paymentDate: '2026-11-14',
        method: 'CASH',
        allocations: [{ invoiceId: paid.id, amount: '20.00', expectedBalance: '0.00' }],
      })
      .expect(409)
      .expect((res) => expect(res.body.code).toBe('INVALID_STATE_TRANSITION'));

    // Another customer's invoice: 409.
    const otherCustomer = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Cookie', adminCookie)
      .send({ code: 'CUST-PR2', name: 'Other Customer', email: 'pay2@example.com', isCustomer: true })
      .expect(201);
    const otherInvoice = await issuedInvoice('30.0000', otherCustomer.body.id as string);
    await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `pay-cust-${Date.now()}`)
      .send({
        customerId,
        amount: '30.00',
        paymentDate: '2026-11-14',
        method: 'CASH',
        allocations: [{ invoiceId: otherInvoice.id, amount: '30.00', expectedBalance: '30.00' }],
      })
      .expect(409)
      .expect((res) => expect(res.body.code).toBe('INVALID_STATE_TRANSITION'));

    // amount <= 0, a future payment date, and a method outside the enum: 400.
    await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `pay-amt-${Date.now()}`)
      .send({
        customerId,
        amount: '0.00',
        paymentDate: '2026-11-14',
        method: 'CASH',
        allocations: [{ invoiceId: invoice.id, amount: '0.00', expectedBalance: '128.45' }],
      })
      .expect(400)
      .expect((res) => expect(res.body.code).toBe('VALIDATION_ERROR'));
    await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `pay-date-${Date.now()}`)
      .send({
        customerId,
        amount: '10.00',
        paymentDate: '2030-01-01',
        method: 'CASH',
        allocations: [{ invoiceId: invoice.id, amount: '10.00', expectedBalance: '128.45' }],
      })
      .expect(400)
      .expect((res) => expect(res.body.code).toBe('VALIDATION_ERROR'));
    await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `pay-method-${Date.now()}`)
      .send({
        customerId,
        amount: '10.00',
        paymentDate: '2026-11-14',
        method: 'CHEQUE',
        allocations: [{ invoiceId: invoice.id, amount: '10.00', expectedBalance: '128.45' }],
      })
      .expect(400)
      .expect((res) => expect(res.body.code).toBe('VALIDATION_ERROR'));

    // Nothing was written by any of the refusals: the invoice keeps its balance.
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${invoice.id}`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(detail.body.balance).toBe('128.45');
    expect(detail.body.status).toBe('ISSUED');
  });

  it('T038: a stale expected balance is refused 409 BALANCE_CHANGED naming the invoice and its current balance', async () => {
    const invoice = await issuedInvoice('100.0000');

    // Another payment lands first: the balance the client read is now stale.
    await recordPayment(invoice, '20.00').expect(201);

    const stale = await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `pay-stale-${Date.now()}`)
      .send({
        customerId,
        amount: '50.00',
        paymentDate: '2026-11-14',
        method: 'CASH',
        reference: 'STALE',
        allocations: [{ invoiceId: invoice.id, amount: '50.00', expectedBalance: '100.00' }],
      })
      .expect(409)
      .expect((res) => expect(res.body.code).toBe('BALANCE_CHANGED'));
    expect(stale.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ invoiceId: invoice.id, currentBalance: '80.00' }),
      ]),
    );

    // Nothing was written by the refused payment.
    const payments = await prisma.payment.findMany({ where: { organizationId: adminOrgId, reference: 'STALE' } });
    expect(payments).toHaveLength(0);
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${invoice.id}`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(detail.body.balance).toBe('80.00');
    expect(detail.body.status).toBe('PARTIALLY_PAID');
  });
  it('T040: idempotency - the same key and body replay the stored response, a different body is refused 422, a missing key is refused 400', async () => {
    const invoice = await issuedInvoice('100.0000');
    const body = {
      customerId,
      amount: '100.00',
      paymentDate: '2026-11-14',
      method: 'BANK_TRANSFER',
      reference: 'IDEM-1',
      allocations: [{ invoiceId: invoice.id, amount: '100.00', expectedBalance: '100.00' }],
    };

    const first = await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `idem-pay-${invoice.id}`)
      .send(body)
      .expect(201);
    expect(first.body.number).toMatch(/^PAY-\d{6}$/);
    expect(first.body.status).toBe('RECORDED');

    const replay = await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `idem-pay-${invoice.id}`)
      .send(body)
      .expect(201);
    expect(replay.body.number).toBe(first.body.number);

    // One posting only: the replay wrote nothing.
    expect(await prisma.payment.count({
      where: { organizationId: adminOrgId, reference: 'IDEM-1' },
    })).toBe(1);

    await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `idem-pay-${invoice.id}`)
      .send({ ...body, amount: '99.00' })
      .expect(422)
      .expect((res) => expect(res.body.code).toBe('IDEMPOTENCY_KEY_REUSED'));

    await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .send(body)
      .expect(400)
      .expect((res) => expect(res.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED'));

    // The invoice reflects exactly one payment, even after the replay.
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${invoice.id}`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(detail.body.paid).toBe('100.00');
    expect(detail.body.balance).toBe('0.00');
    expect(detail.body.status).toBe('PAID');
  });

  it('T041: a failure inside the posting transaction leaves no payment, no allocation, no status change, no audit entry and no key record', async () => {
    const invoice = await issuedInvoice('100.0000');
    const auditsBefore = await prisma.auditLog.count({
      where: { organizationId: adminOrgId, action: 'payments.recorded' },
    });

    const { app: failingApp } = await createTestApp([
      {
        token: AuditService,
        useValue: { record: () => Promise.reject(new Error('the audit write failed')) },
      },
    ]);
    try {
      await request(failingApp.getHttpServer())
        .post('/api/v1/payments')
        .set('Cookie', adminCookie)
        .set('Idempotency-Key', `rollback-${invoice.id}`)
        .send({
          customerId,
          amount: '100.00',
          paymentDate: '2026-11-14',
          method: 'CASH',
          reference: 'ROLLBACK-1',
          allocations: [{ invoiceId: invoice.id, amount: '100.00', expectedBalance: '100.00' }],
        })
        .expect(500);
    } finally {
      await failingApp.close();
    }

    expect(await prisma.payment.count({
      where: { organizationId: adminOrgId, reference: 'ROLLBACK-1' },
    })).toBe(0);
    expect(await prisma.paymentAllocation.count({ where: { invoiceId: invoice.id } })).toBe(0);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${invoice.id}`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(detail.body.status).toBe('ISSUED');
    expect(detail.body.balance).toBe('100.00');

    expect(await prisma.auditLog.count({
      where: { organizationId: adminOrgId, action: 'payments.recorded' },
    })).toBe(auditsBefore);

    expect(await prisma.idempotencyKey.count({
      where: { organizationId: adminOrgId, endpoint: '/payments', key: `rollback-${invoice.id}` },
    })).toBe(0);
  });

  it('T042: recording needs payments.record, and another organization is refused with 404', async () => {
    // The recorder member, holding payments.record only, records a payment.
    const invoice = await issuedInvoice('60.0000');
    await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Cookie', recorderCookie)
      .set('Idempotency-Key', `pay-rec-${invoice.id}`)
      .send({
        customerId,
        amount: '60.00',
        paymentDate: '2026-11-14',
        method: 'CASH',
        reference: 'RECORDER-1',
        allocations: [{ invoiceId: invoice.id, amount: '60.00', expectedBalance: '60.00' }],
      })
      .expect(201);

    // The reader member, holding payments.read only, is refused.
    await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Cookie', readerCookie)
      .set('Idempotency-Key', `pay-read-${invoice.id}`)
      .send({
        customerId,
        amount: '10.00',
        paymentDate: '2026-11-14',
        method: 'CASH',
        allocations: [{ invoiceId: invoice.id, amount: '10.00', expectedBalance: '0.00' }],
      })
      .expect(403)
      .expect((res) => expect(res.body.code).toBe('FORBIDDEN'));

    // Another organization cannot allocate against this organization's invoice.
    const otherEmail = `admin-pr2-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: otherEmail, password: 'Password1234' })
      .expect(201);
    const otherCookie = await loginForCookies(app, otherEmail, 'Password1234');
    const otherCustomer = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Cookie', otherCookie)
      .send({ code: `CUST-PR2-${Date.now()}`, name: 'Other Org Customer', email: 'pr2@example.com', isCustomer: true })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Cookie', otherCookie)
      .set('Idempotency-Key', `pay-other-${invoice.id}`)
      .send({
        customerId: otherCustomer.body.id as string,
        amount: '60.00',
        paymentDate: '2026-11-14',
        method: 'CASH',
        allocations: [{ invoiceId: invoice.id, amount: '60.00', expectedBalance: '60.00' }],
      })
      .expect(404)
      .expect((res) => expect(res.body.code).toBe('NOT_FOUND'));
  });
});

