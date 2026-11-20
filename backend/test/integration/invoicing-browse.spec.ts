import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, loginForCookies } from '../fixtures/app';
import { getTestPrisma, resetDatabase, seedTestDatabase } from '../fixtures/database';

// The suite builds several invoices end-to-end against the hosted database;
// the setup alone can outlast Jest's default hook budget.
jest.setTimeout(300_000);

/**
 * US4: browsing invoices (T054-T056).
 *
 * The list is one selection: search by number or customer name with wildcards
 * treated literally, a status filter, an overdue-only filter, a closed sort
 * list, and a page size capped at 100. `total`, `outstanding` and `overdue`
 * describe the WHOLE filtered selection, not the visible page, and come from
 * the same `invoice_balances` definition the detail reads.
 *
 * An overdue invoice cannot be produced through the API on the day it is
 * issued (the due date may not precede the issue date), so the fixture inserts
 * one as it would have looked ten days ago - the trigger protects changes, not
 * the passage of time.
 */
describe('Invoicing US4: browse invoices', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  let adminCookie: string;
  let adminOrgId: string;
  let adminUserId: string;
  let productId: string;
  let productSku: string;
  let warehouseId: string;

  let gammaCustomerId: string;
  let gamma: {
    issued: { id: string; number: string; total: string };
    partial: { id: string; number: string; total: string };
    paid: { id: string; number: string; total: string };
    draft: { id: string; total: string };
    voided: { id: string; number: string; total: string };
    overdue: { id: string; total: string };
  };
  let partialPaymentId: string;

  beforeAll(async () => {
    await resetDatabase();
    await seedTestDatabase();

    const { app: testApp } = await createTestApp();
    app = testApp;

    const adminEmail = `admin-ib-${Date.now()}@example.com`;
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
      .send({ name: 'Browsing' })
      .expect(201);
    const units = await request(app.getHttpServer())
      .get('/api/v1/units-of-measure')
      .set('Cookie', adminCookie)
      .expect(200);
    const unitId = (units.body as Array<{ id: string; name: string }>).find((c) => c.name === 'roll')!.id;
    const sku = `SKU-IB-${Date.now()}`;
    productSku = sku;
    productId = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({ sku, name: 'Browsing bolt', categoryId: category.body.id, unitId, purchasePrice: '1.0000', sellingPrice: '1.2345' })
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
      .set('Idempotency-Key', `ib-stock-${Date.now()}`)
      .send({ warehouseId, productId, quantity: '1000.000', reason: 'COUNT_CORRECTION', note: 'Stock for the browsing suite.' })
      .expect(201);

    // Two customers whose names differ only in characters that are wildcards in SQL.
    const wild = await createCustomer('Wild 100%_Co', 'CUST-WILD-1');
    const wildPlain = await createCustomer('Wild 100ABCo', 'CUST-WILD-2');
    await issuedInvoice('10.0000', wild);
    await issuedInvoice('20.0000', wildPlain);

    gammaCustomerId = await createCustomer('Gamma Figures', 'CUST-GAMMA');
    gamma = {
      issued: await issuedInvoice('100.0000', gammaCustomerId),
      partial: await issuedInvoice('80.0000', gammaCustomerId),
      paid: await issuedInvoice('50.0000', gammaCustomerId),
      draft: await draftInvoice('40.0000', gammaCustomerId),
      voided: await issuedInvoice('25.0000', gammaCustomerId),
      // Filled below; the order must exist first.
      overdue: { id: '', total: '60.00' },
    };

    partialPaymentId = await recordPayment(gamma.partial, '30.00');
    await recordPayment(gamma.paid, '50.00');

    await request(app.getHttpServer())
      .post(`/api/v1/invoices/${gamma.voided.id}/void`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `void-${gamma.voided.id}`)
      .send({ reason: 'Cancelled by the customer' })
      .expect(200);

    // One invoice that has been overdue for three days: inserted as it stood ten
    // days ago, with the order total and a matching line so the invariants hold.
    const overdueOrder = await shippedOrder('60.0000', gammaCustomerId);
    const overdueRows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO "invoices"
         ("id", "organization_id", "number", "sales_order_id", "customer_id", "status",
          "issue_date", "due_date", "total", "version", "created_by", "updated_at")
       VALUES (gen_random_uuid(), $1::uuid, 'INV-900001', $2::uuid, $3::uuid, 'ISSUED',
               (now() AT TIME ZONE 'UTC')::date - 10, (now() AT TIME ZONE 'UTC')::date - 3,
               60.00, 1, $4::uuid, now())
       RETURNING "id"::text AS "id"`,
      adminOrgId,
      overdueOrder,
      gammaCustomerId,
      adminUserId,
    );
    gamma.overdue = { id: overdueRows[0]!.id, total: '60.00' };
    await prisma.$executeRawUnsafe(
      `INSERT INTO "invoice_lines"
         ("id", "organization_id", "invoice_id", "product_id", "quantity", "unit_price", "line_total")
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, 1.000, 60.0000, 60.00)`,
      adminOrgId,
      gamma.overdue.id,
      productId,
    );
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

  /** Creates, confirms and ships a sales order; returns its id. */
  async function shippedOrder(unitPrice: string, forCustomerId: string): Promise<string> {
    const created = await request(app.getHttpServer())
      .post('/api/v1/sales-orders')
      .set('Cookie', adminCookie)
      .send({ customerId: forCustomerId, warehouseId, orderDate: '2026-11-14', notes: '', lines: [{ productId, quantity: '1.000', unitPrice }] })
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
    return orderId;
  }

  /** Creates, ships and issues an invoice. */
  async function issuedInvoice(unitPrice: string, forCustomerId: string): Promise<{ id: string; number: string; total: string }> {
    const orderId = await shippedOrder(unitPrice, forCustomerId);
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
    return { id: issued.body.id as string, number: issued.body.number as string, total: issued.body.total as string };
  }

  /** Creates a DRAFT invoice. */
  async function draftInvoice(unitPrice: string, forCustomerId: string): Promise<{ id: string; total: string }> {
    const orderId = await shippedOrder(unitPrice, forCustomerId);
    const draft = await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/invoices`)
      .set('Cookie', adminCookie)
      .send({})
      .expect(201);
    return { id: draft.body.id as string, total: draft.body.total as string };
  }

  /** Pays one invoice in full and returns the payment id. */
  async function recordPayment(invoice: { id: string; total: string }, amount: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `pay-${invoice.id}-${Date.now()}`)
      .send({
        customerId: gammaCustomerId,
        amount,
        paymentDate: '2026-11-14',
        method: 'CARD',
        reference: 'TXN-BROWSE',
        allocations: [{ invoiceId: invoice.id, amount, expectedBalance: invoice.total }],
      })
      .expect(201);
    return response.body.id as string;
  }

  /** GET /invoices with the given query. */
  function listInvoices(query: Record<string, string | number>): request.Test {
    return request(app.getHttpServer()).get('/api/v1/invoices').query(query).set('Cookie', adminCookie);
  }

  it('T054: searches, filters, sorts and pages the list with whole-selection figures from one snapshot', async () => {
    // Wildcards are literal: `100%_` matches only the customer whose name contains them.
    const wild = await listInvoices({ search: '100%_', page: 1, pageSize: 100 }).expect(200);
    expect(wild.body.total).toBe(1);
    expect(wild.body.items).toHaveLength(1);
    expect(wild.body.items[0].customerName).toBe('Wild 100%_Co');

    // Search matches a number too.
    const byNumber = await listInvoices({ search: gamma.issued.number, page: 1, pageSize: 100 }).expect(200);
    expect(byNumber.body.total).toBe(1);
    expect(byNumber.body.items[0].id).toBe(gamma.issued.id);

    // The status filter covers all five values, and every returned row carries that status.
    for (const [status, minimum] of [
      ['DRAFT', 1],
      ['ISSUED', 2],
      ['PARTIALLY_PAID', 1],
      ['PAID', 1],
      ['VOID', 1],
    ] as const) {
      const filtered = await listInvoices({ search: 'Gamma Figures', status, page: 1, pageSize: 100 }).expect(200);
      expect(filtered.body.items.length).toBeGreaterThanOrEqual(minimum);
      expect((filtered.body.items as Array<{ status: string }>).every((row) => row.status === status)).toBe(true);
    }

    // The overdue-only filter is "due before today (UTC) AND balance above zero".
    const overdueOnly = await listInvoices({ search: 'Gamma Figures', overdue: 'true', page: 1, pageSize: 100 }).expect(200);
    expect(overdueOnly.body.total).toBe(1);
    expect(overdueOnly.body.items[0].id).toBe(gamma.overdue.id);
    expect(overdueOnly.body.items[0].isOverdue).toBe(true);
    const notOverdue = await listInvoices({ search: 'Gamma Figures', overdue: 'false', page: 1, pageSize: 100 }).expect(200);
    expect(notOverdue.body.items.map((row: { id: string }) => row.id)).not.toContain(gamma.overdue.id);

    // The sort list is closed: an unknown key is refused naming the field.
    await listInvoices({ sortBy: 'total', page: 1, pageSize: 25 })
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(res.body.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'sortBy' })]));
      });

    // Default sort is createdAt desc; the tie-break is id asc.
    const byDefault = await listInvoices({ search: 'Gamma Figures', page: 1, pageSize: 100 }).expect(200);
    expect(byDefault.body.items.map((row: { id: string }) => row.id)).toEqual([
      gamma.overdue.id,
      gamma.voided.id,
      gamma.draft.id,
      gamma.paid.id,
      gamma.partial.id,
      gamma.issued.id,
    ]);
    const byStatus = await listInvoices({ search: 'Gamma Figures', sortBy: 'status', sortOrder: 'asc', page: 1, pageSize: 100 }).expect(200);
    const issuedIds = (byStatus.body.items as Array<{ id: string; status: string }>)
      .filter((row) => row.status === 'ISSUED')
      .map((row) => row.id);
    expect(issuedIds).toEqual([...issuedIds].sort());

    // A page size above 100 is capped, not refused.
    const capped = await listInvoices({ page: 1, pageSize: 1000 }).expect(200);
    expect(capped.body.pageSize).toBe(100);

    // The figures cover the whole filtered selection, not the page.
    const firstOfThree = await listInvoices({ search: 'Gamma Figures', page: 1, pageSize: 2 }).expect(200);
    expect(firstOfThree.body.items).toHaveLength(2);
    expect(firstOfThree.body.total).toBe(6);
    expect(firstOfThree.body.outstanding).toBe('210.00');
    expect(firstOfThree.body.overdue).toBe('60.00');
    const lastPage = await listInvoices({ search: 'Gamma Figures', page: 3, pageSize: 2 }).expect(200);
    expect(lastPage.body.items).toHaveLength(2);
    expect(lastPage.body.total).toBe(6);
    expect(lastPage.body.outstanding).toBe('210.00');
    expect(lastPage.body.overdue).toBe('60.00');

    // A DRAFT-only selection contributes nothing to outstanding or overdue; an empty one shows 0.00.
    const draftsOnly = await listInvoices({ search: 'Gamma Figures', status: 'DRAFT', page: 1, pageSize: 25 }).expect(200);
    expect(draftsOnly.body.outstanding).toBe('0.00');
    expect(draftsOnly.body.overdue).toBe('0.00');
    const empty = await listInvoices({ search: 'No Such Invoice', page: 1, pageSize: 25 }).expect(200);
    expect(empty.body).toEqual(
      expect.objectContaining({ items: [], total: 0, page: 1, pageSize: 25, outstanding: '0.00', overdue: '0.00' }),
    );

    // The unfiltered figures equal the balances the view holds.
    const dbFigures = await prisma.$queryRawUnsafe<Array<{ outstanding: string; overdue: string }>>(
      `SELECT
         COALESCE(sum(ib.balance) FILTER (WHERE i.status IN ('ISSUED', 'PARTIALLY_PAID')), 0)::text AS "outstanding",
         COALESCE(sum(ib.balance) FILTER (WHERE i.status IN ('ISSUED', 'PARTIALLY_PAID') AND ib.is_overdue), 0)::text AS "overdue"
       FROM "invoice_balances" ib
       JOIN "invoices" i ON i."organization_id" = ib."organization_id" AND i."id" = ib."invoice_id"
       WHERE ib."organization_id" = $1::uuid`,
      adminOrgId,
    );
    const unfiltered = await listInvoices({ page: 1, pageSize: 1 }).expect(200);
    expect(unfiltered.body.outstanding).toBe(Number(dbFigures[0]!.outstanding).toFixed(2));
    expect(unfiltered.body.overdue).toBe(Number(dbFigures[0]!.overdue).toFixed(2));

    // The row shape: every invoice representation carries the exact label.
    expect(unfiltered.body.items[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        number: expect.anything(),
        orderId: expect.any(String),
        orderNumber: expect.stringMatching(/^SO-\d{6}$/),
        customerId: expect.any(String),
        customerName: expect.any(String),
        status: expect.any(String),
        total: expect.any(String),
        balance: expect.any(String),
        isOverdue: expect.any(Boolean),
        version: expect.any(Number),
        label: 'Operational invoice - not a tax invoice',
      }),
    );
  });

  it('T055: the detail shows lines, totals, applied payments (including reversed), void info and read-only state', async () => {
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${gamma.partial.id}`)
      .set('Cookie', adminCookie)
      .expect(200);

    expect(detail.body).toEqual(
      expect.objectContaining({
        id: gamma.partial.id,
        number: gamma.partial.number,
        status: 'PARTIALLY_PAID',
        total: '80.00',
        paid: '30.00',
        balance: '50.00',
        isOverdue: false,
        voidReason: null,
        voidedAt: null,
        voidedBy: null,
        label: 'Operational invoice - not a tax invoice',
      }),
    );
    expect(detail.body.orderNumber).toMatch(/^SO-\d{6}$/);
    expect(detail.body.lines).toHaveLength(1);
    expect(detail.body.lines[0]).toEqual(
      expect.objectContaining({
        productId,
        productSku,
        productName: 'Browsing bolt',
        quantity: '1.000',
        unitPrice: '80.0000',
        lineTotal: '80.00',
      }),
    );
    expect(detail.body.paymentsApplied).toEqual([
      expect.objectContaining({
        paymentId: partialPaymentId,
        paymentNumber: expect.stringMatching(/^PAY-\d{6}$/),
        paymentDate: '2026-11-14',
        amount: '30.00',
        reversed: false,
      }),
    ]);

    // A reversal keeps the allocation listed but labels it, and the balance returns.
    await request(app.getHttpServer())
      .post(`/api/v1/payments/${partialPaymentId}/reverse`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `rev-browse-${partialPaymentId}`)
      .send({ reason: 'Wrong invoice' })
      .expect(200);
    const afterReversal = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${gamma.partial.id}`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(afterReversal.body.status).toBe('ISSUED');
    expect(afterReversal.body.paid).toBe('0.00');
    expect(afterReversal.body.balance).toBe('80.00');
    expect(afterReversal.body.paymentsApplied[0].reversed).toBe(true);

    // A void invoice keeps its reason, timestamp and actor.
    const voided = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${gamma.voided.id}`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(voided.body.status).toBe('VOID');
    expect(voided.body.voidReason).toBe('Cancelled by the customer');
    expect(Number.isNaN(Date.parse(voided.body.voidedAt as string))).toBe(false);
    expect(voided.body.voidedBy).toBe(adminUserId);

    // Once ISSUED the invoice is read-only: changing the due date is refused.
    const issued = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${gamma.issued.id}`)
      .set('Cookie', adminCookie)
      .expect(200);
    await request(app.getHttpServer())
      .put(`/api/v1/invoices/${gamma.issued.id}`)
      .set('Cookie', adminCookie)
      .send({ dueDate: '2027-01-01', version: issued.body.version })
      .expect(409)
      .expect((res) => expect(res.body.code).toBe('INVALID_STATE_TRANSITION'));
  });

  it('T056: the open invoices of a customer are the ISSUED/PARTIALLY_PAID ones with a balance above zero', async () => {
    const customerId = await createCustomer('Open Customer', 'CUST-OPEN');
    const open = await issuedInvoice('100.0000', customerId);
    const partial = await issuedInvoice('80.0000', customerId);
    const paid = await issuedInvoice('50.0000', customerId);
    const draft = await draftInvoice('40.0000', customerId);
    const voided = await issuedInvoice('25.0000', customerId);

    const partialPayment = await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `pay-open-${partial.id}`)
      .send({
        customerId,
        amount: '30.00',
        paymentDate: '2026-11-14',
        method: 'CASH',
        allocations: [{ invoiceId: partial.id, amount: '30.00', expectedBalance: partial.total }],
      })
      .expect(201);
    expect(partialPayment.body.status).toBe('RECORDED');
    await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `pay-open-paid-${paid.id}`)
      .send({
        customerId,
        amount: '50.00',
        paymentDate: '2026-11-14',
        method: 'CASH',
        allocations: [{ invoiceId: paid.id, amount: '50.00', expectedBalance: paid.total }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/invoices/${voided.id}/void`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `void-open-${voided.id}`)
      .send({ reason: 'Not deliverable' })
      .expect(200);

    const response = await request(app.getHttpServer())
      .get('/api/v1/invoices/open')
      .query({ customerId })
      .set('Cookie', adminCookie)
      .expect(200);

    expect(response.body).toHaveLength(2);
    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: open.id,
          number: open.number,
          dueDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          total: '100.00',
          balance: '100.00',
          isOverdue: false,
        }),
        expect.objectContaining({ id: partial.id, total: '80.00', balance: '50.00' }),
      ]),
    );
    const ids = (response.body as Array<{ id: string }>).map((row) => row.id);
    expect(ids).not.toContain(paid.id);
    expect(ids).not.toContain(draft.id);
    expect(ids).not.toContain(voided.id);

    // An unknown customer is not found; the parameter is required.
    await request(app.getHttpServer())
      .get('/api/v1/invoices/open')
      .query({ customerId: '00000000-0000-4000-8000-000000000000' })
      .set('Cookie', adminCookie)
      .expect(404)
      .expect((res) => expect(res.body.code).toBe('NOT_FOUND'));
    await request(app.getHttpServer())
      .get('/api/v1/invoices/open')
      .set('Cookie', adminCookie)
      .expect(400)
      .expect((res) => expect(res.body.code).toBe('VALIDATION_ERROR'));
  });
});
