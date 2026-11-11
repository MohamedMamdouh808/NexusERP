import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, loginForCookies, loginAndChangePassword } from '../fixtures/app';
import { resetDatabase, seedTestDatabase, getTestPrisma } from '../fixtures/database';

/**
 * T026: Actor without users.manage receives 403 on every member endpoint
 * with no state change (FR-021/SC-002).
 */
describe('US2: permission 403 on member endpoints (FR-021/SC-002)', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();
  let adminCookie: string;
  let adminOrgId: string;
  let adminRoleId: string;
  let nonAdminCookie: string;

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

    // Register actor with Administrator role
    const registerEmail = `actor-${Date.now()}@example.com`;
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: registerEmail, password: 'Password1234' })
      .expect(201);

    adminOrgId = registerRes.body.organization.id;
    // Register issues no cookies by design - only login does.
    adminCookie = await loginForCookies(app, registerEmail, 'Password1234');

    const adminRole = await prisma.role.findFirst({
      where: { organizationId: adminOrgId, key: 'administrator' },
    });
    adminRoleId = adminRole!.id;

    const salesRole = await prisma.role.findFirst({
      where: { organizationId: adminOrgId, key: 'sales' },
    });

    // Create a member with Sales role (non-admin - no users.manage)
    await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', adminCookie)
      .send({
        email: `sales-${Date.now()}@example.com`,
        name: 'Sales Member',
        password: 'Password1234',
        roleIds: [salesRole!.id],
      })
      .expect(201);

    // Sign in as the sales member. It is a member an administrator created, so
    // it is flagged for a forced password change and cannot do anything else
    // until it chooses one - the reader chooses one here, as the member would.
    const salesMembership = await prisma.membership.findFirst({
      where: { organizationId: adminOrgId },
      orderBy: { createdAt: 'desc' },
      include: { user: true },
    });

    nonAdminCookie = await loginAndChangePassword(
      app,
      salesMembership!.user.email,
      'Password1234',
    );
  });

  it('403 on GET /memberships without users.manage', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/memberships')
      .set('Cookie', nonAdminCookie)
      .expect(403);

    expect(response.body.code).toBe('FORBIDDEN');
  });

  it('403 on POST /memberships without users.manage (no state change)', async () => {
    const beforeCount = await prisma.membership.count();

    const response = await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', nonAdminCookie)
      .send({
        email: `new-${Date.now()}@example.com`,
        name: 'New',
        password: 'Password1234',
        roleIds: [adminRoleId],
      })
      .expect(403);

    expect(response.body.code).toBe('FORBIDDEN');

    const afterCount = await prisma.membership.count();
    expect(afterCount).toBe(beforeCount); // No state change
  });

  it('403 on PUT /memberships/:id/roles without users.manage (no state change)', async () => {
    // Create a target membership first
    const targetRes = await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', adminCookie)
      .send({
        email: `target-${Date.now()}@example.com`,
        name: 'Target',
        password: 'Password1234',
        roleIds: [adminRoleId],
      })
      .expect(201);

    const targetMembershipId = targetRes.body.membership.id;
    const beforeRoles = targetRes.body.membership.roles.length;

    const response = await request(app.getHttpServer())
      .post(`/api/v1/memberships/${targetMembershipId}/roles`)
      .set('Cookie', nonAdminCookie)
      .send({ roleIds: [adminRoleId] })
      .expect(403);

    expect(response.body.code).toBe('FORBIDDEN');

    // No state change - roles unchanged
    const afterMembership = await prisma.membership.findUnique({
      where: { id: targetMembershipId },
      include: { roles: true },
    });
    expect(afterMembership!.roles).toHaveLength(beforeRoles);
  });

  it('403 on POST /memberships/:id/deactivate without users.manage', async () => {
    const targetRes = await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', adminCookie)
      .send({
        email: `target2-${Date.now()}@example.com`,
        name: 'Target2',
        password: 'Password1234',
        roleIds: [adminRoleId],
      })
      .expect(201);

    const targetMembershipId = targetRes.body.membership.id;

    const response = await request(app.getHttpServer())
      .post(`/api/v1/memberships/${targetMembershipId}/deactivate`)
      .set('Cookie', nonAdminCookie)
      .expect(403);

    expect(response.body.code).toBe('FORBIDDEN');

    // Membership still active
    const membership = await prisma.membership.findUnique({
      where: { id: targetMembershipId },
    });
    expect(membership!.isActive).toBe(true);
  });

  it('403 on POST /memberships/:id/reactivate without users.manage', async () => {
    const targetRes = await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', adminCookie)
      .send({
        email: `target3-${Date.now()}@example.com`,
        name: 'Target3',
        password: 'Password1234',
        roleIds: [adminRoleId],
      })
      .expect(201);

    const targetMembershipId = targetRes.body.membership.id;

    // First deactivate (as admin)
    await request(app.getHttpServer())
      .post(`/api/v1/memberships/${targetMembershipId}/deactivate`)
      .set('Cookie', adminCookie)
      .expect(200);

    // Reactivate as non-admin -> 403
    const response = await request(app.getHttpServer())
      .post(`/api/v1/memberships/${targetMembershipId}/reactivate`)
      .set('Cookie', nonAdminCookie)
      .expect(403);

    expect(response.body.code).toBe('FORBIDDEN');

    // Membership still inactive
    const membership = await prisma.membership.findUnique({
      where: { id: targetMembershipId },
    });
    expect(membership!.isActive).toBe(false);
  });
});

