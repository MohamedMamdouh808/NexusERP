import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, loginForCookies } from '../fixtures/app';
import { getTestPrisma, resetDatabase, seedTestDatabase } from '../fixtures/database';

/**
 * US1: immutability verified with direct SQL (T030).
 *
 * Once ISSUED the header is immutable; the status only moves through the
 * allowed map; VOID is terminal; invoice_lines is insert-only; the payments
 * trio is append-only with no API-role grants on UPDATE/DELETE/TRUNCATE.
 * Rows are created through the API (FKs demand real rows), the refusals are
 * direct SQL against the triggers and grants.
 */
describe('Invoicing US1: immutability with direct SQL', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  let adminCookie: string;
  let adminOrgId: string;
  let adminUserId: string;
  let productId: string;
  let customerId: string;
  let warehouseId: string;

  beforeAll(async () => {
    await resetDatabase();
    await seedTestDatabase();

    const { app: testApp } = await createTestApp();
    app = testApp;

    const adminEmail = `admin-im-${Date.now()}@example.com`;
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
      .send({ name: 'Immutability' })
      .expect(201);
    const units = await request(app.getHttpServer())
      .get('/api/v1/units-of-measure')
      .set('Cookie', adminCookie)
      .expect(200);
    const unitId = (units.body as Array<{ id: string; name: string }>).find((c) => c.name === 'roll')!.id;
    productId = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({ sku: `SKU-IM-${Date.now()}`, name: 'Immutable bolt', categoryId: category.body.id, unitId, purchasePrice: '1.0000', sellingPrice: '1.2345' })
      .expect(201)
      .then((res) => res.body.id as string);

    const customer = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Cookie', adminCookie)
      .send({ code: `CUST-IM-${Date.now()}`, name: 'Immutability Customer', email: 'im@example.com', isCustomer: true })
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
      .set('Idempotency-Key', `im-stock-${Date.now()}`)
      .send({ warehouseId, productId, quantity: '1000.000', reason: 'COUNT_CORRECTION', note: 'Stock for the immutability suite.' })
      .expect(201);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** A fresh ISSUED invoice plus its allocated order context. */
  async function issuedInvoice(): Promise<{ invoiceId: string; orderId: string }> {
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
    return { invoiceId: draft.body.id as string, orderId };
  }

  /** Direct SQL that must always raise: the trigger is the refusal. */
  async function expectRefusal(sql: string): Promise<void> {
    await expect(prisma.$executeRawUnsafe(sql)).rejects.toThrow();
  }

  it('T030: once issued, the header fields are immutable', async () => {
    const { invoiceId } = await issuedInvoice();

    await expectRefusal(`UPDATE invoices SET customer_id = '00000000-0000-0000-0000-000000000000' WHERE id = '${invoiceId}'`);
    await expectRefusal(`UPDATE invoices SET sales_order_id = '00000000-0000-0000-0000-000000000000' WHERE id = '${invoiceId}'`);
    await expectRefusal(`UPDATE invoices SET number = 'INV-999999' WHERE id = '${invoiceId}'`);
    await expectRefusal(`UPDATE invoices SET issue_date = '2026-01-01' WHERE id = '${invoiceId}'`);
    await expectRefusal(`UPDATE invoices SET total = 9999.99 WHERE id = '${invoiceId}'`);
    await expectRefusal(`UPDATE invoices SET due_date = '2020-01-01' WHERE id = '${invoiceId}'`);
    await expectRefusal(`UPDATE invoices SET version = version - 1 WHERE id = '${invoiceId}'`);
  });

  it('T030: the allowed transition map passes; VOID is terminal', async () => {
    const { invoiceId } = await issuedInvoice();

    // ISSUED -> PARTIALLY_PAID allowed; PARTIALLY_PAID -> ISSUED allowed.
    await prisma.$executeRawUnsafe(`UPDATE invoices SET status = 'PARTIALLY_PAID' WHERE id = '${invoiceId}'`);
    await prisma.$executeRawUnsafe(`UPDATE invoices SET status = 'ISSUED' WHERE id = '${invoiceId}'`);
    // PARTIALLY_PAID -> PAID allowed; PAID -> ISSUED allowed (the map is not one-way).
    await prisma.$executeRawUnsafe(`UPDATE invoices SET status = 'PARTIALLY_PAID' WHERE id = '${invoiceId}'`);
    await prisma.$executeRawUnsafe(`UPDATE invoices SET status = 'PAID' WHERE id = '${invoiceId}'`);
    await prisma.$executeRawUnsafe(`UPDATE invoices SET status = 'ISSUED' WHERE id = '${invoiceId}'`);
    // Entering VOID with the trio set is allowed.
    await prisma.$executeRawUnsafe(
      `UPDATE invoices SET status = 'VOID', void_reason = 'Trigger test', voided_at = now(), voided_by = '${adminUserId}' WHERE id = '${invoiceId}'`,
    );
    // VOID is terminal: nothing comes back.
    await expectRefusal(`UPDATE invoices SET status = 'ISSUED' WHERE id = '${invoiceId}'`);
    await expectRefusal(`UPDATE invoices SET status = 'PAID' WHERE id = '${invoiceId}'`);
  });

  it('T030: transitions outside the map and a VOID entry without the trio are refused', async () => {
    const { invoiceId } = await issuedInvoice();
    // ISSUED -> DRAFT is not in the allowed map.
    await expectRefusal(`UPDATE invoices SET status = 'DRAFT' WHERE id = '${invoiceId}'`);
    // Entering VOID requires the reason/timestamp/actor trio.
    await expectRefusal(`UPDATE invoices SET status = 'VOID' WHERE id = '${invoiceId}'`);
    // PAID -> VOID is not in the map either: a paid invoice is closed, not voided.
    await prisma.$executeRawUnsafe(`UPDATE invoices SET status = 'PARTIALLY_PAID' WHERE id = '${invoiceId}'`);
    await prisma.$executeRawUnsafe(`UPDATE invoices SET status = 'PAID' WHERE id = '${invoiceId}'`);
    await expectRefusal(
      `UPDATE invoices SET status = 'VOID', void_reason = 'Trigger test', voided_at = now(), voided_by = '${adminUserId}' WHERE id = '${invoiceId}'`,
    );
    // Leave the fixture consistent with its allocated balance (PAID with nothing
    // allocated disagrees with the status invariant). PAID -> ISSUED is allowed.
    await prisma.$executeRawUnsafe(`UPDATE invoices SET status = 'ISSUED' WHERE id = '${invoiceId}'`);
  });

  it('T030: invoice_lines rejects UPDATE, DELETE and TRUNCATE', async () => {
    const { invoiceId } = await issuedInvoice();

    await expectRefusal(`UPDATE invoice_lines SET quantity = quantity WHERE invoice_id = '${invoiceId}'`);
    await expectRefusal(`DELETE FROM invoice_lines WHERE invoice_id = '${invoiceId}'`);
    await expectRefusal(`TRUNCATE invoice_lines`);

    const lines = await prisma.invoiceLine.findMany({ where: { organizationId: adminOrgId, invoiceId } });
    expect(lines).toHaveLength(1);
  });

  it('T030: the payments trio is append-only', async () => {
    const { invoiceId } = await issuedInvoice();
    const payment = await prisma.payment.create({
      data: {
        organizationId: adminOrgId,
        number: `PAY-${String(Date.now()).slice(-6)}`,
        customerId,
        amount: '1.23',
        paymentDate: new Date(),
        method: 'CASH',
        recordedById: adminUserId,
      },
    });
    await prisma.paymentAllocation.create({
      data: { organizationId: adminOrgId, paymentId: payment.id, invoiceId, amount: '1.23' },
    });
    const reversal = await prisma.paymentReversal.create({
      data: { organizationId: adminOrgId, paymentId: payment.id, reason: 'Trigger test', reversedById: adminUserId },
    });

    await expectRefusal(`UPDATE payments SET amount = 9.99 WHERE id = '${payment.id}'`);
    await expectRefusal(`DELETE FROM payments WHERE id = '${payment.id}'`);
    await expectRefusal(`TRUNCATE payments`);
    await expectRefusal(`UPDATE payment_allocations SET amount = 9.99 WHERE payment_id = '${payment.id}'`);
    await expectRefusal(`DELETE FROM payment_allocations WHERE payment_id = '${payment.id}'`);
    await expectRefusal(`TRUNCATE payment_allocations`);
    await expectRefusal(`UPDATE payment_reversals SET reason = 'x' WHERE id = '${reversal.id}'`);
    await expectRefusal(`DELETE FROM payment_reversals WHERE id = '${reversal.id}'`);
    await expectRefusal(`TRUNCATE payment_reversals`);
  });

  it('T030: the payments trio holds no UPDATE/DELETE/TRUNCATE grant for PUBLIC', async () => {
    // has_table_privilege() cannot resolve the pseudo-role PUBLIC by name, so the
    // ACLs are read directly: grantee 0 is PUBLIC, and a NULL relacl means the
    // default (owner only), which carries no public privileges either.
    const rows = await prisma.$queryRawUnsafe<Array<{ granted: number }>>(
      `SELECT count(*)::int AS granted
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN LATERAL aclexplode(c.relacl) a
       WHERE n.nspname = current_schema()
         AND c.relname IN ('payments', 'payment_allocations', 'payment_reversals')
         AND a.grantee = 0
         AND a.privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE')`,
    );
    expect(rows[0]!.granted).toBe(0);
  });
});
