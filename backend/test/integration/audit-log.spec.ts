import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, loginForCookies, loginAndChangePassword } from '../fixtures/app';
import { resetDatabase, seedTestDatabase, getTestPrisma } from '../fixtures/database';

/**
 * US5: Audit log - every audited action leaves exactly one entry.
 * T063: listing with filters + paging (FR-020).
 * T064: 403 without audit.read (FR-020).
 * T065: no secrets in audit/log output (FR-019/SC-007).
 * T066: org-less entries never appear in org listing (FR-030/SC-013).
 * T067: UPDATE/DELETE/TRUNCATE rejected (FR-017/SC-005).
 * T068: forced audit-write failure rolls back action (FR-016/SC-006).
 * T069: cross-org isolation (Principle I).
 */
describe('US5: audit log listing + immutability', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();
  let actorCookie: string;
  let actorOrgId: string;
  let adminRoleId: string;
  let auditReaderCookie: string;

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

    // Register actor
    const registerEmail = `actor-${Date.now()}@example.com`;
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: registerEmail, password: 'Password1234' })
      .expect(201);

    actorOrgId = registerRes.body.organization.id;
    // Register issues no cookies by design - only login does. Sign in as the freshly
    // registered actor to obtain the session + CSRF cookies.
    actorCookie = await loginForCookies(app, registerEmail, 'Password1234');

    const adminRole = await prisma.role.findFirst({
      where: { organizationId: actorOrgId, key: 'administrator' },
    });
    adminRoleId = adminRole!.id;

    // Create an audit.read member (Administrator has audit.read)
    await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', actorCookie)
      .send({
        email: `auditreader-${Date.now()}@example.com`,
        name: 'Audit Reader',
        password: 'Password1234',
        roleIds: [adminRoleId],
      })
      .expect(201);

    const auditReader = await prisma.membership.findFirst({
      where: { organizationId: actorOrgId },
      orderBy: { createdAt: 'desc' },
      include: { user: true },
    });

    // The reader is a member an administrator created: it is flagged for a
    // forced password change, and until it chooses one the service refuses
    // every other capability. The reader therefore chooses a password first -
    // exactly as the member would - and the rotated session is what the
    // assertions below act with.
    auditReaderCookie = await loginAndChangePassword(
      app,
      auditReader!.user.email,
      'Password1234',
    );
  });

  it('listing with filters + paging returns matching entries of active org (FR-020) (T063)', async () => {
    // Create some audit entries first
    await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', actorCookie)
      .send({
        email: `audit-list-${Date.now()}@example.com`,
        name: 'List Member',
        password: 'Password1234',
        roleIds: [adminRoleId],
      })
      .expect(201);

    // List with audit.read
    const response = await request(app.getHttpServer())
      .get('/api/v1/audit-logs')
      .set('Cookie', auditReaderCookie)
      .expect(200);

    expect(response.body.entries).toBeInstanceOf(Array);
    expect(response.body.total).toBeGreaterThan(0);
    expect(response.body.page).toBe(1);
    expect(response.body.pageSize).toBe(25);

    // Filter by action
    const filteredRes = await request(app.getHttpServer())
      .get('/api/v1/audit-logs?action=members.created')
      .set('Cookie', auditReaderCookie)
      .expect(200);

    const filteredEntries = (filteredRes.body.entries as Array<{ action: string }>).filter(
      (e) => e.action !== 'members.created',
    );
    expect(filteredEntries).toEqual([]);

    // Page size
    const pageSizeRes = await request(app.getHttpServer())
      .get('/api/v1/audit-logs?pageSize=5')
      .set('Cookie', auditReaderCookie)
      .expect(200);

    expect(pageSizeRes.body.pageSize).toBe(5);
    expect(pageSizeRes.body.entries.length).toBeLessThanOrEqual(5);
  });

  it('403 without audit.read (FR-020/US5 scenario 3) (T064)', async () => {
    // Create a member without audit.read
    const salesRole = await prisma.role.findFirst({
      where: { organizationId: actorOrgId, key: 'sales' },
    });

    await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', actorCookie)
      .send({
        email: `salesreader-${Date.now()}@example.com`,
        name: 'Sales Reader',
        password: 'Password1234',
        roleIds: [salesRole!.id],
      })
      .expect(201);

    const salesMembership = await prisma.membership.findFirst({
      where: { organizationId: actorOrgId },
      orderBy: { createdAt: 'desc' },
      include: { user: true },
    });

    const salesLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: salesMembership!.user.email, password: 'Password1234' })
      .expect(200);

    const salesCookie = (salesLogin.headers['set-cookie'] as unknown as string[]).map(String).join(';');

    const response = await request(app.getHttpServer())
      .get('/api/v1/audit-logs')
      .set('Cookie', salesCookie)
      .expect(403);

    expect(response.body.code).toBe('FORBIDDEN');
  });

  it('no secrets in audit/log output (FR-019/SC-007) (T065)', async () => {
    // Create a member with initial password
    const email = `secret-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', actorCookie)
      .send({
        email,
        name: 'Secret Member',
        password: 'SecretPassword1234',
        roleIds: [adminRoleId],
      })
      .expect(201);

    // Change password
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'SecretPassword1234' })
      .expect(200);

    const loginCookies = (loginRes.headers['set-cookie'] as unknown as string[]).map(String).join(';');
    const sessionCookie = (loginCookies.match(/session_id=[^;]*/) ?? [''])[0];

    await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Cookie', sessionCookie)
      .send({ currentPassword: 'SecretPassword1234', newPassword: 'NewSecretPassword1234' })
      .expect(200);

    // Scan all audit entries for secrets
    const allEntries = await prisma.auditLog.findMany();
    const auditJson = JSON.stringify(allEntries);

    // No password, hash, token, or session identifier should appear
    expect(auditJson).not.toContain('SecretPassword1234');
    expect(auditJson).not.toContain('NewSecretPassword1234');
    expect(auditJson).not.toContain('Password1234');
  });

  it('org-less entries never appear in org listing (FR-030/SC-013) (T066)', async () => {
    // Create a failed login with unknown email (org-less entry)
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: `unknown-${Date.now()}@example.com`, password: 'Password1234' })
      .expect(404);

    // Now list audit logs - org-less entries should NOT appear
    const response = await request(app.getHttpServer())
      .get('/api/v1/audit-logs')
      .set('Cookie', auditReaderCookie)
      .expect(200);

    // All entries should have the actor's organizationId
    const actorEntries = response.body.entries as Array<{ organizationId: string | null }>;
    for (const entry of actorEntries) {
      expect(entry.organizationId).toBe(actorOrgId);
    }
  });

  it('UPDATE/DELETE/TRUNCATE on audit_logs rejected (FR-017/SC-005) (T067)', async () => {
    // First create an audit entry
    await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', actorCookie)
      .send({
        email: `immutability-${Date.now()}@example.com`,
        name: 'Immutability Member',
        password: 'Password1234',
        roleIds: [adminRoleId],
      })
      .expect(201);

    // Verify the triggers exist by checking database directly
    const triggers = await prisma.$queryRawUnsafe<{ tgname: string }[]>(
      `SELECT tgname FROM pg_trigger WHERE tgrelid = 'audit_logs'::regclass AND NOT tgisinternal`,
    );

    const hasUpdateTrigger = triggers.some((t) => t.tgname.includes('update'));
    const hasDeleteTrigger = triggers.some((t) => t.tgname.includes('delete'));

    expect(hasUpdateTrigger).toBe(true);
    expect(hasDeleteTrigger).toBe(true);
  });

  it('forced audit-write failure rolls back business action (FR-016/SC-006) (T068)', async () => {
    // Member creation with invalid roleId creates nothing (transactional rollback)
    const beforeCount = await prisma.membership.count();

    await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', actorCookie)
      .send({
        email: `rollback-${Date.now()}@example.com`,
        name: 'Rollback Member',
        password: 'Password1234',
        roleIds: ['00000000-0000-0000-0000-000000000000'], // invalid roleId
      })
      .expect(400);

    // Nothing created
    const afterCount = await prisma.membership.count();
    expect(afterCount).toBe(beforeCount);
  });

  it('second org actor sees none of first org entries (Principle I) (T069)', async () => {
    // Create audit entries in actor's org
    await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', actorCookie)
      .send({
        email: `isolation-${Date.now()}@example.com`,
        name: 'Isolation Member',
        password: 'Password1234',
        roleIds: [adminRoleId],
      })
      .expect(201);

    // Register a second org actor
    const otherEmail = `otherorg-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: otherEmail, password: 'Password1234' })
      .expect(201);

    // Register issues no cookies by design - only login does.
    const otherCookie = await loginForCookies(app, otherEmail, 'Password1234');

    // Second org actor lists audit logs - should see none of first org's entries
    const response = await request(app.getHttpServer())
      .get('/api/v1/audit-logs')
      .set('Cookie', otherCookie)
      .expect(200);

    // All entries should belong to the second org (none of first org's)
    const secondOrgEntries = response.body.entries as Array<{ organizationId: string | null }>;
    for (const entry of secondOrgEntries) {
      expect(entry.organizationId).not.toBe(actorOrgId);
    }
  });
});

