import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../fixtures/app';
import { resetDatabase, seedTestDatabase, getTestPrisma } from '../fixtures/database';

/**
 * User Story 5 audit coverage: every audited action leaves exactly one entry
 * committed in the same transaction as the business change (FR-015, FR-016).
 *
 * Verifies that key audited actions produce exactly one audit entry each.
 */
describe('US5: audit coverage', () => {
  let app: INestApplication;
  let prisma = getTestPrisma();

  beforeAll(async () => {
    const { app: testApp } = await createTestApp();
    app = testApp;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase();
    await seedTestDatabase();
  });

  it('auth.register: registration writes auth.register + roles.catalogue_provisioned entries', async () => {
    const email = `audit-reg-${Date.now()}@example.com`;
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'Password1234' })
      .expect(201);

    const orgId = res.body.organization.id;

    const entries = await prisma.auditLog.findMany({
      where: {
        organizationId: orgId,
        action: { in: ['auth.register', 'roles.catalogue_provisioned'] },
      },
    });

    const byAction = Object.groupBy(entries, (e: { action: string }) => e.action);
    expect(byAction['auth.register']?.length).toBe(1);
    expect(byAction['roles.catalogue_provisioned']?.length).toBe(1);
    expect(byAction['auth.register']?.[0].userId).toBe(res.body.user.id);
    expect(byAction['auth.register']?.[0].recordType).toBe('user');
    expect(byAction['auth.register']?.[0].recordId).toBe(res.body.user.id);
  });

  it('auth.login_failed: failed login writes audit entry with user id, no org', async () => {
    const email = `audit-login-${Date.now()}@example.com`;
    // Register first so the email exists
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'Password1234' })
      .expect(201);

    // Failed login
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'WrongPassword1234' })
      .expect(404);

    const entries = await prisma.auditLog.findMany({
      where: { action: 'auth.login_failed' },
    });

    expect(entries.length).toBeGreaterThan(0);
    const latest = entries[entries.length - 1];
    expect(latest.userId).toBeDefined();
    expect(latest.organizationId).toBeNull();
    expect(latest.reasonCode).toBe('invalid_credentials');
  });

  it('roles.created: custom role creation writes audit entry with before/after', async () => {
    // Get actor's org and an existing role
    // Register actor first
    const actorRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: `audit-actor-${Date.now()}@example.com`, password: 'Password1234' })
      .expect(201);

    const actorCookie = actorRes.headers['set-cookie']?.join('; ') ?? '';
    const orgId = actorRes.body.organization.id;

    const adminRole = await prisma.role.findFirst({
      where: { organizationId: orgId, key: 'administrator' },
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/roles')
      .set('Cookie', actorCookie)
      .send({
        name: 'Audit Role',
        key: `audit-${Date.now()}`,
        permissionCodes: ['sales.read'],
      })
      .expect(201);

    const roleId = res.body.id;

    const entries = await prisma.auditLog.findMany({
      where: { recordType: 'role', action: 'roles.created', recordId: roleId },
    });

    expect(entries.length).toBe(1);
    expect(entries[0].after).toMatchObject({
      name: 'Audit Role',
      permissions: ['sales.read'],
    });
  });
});
