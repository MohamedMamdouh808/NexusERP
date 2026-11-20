/**
 * T031 - A module toggle racing creation of the first document in that module
 * must have exactly one successful outcome (FR-018).
 */

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, loginForCookies } from '../fixtures/app';
import { getTestPrisma, resetDatabase, seedTestDatabase } from '../fixtures/database';

describe('Module toggle race (T031, FR-018)', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  beforeAll(async () => {
    await resetDatabase();
    await seedTestDatabase();
    const { app: testApp } = await createTestApp();
    app = testApp;
  });

  async function freshOrg() {
    const email = `race-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'Password1234' })
      .expect(201);
    const cookie = await loginForCookies(app, email, 'Password1234');
    const modules = (await request(app.getHttpServer())
      .get('/api/v1/organizations/current/modules')
      .set('Cookie', cookie)
      .expect(200)).body.modules;
    const settings = (await request(app.getHttpServer())
      .get('/api/v1/organizations/current')
      .set('Cookie', cookie)
      .expect(200)).body;
    const supplier = await prisma.contact.create({
      data: { organizationId: settings.id, code: 'SUP', name: 'Supplier', isSupplier: true },
    });
    const warehouse = await prisma.warehouse.findFirstOrThrow({
      where: { organizationId: settings.id },
    });
    return { cookie, modules, supplier, warehouse, orgId: settings.id };
  }

  it('a toggle-off racing the first purchase order has exactly one winner', async () => {
    const { cookie, modules, supplier, warehouse, orgId } = await freshOrg();
    const purchasing = modules.find((m: { key: string }) => m.key === 'purchasing');

    const [toggleResult, documentResult] = await Promise.all([
      request(app.getHttpServer())
        .put('/api/v1/organizations/current/modules/purchasing')
        .set('Cookie', cookie)
        .send({ enabled: false, version: purchasing.version }),
      request(app.getHttpServer())
        .post('/api/v1/purchase-orders')
        .set('Cookie', cookie)
        .send({ supplierId: supplier.id, warehouseId: warehouse.id, orderDate: '2026-11-19', lines: [] }),
    ]);

    const successes = [toggleResult.status, documentResult.status].filter(
      (s) => s >= 200 && s < 300,
    );
    expect(successes.length).toBe(1);

    const row = await prisma.organizationModule.findUniqueOrThrow({
      where: { organizationId_moduleKey: { organizationId: orgId, moduleKey: 'purchasing' } },
    });
    const poCount = await prisma.purchaseOrder.count({ where: { organizationId: orgId } });
    if (toggleResult.status === 200) {
      expect(row.enabled).toBe(false);
      expect(poCount).toBe(0);
    } else {
      expect(row.enabled).toBe(true);
      expect(poCount).toBe(1);
    }
  });
});
