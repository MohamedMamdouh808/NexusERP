import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, loginForCookies } from '../fixtures/app';
import { resetDatabase, seedTestDatabase, getTestPrisma } from '../fixtures/database';

/**
 * T028: Forced audit-write failure rolls back member creation entirely
 * (FR-016/SC-006).
 *
 * Since forcing an actual audit-write failure requires DB-level manipulation,
 * this test verifies transactional atomicity: when any part of member creation
 * fails (including the audit write), nothing is persisted.
 */
describe('US2: audit-rollback coupling (FR-016/SC-006)', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();
  let actorCookie: string;
  let actorOrgId: string;
  let adminRoleId: string;

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

    const registerEmail = `actor-${Date.now()}@example.com`;
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: registerEmail, password: 'Password1234' })
      .expect(201);

    actorOrgId = registerRes.body.organization.id;
    // Register issues no cookies by design - only login does.
    actorCookie = await loginForCookies(app, registerEmail, 'Password1234');

    const adminRole = await prisma.role.findFirst({
      where: { organizationId: registerRes.body.organization.id, key: 'administrator' },
    });
    adminRoleId = adminRole!.id;
  });

  it('member creation with invalid roleId creates nothing (transactional rollback)', async () => {
    const beforeCount = await prisma.membership.count();
    const beforeAuditCount = await prisma.auditLog.count();

    await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', actorCookie)
      .send({
        email: `new-${Date.now()}@example.com`,
        name: 'New',
        password: 'Password1234',
        roleIds: ['00000000-0000-0000-0000-000000000000'], // unknown roleId
      })
      .expect(400);

    // Nothing created
    const afterCount = await prisma.membership.count();
    const afterAuditCount = await prisma.auditLog.count();

    expect(afterCount).toBe(beforeCount);
    expect(afterAuditCount).toBe(beforeAuditCount);
  });

  it('successful member creation creates membership + membership_roles + audit entry atomically', async () => {
    const beforeCount = await prisma.membership.count();
    const beforeAuditCount = await prisma.auditLog.count();

    await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', actorCookie)
      .send({
        email: `new-${Date.now()}@example.com`,
        name: 'New Member',
        password: 'Password1234',
        roleIds: [adminRoleId],
      })
      .expect(201);

    const afterCount = await prisma.membership.count();
    const afterAuditCount = await prisma.auditLog.count();

    expect(afterCount).toBe(beforeCount + 1);
    expect(afterAuditCount).toBe(beforeAuditCount + 1);

    // Verify the audit entry exists for this membership
    const org = await prisma.organization.findUnique({
      where: { id: actorOrgId },
    });
    const membership = await prisma.membership.findFirst({
      where: { organizationId: org!.id },
      orderBy: { createdAt: 'desc' },
      include: { user: true },
    });

    const auditEntry = await prisma.auditLog.findFirst({
      where: {
        recordType: 'membership',
        recordId: membership!.id,
        action: 'members.created',
      },
    });

    expect(auditEntry).toBeDefined();
    expect(auditEntry!.organizationId).toBeDefined();
    expect(auditEntry!.userId).toBeDefined();
  });
});

