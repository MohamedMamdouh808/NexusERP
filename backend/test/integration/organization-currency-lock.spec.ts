/**
 * T020 - Integration tests for the currency lock (FR-009..FR-011).
 *
 * A currency change is refused once any sales order, purchase order or invoice
 * exists (any status), the database trigger rejects direct SQL, and a currency
 * change racing the first document has exactly one successful outcome.
 */

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ERROR_CODES } from '@nexuserp/shared';
import { createTestApp, loginForCookies } from '../fixtures/app';
import { getTestPrisma, resetDatabase, seedTestDatabase } from '../fixtures/database';

describe('Currency lock (T020, FR-009..FR-011)', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  beforeAll(async () => {
    await resetDatabase();
    await seedTestDatabase();
    const { app: testApp } = await createTestApp();
    app = testApp;
  });

  async function registerAndLogin(label: string) {
    const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'Password1234' })
      .expect(201);
    const cookie = await loginForCookies(app, email, 'Password1234');
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const settings = await request(app.getHttpServer())
      .get('/api/v1/organizations/current')
      .set('Cookie', cookie)
      .expect(200);
    return { cookie, user, org: settings.body };
  }

  async function seedSupplierAndWarehouse(organizationId: string) {
    const supplier = await prisma.contact.create({
      data: { organizationId, code: 'SUP-LOCK', name: 'Lock Supplier', isSupplier: true },
    });
    const warehouse = await prisma.warehouse.create({
      data: { organizationId, name: 'Lock Warehouse', isDefault: false, isActive: true },
    });
    return { supplier, warehouse };
  }

  function createPurchaseOrder(cookie: string, supplierId: string, warehouseId: string) {
    return request(app.getHttpServer())
      .post('/api/v1/purchase-orders')
      .set('Cookie', cookie)
      .send({
        supplierId,
        warehouseId,
        orderDate: '2026-11-19',
        notes: 'currency lock test',
        lines: [],
      });
  }

  async function changeCurrency(cookie: string, version: number) {
    return request(app.getHttpServer())
      .put('/api/v1/organizations/current')
      .set('Cookie', cookie)
      .send({
        name: 'Renamed Org',
        currencyCode: 'EUR',
        defaultPaymentTermsDays: 30,
        version,
      });
  }

  it('refuses a currency change once a purchase order exists', async () => {
    const { cookie, org } = await registerAndLogin('lock-po');
    const { supplier, warehouse } = await seedSupplierAndWarehouse(org.id);
    await createPurchaseOrder(cookie, supplier.id, warehouse.id).expect(201);

    const response = await changeCurrency(cookie, org.version);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe(ERROR_CODES.CURRENCY_LOCKED);
  });

  it('refuses a direct SQL currency change via the database trigger', async () => {
    const { cookie, org } = await registerAndLogin('lock-trigger');
    const { supplier, warehouse } = await seedSupplierAndWarehouse(org.id);
    await createPurchaseOrder(cookie, supplier.id, warehouse.id).expect(201);

    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "organizations" SET "currency_code" = 'GBP' WHERE "id" = $1::uuid`,
        org.id,
      ),
    ).rejects.toThrow();
  });

  it('has exactly one successful outcome when a currency change races the first document', async () => {
    const { cookie, org } = await registerAndLogin('lock-race');
    const { supplier, warehouse } = await seedSupplierAndWarehouse(org.id);

    const [currencyResult, documentResult] = await Promise.all([
      changeCurrency(cookie, org.version),
      createPurchaseOrder(cookie, supplier.id, warehouse.id),
    ]);
    const successes = [currencyResult.status, documentResult.status].filter(
      (status) => status >= 200 && status < 300,
    );
    expect(successes.length).toBe(1);

    const after = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
    const poCount = await prisma.purchaseOrder.count({ where: { organizationId: org.id } });
    // A successful currency change means no document; a successful document means
    // the currency stayed USD.
    if (currencyResult.status === 200) {
      expect(after.currencyCode).toBe('EUR');
      expect(poCount).toBe(0);
    } else {
      expect(after.currencyCode).toBe('USD');
      expect(poCount).toBe(1);
    }
  });
});
