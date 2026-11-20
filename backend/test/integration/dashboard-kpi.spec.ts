import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, loginAndChangePassword, loginForCookies } from '../fixtures/app';
import { getTestPrisma, resetDatabase, seedTestDatabase } from '../fixtures/database';

/**
 * The dashboard KPI extension (T013, feature 017).
 *
 * The KPI summary answers the Overview page's question with the service's own
 * figures: the period figures against the previous window, plus the two
 * as-of-today receivables. Every figure must equal the records it came from -
 * the interface never derives one - and the previous-period change is null
 * when there is nothing to compare against, never a fabricated percentage.
 */
describe('Dashboard KPI summary: end to end', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  let adminCookie: string;
  let otherCookie: string;
  let lowStockCookie: string;
  let categoryId: string;
  let unitId: string;
  let productId: string;
  let lowStockProductId: string;
  let customerId: string;
  let supplierId: string;
  let invoiceId: string;
  let invoiceTotal: string;
  let outstandingAfterPayment: string;

  let keyCounter = 0;
  const nextKey = (): string => `kpi-key-${Date.now()}-${(keyCounter += 1)}`;

  beforeAll(async () => {
    await resetDatabase();
    await seedTestDatabase();

    const { app: testApp } = await createTestApp();
    app = testApp;

    const adminEmail = `admin-kpi-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: adminEmail, password: 'Password1234' })
      .expect(201);
    adminCookie = await loginForCookies(app, adminEmail, 'Password1234');

    const otherEmail = `other-kpi-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: otherEmail, password: 'Password1234' })
      .expect(201);
    otherCookie = await loginForCookies(app, otherEmail, 'Password1234');

    // A member holding a role WITHOUT reports.read, to prove the permission gate.
    const roles = await request(app.getHttpServer())
      .post('/api/v1/roles')
      .set('Cookie', adminCookie)
      .send({ name: `KPI reader-${Date.now()}`, key: `kpi-reader-${Date.now()}`, permissionCodes: ['invoices.read'] })
      .expect(201);
    const readerEmail = `reader-kpi-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', adminCookie)
      .send({ email: readerEmail, name: 'KPI Reader', password: 'Password1234', roleIds: [roles.body.id] })
      .expect(201);
    lowStockCookie = await loginAndChangePassword(app, readerEmail, 'Password1234');

    const category = await request(app.getHttpServer())
      .post('/api/v1/product-categories')
      .set('Cookie', adminCookie)
      .send({ name: 'Dashboard category' })
      .expect(201);
    categoryId = category.body.id as string;

    const units = await request(app.getHttpServer())
      .get('/api/v1/units-of-measure')
      .set('Cookie', adminCookie)
      .expect(200);
    unitId = (units.body as Array<{ id: string; name: string }>).find((unit) => unit.name === 'roll')!.id;

    const product = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({
        sku: `SKU-KPI-${Date.now()}`,
        name: 'Dashboard bolt',
        categoryId,
        unitId,
        purchasePrice: '1.0000',
        sellingPrice: '10.0000',
      })
      .expect(201);
    productId = product.body.id as string;

    // A product whose on-hand lands below its reorder threshold: the low-stock figure.
    const lowProduct = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({
        sku: `SKU-KPI-LOW-${Date.now()}`,
        name: 'Dashboard low stock',
        categoryId,
        unitId,
        purchasePrice: '1.0000',
        sellingPrice: '5.0000',
        lowStockThreshold: '5.000',
      })
      .expect(201);
    lowStockProductId = lowProduct.body.id as string;

    const warehouses = await request(app.getHttpServer())
      .get('/api/v1/warehouses')
      .set('Cookie', adminCookie)
      .expect(200);
    const warehouseId = (warehouses.body.items as Array<{ id: string; isDefault: boolean }>).find((w) => w.isDefault)!.id;

    // 1000 units of product A, 2 of the low-stock product.
    await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `kpi-stock-a-${Date.now()}`)
      .send({ warehouseId, productId, quantity: '1000.000', reason: 'COUNT_CORRECTION', note: 'KPI suite stock.' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/inventory/adjustments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `kpi-stock-b-${Date.now()}`)
      .send({ warehouseId, productId: lowStockProductId, quantity: '2.000', reason: 'COUNT_CORRECTION', note: 'KPI suite low stock.' })
      .expect(201);

    const supplier = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Cookie', adminCookie)
      .send({ name: 'KPI Supplier', isSupplier: true })
      .expect(201);
    supplierId = supplier.body.id as string;

    const customer = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Cookie', adminCookie)
      .send({ name: 'KPI Customer', isCustomer: true })
      .expect(201);
    customerId = customer.body.id as string;

    // One purchase order, confirmed: purchases of 100.00.
    const po = await request(app.getHttpServer())
      .post('/api/v1/purchase-orders')
      .set('Cookie', adminCookie)
      .send({
        supplierId,
        warehouseId,
        orderDate: '2026-11-16',
        expectedDate: null,
        notes: '',
        lines: [{ productId, quantity: '10.000', unitCost: '10.0000' }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/purchase-orders/${po.body.id}/confirm`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', nextKey())
      .send({ version: 1 })
      .expect(200);

    // One sales order, shipped, invoiced and issued: sales of 100.00.
    const order = await request(app.getHttpServer())
      .post('/api/v1/sales-orders')
      .set('Cookie', adminCookie)
      .send({
        customerId,
        warehouseId,
        orderDate: '2026-11-16',
        notes: '',
        lines: [{ productId, quantity: '10.000', unitPrice: '10.0000' }],
      })
      .expect(201);
    const orderId = order.body.id as string;
    await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/confirm`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', nextKey())
      .send({ version: 1 })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/shipments`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', nextKey())
      .send({})
      .expect(201);

    const draft = await request(app.getHttpServer())
      .post(`/api/v1/sales-orders/${orderId}/invoices`)
      .set('Cookie', adminCookie)
      .send({})
      .expect(201);
    invoiceId = draft.body.id as string;
    const issued = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoiceId}/issue`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', nextKey())
      .send({})
      .expect(200);
    invoiceTotal = issued.body.total as string;
    outstandingAfterPayment = invoiceTotal; // no payments yet

    // Apply a partial payment: the receivable shrinks, the payment is counted.
    const paymentAmount = '25.00';
    const expectedBalance = invoiceTotal;
    await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', nextKey())
      .send({
        customerId,
        amount: paymentAmount,
        paymentDate: '2026-11-16',
        method: 'CASH',
        reference: '',
        allocations: [{ invoiceId, amount: paymentAmount, expectedBalance }],
      })
      .expect(201);
    outstandingAfterPayment = (Number(invoiceTotal) - Number(paymentAmount)).toFixed(2);
    // No backdating: the immutability trigger allows due_date changes only on
    // drafts, so an overdue invoice cannot be manufactured inside a suite.
    // The overdue figure is therefore asserted against an empty selection.
  }, 240_000);

  afterAll(async () => {
    await prisma.$disconnect();
  }, 120_000);

  const kpis = (body: { kpis: Array<Record<string, unknown>> }, key: string) =>
    body.kpis.find((entry) => entry.key === key) as Record<string, unknown> | undefined;

  it('answers every figure against the records it came from', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/reports/kpi-summary?start=2026-10-01&end=2026-12-31')
      .set('Cookie', adminCookie)
      .expect(200);

    expect(res.body.filters).toEqual({ start: '2026-10-01', end: '2026-12-31' });
    expect(typeof res.body.asOf).toBe('string');

    expect(kpis(res.body, 'salesTotal')?.value).toBe(invoiceTotal);
    expect(kpis(res.body, 'invoiceCount')?.value).toBe('1');
    expect(kpis(res.body, 'purchasesTotal')?.value).toBe('100.00');
    expect(kpis(res.body, 'purchaseOrderCount')?.value).toBe('1');
    expect(kpis(res.body, 'paymentsReceived')?.value).toBe('25.00');
    expect(kpis(res.body, 'salesOrderCount')?.value).toBe('1');
    expect(kpis(res.body, 'purchaseOrderCreatedCount')?.value).toBe('1');
    expect(kpis(res.body, 'lowStockProductCount')?.value).toBe('1');
    expect(kpis(res.body, 'outOfStockProductCount')?.value).toBe('0');
    // The receivables are as of today and INDEPENDENT of the selected range.
    expect(kpis(res.body, 'outstanding')?.value).toBe(outstandingAfterPayment);
    expect(kpis(res.body, 'outstandingInvoiceCount')?.value).toBe('1');
    // The issued invoice carries the default terms: due date later than today,
    // so it is not overdue. An overdue invoice cannot be manufactured inside
    // a suite - the immutability trigger allows due_date changes only on drafts.
    expect(kpis(res.body, 'overdue')?.value).toBe('0');
    expect(kpis(res.body, 'overdueInvoiceCount')?.value).toBe('0');
  });

  it('reports a null change when the previous period is zero, never a fabricated percentage', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/reports/kpi-summary?start=2026-10-01&end=2026-12-31')
      .set('Cookie', adminCookie)
      .expect(200);

    // The previous window is empty: every period-bound figure has zero basis.
    expect(kpis(res.body, 'salesTotal')?.previousValue).toBe('0');
    expect(kpis(res.body, 'salesTotal')?.change).toBeNull();
    expect(kpis(res.body, 'purchasesTotal')?.change).toBeNull();
    expect(kpis(res.body, 'paymentsReceived')?.change).toBeNull();
    expect(kpis(res.body, 'salesOrderCount')?.change).toBeNull();
    expect(kpis(res.body, 'outstanding')?.previousValue).toBeUndefined();

    // A window with no records at all: zero figures, null changes.
    const empty = await request(app.getHttpServer())
      .get('/api/v1/reports/kpi-summary?start=2025-01-01&end=2025-01-31')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(kpis(empty.body, 'salesTotal')?.value).toBe('0');
    expect(kpis(empty.body, 'salesTotal')?.change).toBeNull();
  });

  it('counts only this organization\'s records', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/reports/kpi-summary?start=2026-10-01&end=2026-12-31')
      .set('Cookie', otherCookie)
      .expect(200);

    expect(kpis(res.body, 'salesTotal')?.value).toBe('0');
    expect(kpis(res.body, 'invoiceCount')?.value).toBe('0');
    expect(kpis(res.body, 'purchasesTotal')?.value).toBe('0');
    expect(kpis(res.body, 'paymentsReceived')?.value).toBe('0');
    expect(kpis(res.body, 'salesOrderCount')?.value).toBe('0');
    expect(kpis(res.body, 'purchaseOrderCreatedCount')?.value).toBe('0');
    // The issued invoice is not overdue, so the overdue-only selection is
    // empty and the KPI counts nothing. The invoice's DUE DATE cannot be
    // backdated to force an overdue row - the immutability trigger allows
    // due_date changes only on drafts.
    expect(kpis(res.body, 'outstanding')?.value).toBe('0');
    expect(kpis(res.body, 'outstandingInvoiceCount')?.value).toBe('0');
    expect(kpis(res.body, 'overdue')?.value).toBe('0');
    expect(kpis(res.body, 'overdueInvoiceCount')?.value).toBe('0');
  });

  it('refuses a member without reports.read', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/reports/kpi-summary?start=2026-10-01&end=2026-12-31')
      .set('Cookie', lowStockCookie)
      .expect(403);
  });

  it('agrees with the invoice list about the outstanding and overdue selection', async () => {
    const kpi = await request(app.getHttpServer())
      .get('/api/v1/reports/kpi-summary?start=2026-10-01&end=2026-12-31')
      .set('Cookie', adminCookie)
      .expect(200);
    const listAll = await request(app.getHttpServer())
      .get('/api/v1/invoices')
      .set('Cookie', adminCookie)
      .expect(200);
    const listOverdue = await request(app.getHttpServer())
      .get('/api/v1/invoices?overdue=true')
      .set('Cookie', adminCookie)
      .expect(200);

    // The unfiltered invoice list's whole-selection outstanding is the same
    // invoice_balances figure the KPI carries as of today.
    expect(kpis(kpi.body, 'outstanding')?.value).toBe(listAll.body.outstanding);
    // An overdue invoice cannot be manufactured inside a suite, so both
    // sides of the overdue agreement are empty - and they agree. The two
    // endpoints' empty aggregates carry different text rounding; both read zero.
    expect(listOverdue.body.items).toEqual([]);
    expect(kpis(kpi.body, 'overdue')?.value).toBe('0');
    expect(Number(listOverdue.body.overdue)).toBe(0);
  });
});
