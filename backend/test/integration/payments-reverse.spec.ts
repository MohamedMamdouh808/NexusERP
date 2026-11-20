import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuditService } from '../../src/modules/audit/audit.service';
import { createTestApp, loginForCookies, loginAndChangePassword } from '../fixtures/app';
import { getTestPrisma, resetDatabase, seedTestDatabase } from '../fixtures/database';

/**
 * US3: reversing a payment with a compensating record (T047-T049).
 *
 * A reversal never edits the payment: it appends a `payment_reversals` row and
 * the payment, its number, its date and its allocations stay exactly as they
 * were recorded. What changes is what COUNTS: the allocations stay listed but
 * are labelled reversed, and each affected invoice's status is recomputed from
 * its remaining active allocations under ascending-id invoice locks.
 *
 * The reversal, the status restorations, the audit entry and the stored
 * idempotency response commit together or not at all. A second reversal is
 * refused 409; another organization's payment is "not found".
 */
describe('Invoicing US3: reverse a payment', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  let adminCookie: string;
  let adminOrgId: string;
  let adminUserId: string;
  let productId: string;
  let customerId: string;
  let warehouseId: string;
  let recorderCookie: string;
  let readerCookie: string;
  let reverserCookie: string;

  beforeAll(async () => {
    await resetDatabase();
    await seedTestDatabase();

    const { app: testApp } = await createTestApp();
    app = testApp;

    const adminEmail = `admin-rv-${Date.now()}@example.com`;
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: adminEmail, password: 'Password1234' })
      .expect(201);
    adminOrgId = reg.body.organization.id as string;
    adminUserId = reg.body.user.id as string;
    adminCookie = await loginForCookies(app, adminEmail, 'Password1234');

    const category = await request(app.getHttpServer())
      .post('/api/v1/product-categories')
      .set('Cookie', adminCookie)
      .send({ name: 'Reversals' })
      .expect(201);
    const units = await request(app.getHttpServer())
      .get('/api/v1/units-of-measure')
      .set('Cookie', adminCookie)
      .expect(200);
    const unitId = (units.body as Array<{ id: string; name: string }>).find((c) => c.name === 'roll')!.id;
    productId = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({ sku: `SKU-RV-${Date.now()}`, name: 'Reversal bolt', categoryId: category.body.id, unitId, purchasePrice: '1.0000', sellingPrice: '1.2345' })
      .expect(201)
      .then((res) => res.body.id as string);

    const customer = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Cookie', adminCookie)
      .send({ code: 'CUST-RV', name: 'Reversal Customer', email: 'rev@example.com', isCustomer: true })
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
      .set('Idempotency-Key', `rv-stock-${Date.now()}`)
      .send({ warehouseId, productId, quantity: '1000.000', reason: 'COUNT_CORRECTION', note: 'Stock for the reversal suite.' })
      .expect(201);

    // Three members: one may record but not reverse, one may only read, one may only reverse.
    recorderCookie = await memberWithPermissions('Payment recorder', `rv-rec-${Date.now()}`, ['payments.record']);
    readerCookie = await memberWithPermissions('Payment reader', `rv-read-${Date.now()}`, ['payments.read']);
    reverserCookie = await memberWithPermissions('Payment reverser', `rv-rev-${Date.now()}`, ['payments.reverse']);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Creates a member with exactly the given permissions and returns its cookie. */
  async function memberWithPermissions(name: string, key: string, permissionCodes: string[]): Promise<string> {
    const role = await request(app.getHttpServer())
      .post('/api/v1/roles')
      .set('Cookie', adminCookie)
      .send({ name, key, permissionCodes })
      .expect(201);
    const email = `${key}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', adminCookie)
      .send({ email, name, password: 'Password1234', roleIds: [role.body.id] })
      .expect(201);
    return loginAndChangePassword(app, email, 'Password1234');
  }

  /** Creates, ships and issues one invoice of the given unit price. */
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

  /** Records a payment against one invoice. */
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
        reference: 'TXN-REV',
        allocations: [{ invoiceId: invoice.id, amount, expectedBalance: expectedBalance ?? invoice.total }],
      });
  }

  /** Reverses a payment. A fresh key unless the caller supplies one. */
  function reversePayment(
    paymentId: string,
    reason: string,
    cookie: string = adminCookie,
    key: string = `rev-${paymentId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  ): request.Test {
    return request(app.getHttpServer())
      .post(`/api/v1/payments/${paymentId}/reverse`)
      .set('Cookie', cookie)
      .set('Idempotency-Key', key)
      .send({ reason });
  }

  /** The invoice as the API shows it. */
  async function invoiceDetail(id: string): Promise<Record<string, unknown>> {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${id}`)
      .set('Cookie', adminCookie)
      .expect(200);
    return response.body as Record<string, unknown>;
  }

  it('T047: reverses a payment, restores each invoice per its remaining allocations, audits and replays', async () => {
    // 1. A partially paid invoice returns to ISSUED with its full balance.
    const partial = await issuedInvoice('100.0000');
    const payment = await recordPayment(partial, '40.00').expect(201);

    const before = await prisma.payment.findUniqueOrThrow({
      where: { organizationId_id: { organizationId: adminOrgId, id: payment.body.id as string } },
      include: { allocations: { orderBy: { id: 'asc' } } },
    });

    const reversalKey = `rev-partial-${payment.body.id}`;
    const reversed = await reversePayment(payment.body.id as string, 'Customer paid twice', adminCookie, reversalKey).expect(200);

    // The response is the PaymentDetail: derived status, allocation labelled reversed, the reversal block.
    expect(reversed.body.status).toBe('REVERSED');
    expect(reversed.body.number).toBe(payment.body.number);
    expect(reversed.body.amount).toBe('40.00');
    expect(reversed.body.reversal).toEqual(
      expect.objectContaining({ reason: 'Customer paid twice', reversedBy: adminUserId }),
    );
    expect(Number.isNaN(Date.parse(reversed.body.reversal.reversedAt as string))).toBe(false);
    expect(reversed.body.allocations).toHaveLength(1);
    expect(reversed.body.allocations[0]).toEqual(
      expect.objectContaining({ invoiceId: partial.id, amount: '40.00', reversed: true }),
    );
    expect(reversed.body.allocations[0].invoiceNumber).toMatch(/^INV-\d{6}$/);

    // The payment row is untouched: same number, amount, date, reference, recorder, timestamp, allocations.
    const after = await prisma.payment.findUniqueOrThrow({
      where: { organizationId_id: { organizationId: adminOrgId, id: payment.body.id as string } },
      include: { allocations: { orderBy: { id: 'asc' } } },
    });
    expect(after.number).toBe(before.number);
    expect(after.amount.toFixed(2)).toBe(before.amount.toFixed(2));
    expect(after.paymentDate.getTime()).toBe(before.paymentDate.getTime());
    expect(after.reference).toBe(before.reference);
    expect(after.recordedById).toBe(before.recordedById);
    expect(after.recordedAt.getTime()).toBe(before.recordedAt.getTime());
    expect(after.allocations.map((a) => a.id)).toEqual(before.allocations.map((a) => a.id));

    // The compensating row exists.
    const reversal = await prisma.paymentReversal.findUniqueOrThrow({
      where: { organizationId_paymentId: { organizationId: adminOrgId, paymentId: payment.body.id as string } },
    });
    expect(reversal.reason).toBe('Customer paid twice');
    expect(reversal.reversedById).toBe(adminUserId);

    // The invoice is restored to ISSUED with the full balance; the allocation stays visible, labelled reversed.
    const restored = await invoiceDetail(partial.id);
    expect(restored.status).toBe('ISSUED');
    expect(restored.paid).toBe('0.00');
    expect(restored.balance).toBe('100.00');
    expect(restored.paymentsApplied).toEqual([
      expect.objectContaining({ paymentId: payment.body.id, amount: '40.00', reversed: true }),
    ]);

    // The audit entry committed with the reversal.
    const audit = await prisma.auditLog.findFirst({
      where: { organizationId: adminOrgId, action: 'payments.reversed', recordId: payment.body.id as string },
    });
    expect(audit).not.toBeNull();
    expect(audit!.recordType).toBe('payment');
    expect(audit!.before).toEqual(expect.objectContaining({ status: 'RECORDED' }));
    expect(audit!.after).toEqual(expect.objectContaining({ status: 'REVERSED', reason: 'Customer paid twice' }));

    // The same key and body replay the stored response; nothing new is written.
    const replay = await reversePayment(payment.body.id as string, 'Customer paid twice', adminCookie, reversalKey).expect(200);
    expect(replay.body).toEqual(reversed.body);
    expect(
      await prisma.paymentReversal.count({ where: { organizationId: adminOrgId, paymentId: payment.body.id as string } }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({ where: { organizationId: adminOrgId, action: 'payments.reversed', recordId: payment.body.id as string } }),
    ).toBe(1);

    // 2. A PAID invoice returns to ISSUED.
    const paid = await issuedInvoice('50.0000');
    const paidPayment = await recordPayment(paid, '50.00').expect(201);
    expect((await invoiceDetail(paid.id)).status).toBe('PAID');
    await reversePayment(paidPayment.body.id as string, 'Wrong invoice').expect(200);
    const paidRestored = await invoiceDetail(paid.id);
    expect(paidRestored.status).toBe('ISSUED');
    expect(paidRestored.paid).toBe('0.00');
    expect(paidRestored.balance).toBe('50.00');

    // 3. The status follows the REMAINING active allocations, not "always ISSUED".
    const shared = await issuedInvoice('80.0000');
    const firstPayment = await recordPayment(shared, '30.00').expect(201);
    const secondPayment = await recordPayment(shared, '20.00', '50.00').expect(201);
    expect((await invoiceDetail(shared.id)).status).toBe('PARTIALLY_PAID');

    await reversePayment(firstPayment.body.id as string, 'Reversing the first instalment').expect(200);
    const stillPartial = await invoiceDetail(shared.id);
    expect(stillPartial.status).toBe('PARTIALLY_PAID');
    expect(stillPartial.paid).toBe('20.00');
    expect(stillPartial.balance).toBe('60.00');

    await reversePayment(secondPayment.body.id as string, 'Reversing the second instalment').expect(200);
    const fullyRestored = await invoiceDetail(shared.id);
    expect(fullyRestored.status).toBe('ISSUED');
    expect(fullyRestored.paid).toBe('0.00');
    expect(fullyRestored.balance).toBe('80.00');
    expect((fullyRestored.paymentsApplied as Array<{ reversed: boolean }>).every((applied) => applied.reversed)).toBe(true);

    // 4. A payment split across two invoices restores both, with both allocations labelled reversed.
    const firstInvoice = await issuedInvoice('30.0000');
    const secondInvoice = await issuedInvoice('40.0000');
    const split = await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `pay-split-rev-${Date.now()}`)
      .send({
        customerId,
        amount: '25.00',
        paymentDate: '2026-11-14',
        method: 'BANK_TRANSFER',
        reference: 'SPLIT-REV',
        allocations: [
          { invoiceId: firstInvoice.id, amount: '10.00', expectedBalance: firstInvoice.total },
          { invoiceId: secondInvoice.id, amount: '15.00', expectedBalance: secondInvoice.total },
        ],
      })
      .expect(201);
    await reversePayment(split.body.id as string, 'Split payment keyed wrongly').expect(200);
    for (const invoice of [firstInvoice, secondInvoice]) {
      const detail = await invoiceDetail(invoice.id);
      expect(detail.status).toBe('ISSUED');
      expect(detail.paid).toBe('0.00');
    }

    // Five reversals in this test, each with one audit entry.
    expect(
      await prisma.auditLog.count({ where: { organizationId: adminOrgId, action: 'payments.reversed' } }),
    ).toBe(5);
  });

  it('T048: refuses a second reversal, a missing reason, another organization, and callers without payments.reverse', async () => {
    const invoice = await issuedInvoice('100.0000');
    const payment = await recordPayment(invoice, '100.00').expect(201);

    // A member holding payments.reverse - and nothing else - may reverse.
    await reversePayment(payment.body.id as string, 'Recorded on the wrong customer', reverserCookie).expect(200);

    // A second reversal with a NEW key is refused 409; nothing is written.
    await reversePayment(payment.body.id as string, 'Again').expect(409).expect((res) => {
      expect(res.body.code).toBe('INVALID_STATE_TRANSITION');
    });
    expect(
      await prisma.paymentReversal.count({ where: { organizationId: adminOrgId, paymentId: payment.body.id as string } }),
    ).toBe(1);

    // A missing reason, an empty reason and a whitespace-only reason are 400 VALIDATION_ERROR.
    const second = await issuedInvoice('20.0000');
    const secondPayment = await recordPayment(second, '20.00').expect(201);
    for (const body of [{}, { reason: '' }, { reason: '   ' }]) {
      await request(app.getHttpServer())
        .post(`/api/v1/payments/${secondPayment.body.id as string}/reverse`)
        .set('Cookie', adminCookie)
        .set('Idempotency-Key', `rev-bad-reason-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
        .send(body)
        .expect(400)
        .expect((res) => expect(res.body.code).toBe('VALIDATION_ERROR'));
    }

    // A missing Idempotency-Key is refused 400.
    await request(app.getHttpServer())
      .post(`/api/v1/payments/${secondPayment.body.id as string}/reverse`)
      .set('Cookie', adminCookie)
      .send({ reason: 'No key' })
      .expect(400)
      .expect((res) => expect(res.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED'));

    // The same key with a different body is 422 before anything else runs.
    await reversePayment(secondPayment.body.id as string, 'First body', adminCookie, `rev-reused-${secondPayment.body.id}`).expect(200);
    await reversePayment(secondPayment.body.id as string, 'Other body', adminCookie, `rev-reused-${secondPayment.body.id}`)
      .expect(422)
      .expect((res) => expect(res.body.code).toBe('IDEMPOTENCY_KEY_REUSED'));

    // A member holding payments.record only, or payments.read only, is refused 403.
    const third = await issuedInvoice('10.0000');
    const thirdPayment = await recordPayment(third, '10.00').expect(201);
    for (const cookie of [recorderCookie, readerCookie]) {
      await reversePayment(thirdPayment.body.id as string, 'Not allowed', cookie)
        .expect(403)
        .expect((res) => expect(res.body.code).toBe('FORBIDDEN'));
    }
    expect(
      await prisma.paymentReversal.count({ where: { organizationId: adminOrgId, paymentId: thirdPayment.body.id as string } }),
    ).toBe(0);

    // Another organization's payment is "not found", never disclosed.
    const otherEmail = `admin-rv2-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: otherEmail, password: 'Password1234' })
      .expect(201);
    const otherCookie = await loginForCookies(app, otherEmail, 'Password1234');
    await reversePayment(thirdPayment.body.id as string, 'Cross-tenant', otherCookie)
      .expect(404)
      .expect((res) => expect(res.body.code).toBe('NOT_FOUND'));

    // The refusals left the invoice exactly as the payment made it.
    const detail = await invoiceDetail(third.id);
    expect(detail.status).toBe('PAID');
    expect(detail.paid).toBe('10.00');
    expect(detail.balance).toBe('0.00');
  });

  it('T049: a reversal racing a new payment yields one consistent state, and only the affected invoices are restored', async () => {
    const invoice = await issuedInvoice('100.0000');
    const first = await recordPayment(invoice, '40.00').expect(201);

    // One 60.00 payment (the balance the client read) races the reversal of the 40.00 payment.
    const [reversalRes, paymentRes] = await Promise.all([
      reversePayment(first.body.id as string, 'Race reversal'),
      request(app.getHttpServer())
        .post('/api/v1/payments')
        .set('Cookie', adminCookie)
        .set('Idempotency-Key', `pay-race-rev-${invoice.id}`)
        .send({
          customerId,
          amount: '60.00',
          paymentDate: '2026-11-14',
          method: 'CASH',
          reference: 'RACE-REV',
          allocations: [{ invoiceId: invoice.id, amount: '60.00', expectedBalance: '60.00' }],
        }),
    ]);

    // The reversal always succeeds; the payment either lands before it (201) or finds a stale balance (409).
    expect(reversalRes.status).toBe(200);
    expect(reversalRes.body.status).toBe('REVERSED');

    const paymentWon = paymentRes.status === 201;
    if (paymentWon) {
      expect(paymentRes.body.status).toBe('RECORDED');
    } else {
      expect(paymentRes.status).toBe(409);
      expect(paymentRes.body.code).toBe('BALANCE_CHANGED');
    }

    const detail = await invoiceDetail(invoice.id);
    expect(detail.balance).toBe(paymentWon ? '40.00' : '100.00');
    expect(detail.paid).toBe(paymentWon ? '60.00' : '0.00');
    expect(detail.status).toBe(paymentWon ? 'PARTIALLY_PAID' : 'ISSUED');

    // No resurrection of PAID, and never a negative balance anywhere in the organization.
    const rows = await prisma.$queryRawUnsafe<Array<{ status: string; balance: unknown }>>(
      `SELECT i.status, ib.balance
       FROM invoice_balances ib
       JOIN invoices i ON i.id = ib.invoice_id AND i.organization_id = ib.organization_id
       WHERE ib.organization_id = $1::uuid`,
      adminOrgId,
    );
    for (const row of rows) {
      expect(Number(row.balance)).toBeGreaterThanOrEqual(0);
      if (row.status === 'PAID') {
        expect(Number(row.balance)).toBe(0);
      }
    }

    // A reversal of a payment split across several invoices restores only those invoices.
    const a = await issuedInvoice('30.0000');
    const b = await issuedInvoice('40.0000');
    const untouched = await issuedInvoice('50.0000');
    const untouchedPayment = await recordPayment(untouched, '20.00').expect(201);
    const split = await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `pay-t049-split-${Date.now()}`)
      .send({
        customerId,
        amount: '25.00',
        paymentDate: '2026-11-14',
        method: 'CARD',
        allocations: [
          { invoiceId: a.id, amount: '10.00', expectedBalance: a.total },
          { invoiceId: b.id, amount: '15.00', expectedBalance: b.total },
        ],
      })
      .expect(201);
    await reversePayment(split.body.id as string, 'Only these two invoices').expect(200);

    for (const restored of [a, b]) {
      const restoredDetail = await invoiceDetail(restored.id);
      expect(restoredDetail.status).toBe('ISSUED');
      expect(restoredDetail.paid).toBe('0.00');
    }
    const untouchedDetail = await invoiceDetail(untouched.id);
    expect(untouchedDetail.status).toBe('PARTIALLY_PAID');
    expect(untouchedDetail.paid).toBe('20.00');
    expect(untouchedDetail.balance).toBe('30.00');
    expect(
      await prisma.paymentReversal.count({ where: { organizationId: adminOrgId, paymentId: untouchedPayment.body.id as string } }),
    ).toBe(0);
  });

  it('T049: a failure inside the reversal transaction leaves no reversal, no status change, no audit entry and no key record', async () => {
    const invoice = await issuedInvoice('100.0000');
    const payment = await recordPayment(invoice, '100.00').expect(201);
    expect((await invoiceDetail(invoice.id)).status).toBe('PAID');

    const auditsBefore = await prisma.auditLog.count({
      where: { organizationId: adminOrgId, action: 'payments.reversed' },
    });

    const key = `rev-rollback-${payment.body.id}`;
    const { app: failingApp } = await createTestApp([
      {
        token: AuditService,
        useValue: { record: () => Promise.reject(new Error('the audit write failed')) },
      },
    ]);
    try {
      await request(failingApp.getHttpServer())
        .post(`/api/v1/payments/${payment.body.id as string}/reverse`)
        .set('Cookie', adminCookie)
        .set('Idempotency-Key', key)
        .send({ reason: 'This must roll back' })
        .expect(500);
    } finally {
      await failingApp.close();
    }

    // Nothing of the reversal survived.
    expect(
      await prisma.paymentReversal.count({ where: { organizationId: adminOrgId, paymentId: payment.body.id as string } }),
    ).toBe(0);
    const detail = await invoiceDetail(invoice.id);
    expect(detail.status).toBe('PAID');
    expect(detail.paid).toBe('100.00');
    expect(detail.balance).toBe('0.00');
    expect(
      await prisma.auditLog.count({ where: { organizationId: adminOrgId, action: 'payments.reversed' } }),
    ).toBe(auditsBefore);
    expect(
      await prisma.idempotencyKey.count({
        where: { organizationId: adminOrgId, endpoint: `/payments/${payment.body.id as string}/reverse`, key },
      }),
    ).toBe(0);

    // The payment is still RECORDED: the failed attempt left no reversal row.
    const stored = await prisma.paymentReversal.findUnique({
      where: { organizationId_paymentId: { organizationId: adminOrgId, paymentId: payment.body.id as string } },
    });
    expect(stored).toBeNull();
  });
});
