/**
 * T019 - Integration tests for organization settings (FR-001..FR-008, FR-029).
 *
 * Readable by any active member; writes require `settings.manage`. Validation,
 * optimistic locking, currency lock and same-transaction audit are enforced on
 * the server, and each organization sees only its own settings.
 */

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuditService } from '../../src/modules/audit/audit.service';
import { AUDIT_ACTIONS, ERROR_CODES } from '@nexuserp/shared';
import { createTestApp, loginAndChangePassword, loginForCookies } from '../fixtures/app';
import { getTestPrisma, resetDatabase, seedTestDatabase } from '../fixtures/database';

describe('Organization settings (T019, FR-001..FR-008)', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();
  let adminCookie: string;
  let readerCookie: string;
  let version: number;

  async function registerAndLogin(email: string) {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'Password1234' })
      .expect(201);
    return loginForCookies(app, email, 'Password1234');
  }

  function getSettings(cookie: string) {
    return request(app.getHttpServer()).get('/api/v1/organizations/current').set('Cookie', cookie);
  }

  function putSettings(cookie: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .put('/api/v1/organizations/current')
      .set('Cookie', cookie)
      .send(body);
  }

  beforeAll(async () => {
    await resetDatabase();
    await seedTestDatabase();
    const { app: testApp } = await createTestApp();
    app = testApp;
    adminCookie = await registerAndLogin(`settings-admin-${Date.now()}@example.test`);
    version = (await getSettings(adminCookie)).body.version;

    // A member whose role lacks settings.manage.
    const readerRole = await request(app.getHttpServer())
      .post('/api/v1/roles')
      .set('Cookie', adminCookie)
      .send({
        name: 'Reader',
        key: `reader-${Date.now()}`,
        permissionCodes: ['contacts.read'],
      })
      .expect(201);
    const readerEmail = `settings-reader-${Date.now()}@example.test`;
    await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', adminCookie)
      .send({
        email: readerEmail,
        name: 'Reader',
        password: 'Password1234',
        roleIds: [readerRole.body.id],
      })
      .expect(201);
    readerCookie = await loginAndChangePassword(app, readerEmail, 'Password1234');
  });

  it('reads settings and the five switchable modules for any active member', async () => {
    const admin = await getSettings(adminCookie).expect(200);
    expect(admin.body.name).toBeTruthy();
    expect(admin.body.currencyCode).toBe('USD');
    expect(admin.body.defaultPaymentTermsDays).toBe(30);
    expect(admin.body.version).toBeGreaterThanOrEqual(1);
    expect(admin.body.currencyLocked).toBe(false);
    expect(admin.body.modules.map((m: { key: string }) => m.key).sort()).toEqual([
      'inventory',
      'invoicing',
      'purchasing',
      'reports',
      'sales',
    ]);

    await getSettings(readerCookie).expect(200);
  });

  it('refuses a write without settings.manage', async () => {
    const response = await putSettings(readerCookie, {
      name: 'Changed',
      currencyCode: 'USD',
      defaultPaymentTermsDays: 30,
      version,
    });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe(ERROR_CODES.FORBIDDEN);
  });

  it('stores a trimmed name, currency and terms and increments the version', async () => {
    const response = await putSettings(adminCookie, {
      name: '  Acme Retail  ',
      currencyCode: 'EUR',
      defaultPaymentTermsDays: 45,
      version,
    }).expect(200);
    expect(response.body.name).toBe('Acme Retail');
    expect(response.body.currencyCode).toBe('EUR');
    expect(response.body.defaultPaymentTermsDays).toBe(45);
    expect(response.body.version).toBe(version + 1);
    version = response.body.version;
  });

  it('refuses invalid name, currency and payment terms', async () => {
    const base = { name: 'Acme Retail', currencyCode: 'EUR', defaultPaymentTermsDays: 45, version };
    for (const bad of [
      { ...base, name: '   ' },
      { ...base, name: 'x'.repeat(101) },
      { ...base, currencyCode: 'usd' },
      { ...base, currencyCode: 'CAD' },
      { ...base, defaultPaymentTermsDays: -1 },
      { ...base, defaultPaymentTermsDays: 366 },
      { ...base, defaultPaymentTermsDays: 30.5 },
    ]) {
      const response = await putSettings(adminCookie, bad);
      expect(response.status).toBe(400);
      expect(response.body.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    }
  });

  it('refuses a stale version without changing anything', async () => {
    const before = (await getSettings(adminCookie)).body;
    const response = await putSettings(adminCookie, {
      name: 'Stale',
      currencyCode: 'EUR',
      defaultPaymentTermsDays: 45,
      version: before.version + 100,
    });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe(ERROR_CODES.STALE_VERSION);
    const after = (await getSettings(adminCookie)).body;
    expect(after.name).toBe(before.name);
    expect(after.version).toBe(before.version);
  });

  it('commits an audit entry with before and after in the same transaction', async () => {
    const before = (await getSettings(adminCookie)).body;
    await putSettings(adminCookie, {
      name: 'Audited Org',
      currencyCode: 'EUR',
      defaultPaymentTermsDays: 60,
      version: before.version,
    }).expect(200);
    version = (await getSettings(adminCookie)).body.version;

    const entry = await prisma.auditLog.findFirst({
      where: {
        organizationId: before.id,
        action: AUDIT_ACTIONS.organizationsUpdated,
        recordId: before.id,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(entry).not.toBeNull();
    expect(entry?.before).toMatchObject({ name: before.name });
    expect(entry?.after).toMatchObject({ name: 'Audited Org', defaultPaymentTermsDays: 60 });
  });

  it('rolls the change back when the audit write fails', async () => {
    const before = (await getSettings(adminCookie)).body;
    const audit = app.get(AuditService);
    const spy = jest.spyOn(audit, 'record').mockImplementation(async (params) => {
      if (params.action === AUDIT_ACTIONS.organizationsUpdated) {
        throw new Error('audit write failed');
      }
      // Preserve registration/other audit behaviour for the surrounding flow.
      throw new Error('audit write failed');
    });
    try {
      const response = await putSettings(adminCookie, {
        name: 'Should Not Persist',
        currencyCode: 'EUR',
        defaultPaymentTermsDays: 60,
        version: before.version,
      });
      expect(response.status).toBe(500);
      const after = (await getSettings(adminCookie)).body;
      expect(after.name).toBe(before.name);
      expect(after.version).toBe(before.version);
    } finally {
      spy.mockRestore();
    }
  });

  it('scopes settings to the calling organization (two-org isolation)', async () => {
    const otherCookie = await registerAndLogin(`settings-other-${Date.now()}@example.test`);
    const mine = await getSettings(adminCookie).expect(200);
    const other = await getSettings(otherCookie).expect(200);
    expect(mine.body.id).not.toBe(other.body.id);
    expect(other.body.currencyCode).toBe('USD');
    // No client-supplied organization id can redirect the read.
    const attempted = await request(app.getHttpServer())
      .get('/api/v1/organizations/current')
      .query({ organizationId: mine.body.id })
      .set('Cookie', otherCookie)
      .expect(200);
    expect(attempted.body.id).toBe(other.body.id);
  });
});
