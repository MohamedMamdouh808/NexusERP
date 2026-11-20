import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, loginForCookies } from '../fixtures/app';
import { getTestPrisma, resetDatabase, seedTestDatabase } from '../fixtures/database';

/**
 * US6: archiving a customer a blocking invoice names (T079).
 *
 * A DRAFT, ISSUED or PARTIALLY_PAID invoice keeps the customer alive: the
 * archive is refused with 409 `CONTACT_IN_USE`, and the refusal names the
 * invoice that blocks it. A PAID or VOID invoice keeps its history and
 * blocks nothing. The customer referenced only by those archives normally.
 */
describe('Invoicing usage: archiving a customer an open invoice names', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  let adminCookie: string;
  let productId: string;
  let warehouseId: string;

  beforeAll(async () => {
    await resetDatabase();
    await seedTestDatabase();

    const { app: testApp } = await createTestApp();
    app = testApp;

    const adminEmail = `admin-inv-usage-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: adminEmail, password: 'Password1234' })
      .expect(201);
    adminCookie = await loginForCookies(app, adminEmail, 'Password1234');

    const category = await request(app.getHttpServer())
      .post('/api/v1/product-categories')
      .set('Cookie', adminCookie)
      .send({ name: 'Invoicing usage' })
      .expect(201);
    const units = await request(app.getHttpServer())
      .get('/api/v1/units-of-measure')
      .set('Cookie', adminCookie)
      .expect(200);
    const unitId = (units.body as Array<{ id: string; name: string }>).find(
      (unit) => unit.name === 'roll',
    )!.id;

    const product = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({
        sku: 'SKU-GU-1',
        name: 'Guarded widget',
        categoryId: category.body.id,
        unitId,
        purchasePrice: '1.0000',
        sellingPrice: '1.2345',
      })
      .expect(201);
    productId = product.body.id;

    const warehouses = await request(app.getHttpServer())
      .get('/api/v1/warehouses')
      .set('Cookie', adminCookie)
      .expect(200);
    warehouseId = (warehouses.body.items as Array<{ id: string; isDefault: boolean }>).find(
      (warehouse) => warehouse.isDefault,
    )!.id;

    await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `inv-usage-stock-${Date.now()}`)
      .send({
        warehouseId,
        productId,
        quantity: '1000.000',
        reason: 'COUNT_CORRECTION',
        note: 'Stock for the invoicing usage guard suite.',
      })
      .expect(201);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const createCustomer = async (name: string) => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Cookie', adminCookie)
      .send({ name, isCustomer: true })
      .expect(201);
    return res.body as { id: string; version: number };
  };

  /** Draft, confirm and ship one order for the customer, returning its id. */
  const shippedOrder = async (customerId: string) => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/sales-orders')
      .set('Cookie', adminCookie)
      .send({
        customerId,
        warehouseId,
        orderDate: '2026-11-15',
        notes: '',
        lines: [{ productId, quantity: '2.000', unitPrice: '1.2345' }],
      })
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
  };

  /** Create the invoice for a shipped order. Total: 2.00 * 1.2345 = 2.47. */
  const createInvoice = async (orderId: string) => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/invoices`)
      .set('Cookie', adminCookie)
      .send({})
      .expect(201);
    return res.body as { id: string; number: string | null; total: string; balance: string; version: number };
  };

  const issueInvoice = async (invoice: { id: string }, key: string) => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoice.id}/issue`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', key)
      .send({})
      .expect(200);
    return res.body as { id: string; number: string; total: string; balance: string; version: number };
  };
  const archiveCustomer = (customerId: string, version: number) =>
    request(app.getHttpServer())
      .post(`/api/v1/contacts/${customerId}/archive`)
      .set('Cookie', adminCookie)
      .send({ version });

  const expectCustomerArchived = async (customerId: string, archived: boolean) => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/contacts/${customerId}`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(res.body.isArchived).toBe(archived);
  };

  it('T079: a DRAFT invoice refuses the archive and names the invoice', async () => {
    const customer = await createCustomer('Draft blocker');
    const orderId = await shippedOrder(customer.id);
    const invoice = await createInvoice(orderId);

    const refused = await archiveCustomer(customer.id, customer.version).expect(409);
    expect(refused.body.code).toBe('CONTACT_IN_USE');
    expect(JSON.stringify(refused.body.details)).toContain(invoice.id);

    await expectCustomerArchived(customer.id, false);

    await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoice.id}/void`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `void-${invoice.id}`)
      .send({ reason: 'Void before archiving.' })
      .expect(200);

    await archiveCustomer(customer.id, customer.version).expect(200);
    await expectCustomerArchived(customer.id, true);
  });

  it('T079: an ISSUED invoice refuses the archive and names the invoice', async () => {
    const customer = await createCustomer('Issued blocker');
    const orderId = await shippedOrder(customer.id);
    const draft = await createInvoice(orderId);
    const issued = await issueInvoice(draft, `issue-${draft.id}`);

    const refused = await archiveCustomer(customer.id, customer.version).expect(409);
    expect(refused.body.code).toBe('CONTACT_IN_USE');
    expect(JSON.stringify(refused.body.details)).toContain(issued.number as string);

    await expectCustomerArchived(customer.id, false);

    await request(app.getHttpServer())
      .post(`/api/v1/invoices/${issued.id}/void`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `void-${issued.id}`)
      .send({ reason: 'Void before archiving.' })
      .expect(200);

    await archiveCustomer(customer.id, customer.version).expect(200);
    await expectCustomerArchived(customer.id, true);
  });

  it('T079: a PARTIALLY_PAID invoice refuses the archive; PAID archives normally', async () => {
    const customer = await createCustomer('Paid blocker');
    const orderId = await shippedOrder(customer.id);
    const draft = await createInvoice(orderId);
    const issued = await issueInvoice(draft, `issue-${draft.id}`);

    await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `pay-${issued.id}-1`)
      .send({
        customerId: customer.id,
        amount: '1.00',
        paymentDate: '2026-11-15',
        method: 'CASH',
        allocations: [{ invoiceId: issued.id, amount: '1.00', expectedBalance: issued.balance }],
      })
      .expect(201);

    const refused = await archiveCustomer(customer.id, customer.version).expect(409);
    expect(refused.body.code).toBe('CONTACT_IN_USE');
    expect(JSON.stringify(refused.body.details)).toContain(issued.number as string);

    await expectCustomerArchived(customer.id, false);

    // Paying the invoice in full closes it: PAID blocks nothing.
    await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `pay-${issued.id}-2`)
      .send({
        customerId: customer.id,
        amount: '1.47',
        paymentDate: '2026-11-15',
        method: 'CASH',
        allocations: [{ invoiceId: issued.id, amount: '1.47', expectedBalance: '1.47' }],
      })
      .expect(201);

    await archiveCustomer(customer.id, customer.version).expect(200);
    await expectCustomerArchived(customer.id, true);
  });

  it('T079: a customer referenced only by a VOID invoice archives normally', async () => {
    const customer = await createCustomer('Void-only customer');
    const orderId = await shippedOrder(customer.id);
    const invoice = await createInvoice(orderId);

    await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoice.id}/void`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `void-${invoice.id}`)
      .send({ reason: 'Created by mistake.' })
      .expect(200);

    await archiveCustomer(customer.id, customer.version).expect(200);
    await expectCustomerArchived(customer.id, true);
  });
});
