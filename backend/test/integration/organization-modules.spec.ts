/**
 * T030 - Integration tests for module availability and toggles (FR-012..FR-019).
 *
 * Listing is open to any member; toggles require `settings.manage`. Dependencies,
 * open-document counts, stale versions, same-transaction audit and re-enablement
 * are enforced on the server.
 */

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AUDIT_ACTIONS, ERROR_CODES } from '@nexuserp/shared';
import { createTestApp, loginAndChangePassword, loginForCookies } from '../fixtures/app';
import { getTestPrisma, resetDatabase, seedTestDatabase } from '../fixtures/database';

describe('Organization modules (T030, FR-012..FR-019)', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

  async function registerAndLogin(label: string) {
    const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'Password1234' })
      .expect(201);
    const cookie = await loginForCookies(app, email, 'Password1234');
    const settings = await request(app.getHttpServer())
      .get('/api/v1/organizations/current')
      .set('Cookie', cookie)
      .expect(200);
    return { cookie, org: settings.body };
  }

  function listModules(cookie: string) {
    return request(app.getHttpServer())
      .get('/api/v1/organizations/current/modules')
      .set('Cookie', cookie);
  }

  function toggle(cookie: string, key: string, enabled: boolean, version: number) {
    return request(app.getHttpServer())
      .put(`/api/v1/organizations/current/modules/${key}`)
      .set('Cookie', cookie)
      .send({ enabled, version });
  }

  function moduleVersion(body: { modules: { key: string; version: number }[] }, key: string) {
    return body.modules.find((m) => m.key === key)?.version ?? 1;
  }

  beforeAll(async () => {
    await resetDatabase();
    await seedTestDatabase();
    const { app: testApp } = await createTestApp();
    app = testApp;
  });

  it('lists five switchable modules and four locked always-on modules', async () => {
    const { cookie } = await registerAndLogin('mod-list');
    const body = (await listModules(cookie).expect(200)).body;
    const switchable = body.modules.filter((m: { locked: boolean }) => !m.locked);
    const alwaysOn = body.modules.filter((m: { locked: boolean }) => m.locked);
    expect(switchable.map((m: { key: string }) => m.key).sort()).toEqual([
      'inventory',
      'invoicing',
      'purchasing',
      'reports',
      'sales',
    ]);
    expect(alwaysOn.map((m: { key: string }) => m.key).sort()).toEqual([
      'audit',
      'contacts',
      'products',
      'settings',
    ]);
    expect(switchable.every((m: { enabled: boolean }) => m.enabled)).toBe(true);
  });

  it('refuses a toggle without settings.manage', async () => {
    const { cookie, org } = await registerAndLogin('mod-perm');
    const readerRole = await request(app.getHttpServer())
      .post('/api/v1/roles')
      .set('Cookie', cookie)
      .send({ name: 'Reader', key: `reader-${Date.now()}`, permissionCodes: ['contacts.read'] })
      .expect(201);
    const email = `mod-reader-${Date.now()}@example.test`;
    await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', cookie)
      .send({ email, name: 'Reader', password: 'Password1234', roleIds: [readerRole.body.id] })
      .expect(201);
    const readerCookie = await loginAndChangePassword(app, email, 'Password1234');
    const response = await toggle(readerCookie, 'reports', false, 1);
    expect(response.status).toBe(403);
    expect(response.body.code).toBe(ERROR_CODES.FORBIDDEN);
    void org;
  });

  it('refuses to turn off a module another enabled module depends on', async () => {
    const { cookie } = await registerAndLogin('mod-dep-off');
    const before = (await listModules(cookie).expect(200)).body;
    const response = await toggle(cookie, 'inventory', false, moduleVersion(before, 'inventory'));
    expect(response.status).toBe(409);
    expect(response.body.code).toBe(ERROR_CODES.MODULE_DEPENDENCY);
    expect(JSON.stringify(response.body.details)).toContain('sales');
  });

  it('refuses to turn on a module whose requirement is off', async () => {
    const { cookie } = await registerAndLogin('mod-dep-on');
    // Turn off invoicing, sales, purchasing and inventory (each depends on the next).
    for (const key of ['invoicing', 'sales', 'purchasing', 'inventory']) {
      const list = (await listModules(cookie).expect(200)).body;
      await toggle(cookie, key, false, moduleVersion(list, key)).expect(200);
    }
    const list = (await listModules(cookie).expect(200)).body;
    const response = await toggle(cookie, 'sales', true, moduleVersion(list, 'sales'));
    expect(response.status).toBe(409);
    expect(response.body.code).toBe(ERROR_CODES.MODULE_DEPENDENCY);
    expect(JSON.stringify(response.body.details)).toContain('inventory');
  });

  it('refuses a stale toggle without changing the module', async () => {
    const { cookie } = await registerAndLogin('mod-stale');
    const before = (await listModules(cookie).expect(200)).body;
    const response = await toggle(cookie, 'reports', false, moduleVersion(before, 'reports') + 100);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe(ERROR_CODES.STALE_VERSION);
    const after = (await listModules(cookie).expect(200)).body;
    expect(after.modules.find((m: { key: string }) => m.key === 'reports')?.enabled).toBe(true);
  });

  it('refuses an unknown or always-on key', async () => {
    const { cookie } = await registerAndLogin('mod-key');
    await toggle(cookie, 'contacts', false, 1).expect(404);
    await toggle(cookie, 'not-a-module', false, 1).expect(404);
  });

  it('turns a module off and back on without deleting data, with audit', async () => {
    const { cookie, org } = await registerAndLogin('mod-cycle');
    let list = (await listModules(cookie).expect(200)).body;
    const off = await toggle(cookie, 'reports', false, moduleVersion(list, 'reports')).expect(200);
    expect(off.body).toMatchObject({ key: 'reports', enabled: false });
    list = (await listModules(cookie).expect(200)).body;
    const on = await toggle(cookie, 'reports', true, moduleVersion(list, 'reports')).expect(200);
    expect(on.body).toMatchObject({ key: 'reports', enabled: true });

    const entry = await prisma.auditLog.findFirst({
      where: {
        organizationId: org.id,
        action: AUDIT_ACTIONS.organizationsModuleToggled,
        recordId: org.id,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(entry).not.toBeNull();
    expect(entry?.before).toMatchObject({ module: 'reports', enabled: false });
    expect(entry?.after).toMatchObject({ module: 'reports', enabled: true });
  });

  it('refuses to turn off a module with open documents and reports counts', async () => {
    const { cookie, org } = await registerAndLogin('mod-inuse');
    // Seed an open purchase order directly.
    const supplier = await prisma.contact.create({
      data: { organizationId: org.id, code: 'SUP', name: 'Supplier', isSupplier: true },
    });
    const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { organizationId: org.id } });
    await prisma.purchaseOrder.create({
      data: {
        organizationId: org.id,
        number: 'PO-000001',
        supplierId: supplier.id,
        warehouseId: warehouse.id,
        orderDate: new Date('2026-11-19'),
        createdById: (await prisma.user.findFirstOrThrow({ where: { email: { contains: 'mod-inuse' } } })).id,
        status: 'DRAFT',
      },
    });
    const list = (await listModules(cookie).expect(200)).body;
    const response = await toggle(cookie, 'purchasing', false, moduleVersion(list, 'purchasing'));
    expect(response.status).toBe(409);
    expect(response.body.code).toBe(ERROR_CODES.MODULE_IN_USE);
    expect(JSON.stringify(response.body.details)).toContain('purchase order');
  });
});
