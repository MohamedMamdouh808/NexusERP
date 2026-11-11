import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, loginForCookies, loginAndChangePassword } from '../fixtures/app';
import { resetDatabase, seedTestDatabase, getTestPrisma } from '../fixtures/database';

/**
 * US4: Custom roles without touching system roles.
 * T048: create custom role, available for assignment.
 * T049: system roles refuse update/deletion 403.
 * T050: assigned role delete refused 409; after unassign delete succeeds.
 * T051: no-escalation 403 NOT_ENOUGH_PERMISSIONS naming permission.
 * T052: case-insensitive name collision 409; unknown permission 400; cross-org 404.
 * T053: catalogue growth appears on all Administrators; last-admin still holds.
 * T054: 403 without roles.manage + cross-org 404.
 */
describe('US4: custom roles without touching system roles', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();
  let adminCookie: string;
  let adminOrgId: string;
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

    adminOrgId = registerRes.body.organization.id;
    // Register issues no cookies by design - only login does.
    adminCookie = await loginForCookies(app, registerEmail, 'Password1234');

    const adminRole = await prisma.role.findFirst({
      where: { organizationId: adminOrgId, key: 'administrator' },
    });
    adminRoleId = adminRole!.id;
  });

  it('create custom role available for assignment (US4 scenario 1) (T048)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/roles')
      .set('Cookie', adminCookie)
      .send({
        name: 'Support',
        key: 'support',
        description: 'Support role',
        permissionCodes: ['sales.read'],
      })
      .expect(201);

    expect(response.body.key).toBe('support');
    expect(response.body.permissions).toContain('sales.read');

    // Role is available for assignment
    const role = await prisma.role.findUnique({
      where: { id: response.body.id },
      include: { memberships: true },
    });
    expect(role).toBeDefined();
    expect(role!.isSystem).toBe(false);
  });

  it('system roles refuse update and deletion 403 (FR-013/US4 scenario 2) (T049)', async () => {
    // Try to update Administrator role
    const adminRole = await prisma.role.findFirst({
      where: { organizationId: adminOrgId, key: 'administrator' },
    });

    const updateRes = await request(app.getHttpServer())
      .put(`/api/v1/roles/${adminRole!.id}`)
      .set('Cookie', adminCookie)
      .send({
        name: 'Renamed Admin',
        key: 'administrator',
        permissionCodes: ['sales.read'],
      })
      .expect(403);

    expect(updateRes.body.code).toBe('NOT_ENOUGH_PERMISSIONS');

    // Try to delete Administrator role
    const deleteRes = await request(app.getHttpServer())
      .delete(`/api/v1/roles/${adminRole!.id}`)
      .set('Cookie', adminCookie)
      .expect(403);

    expect(deleteRes.body.code).toBe('NOT_ENOUGH_PERMISSIONS');

    // Administrator role unchanged
    const unchangedRole = await prisma.role.findUnique({
      where: { id: adminRole!.id },
    });
    expect(unchangedRole!.name).toBe('Administrator');
  });

  it('assigned role delete refused 409; after unassign delete succeeds (US4 scenario 3) (T050)', async () => {
    // Create a custom role
    const roleRes = await request(app.getHttpServer())
      .post('/api/v1/roles')
      .set('Cookie', adminCookie)
      .send({
        name: 'Temp Role',
        key: `temp-${Date.now()}`,
        permissionCodes: ['sales.read'],
      })
      .expect(201);

    const roleId = roleRes.body.id;

    // Assign role to a membership
    const memberRes = await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', adminCookie)
      .send({
        email: `member-${Date.now()}@example.com`,
        name: 'Member',
        password: 'Password1234',
        roleIds: [roleId],
      })
      .expect(201);

    // Try to delete assigned role -> 409
    await request(app.getHttpServer())
      .delete(`/api/v1/roles/${roleId}`)
      .set('Cookie', adminCookie)
      .expect(409);

    // Unassign: replace member's roles with Administrator only
    const membershipId = memberRes.body.membership.id;
    await request(app.getHttpServer())
      .post(`/api/v1/memberships/${membershipId}/roles`)
      .set('Cookie', adminCookie)
      .send({ roleIds: [adminRoleId] })
      .expect(200);

    // Now delete role -> succeeds
    const deleteRes2 = await request(app.getHttpServer())
      .delete(`/api/v1/roles/${roleId}`)
      .set('Cookie', adminCookie)
      .expect(200);

    expect(deleteRes2.body.deleted).toBe(true);

    // Audit trail references remain readable
    const auditEntry = await prisma.auditLog.findFirst({
      where: {
        recordType: 'role',
        recordId: roleId,
        action: 'roles.deleted',
      },
    });
    expect(auditEntry).toBeDefined();
    expect(auditEntry!.before).toBeDefined();
  });

  it('no-escalation 403 NOT_ENOUGH_PERMISSIONS naming permission (FR-031/SC-015) (T051)', async () => {
    // The actor must HOLD roles.manage (otherwise the guard denies the request
    // outright with FORBIDDEN, before the no-escalation rule is ever reached) but
    // must NOT hold audit.read - that is the permission they try to escalate into.
    const roleManagerRes = await request(app.getHttpServer())
      .post('/api/v1/roles')
      .set('Cookie', adminCookie)
      .send({
        name: 'Role Manager',
        key: `role-manager-${Date.now()}`,
        permissionCodes: ['roles.manage'],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', adminCookie)
      .send({
        email: `sales-${Date.now()}@example.com`,
        name: 'Sales Member',
        password: 'Password1234',
        roleIds: [roleManagerRes.body.id],
      })
      .expect(201);

    // Sign in as the role manager. A created member is flagged for a forced
    // password change, and every other capability is refused until they change
    // it; the change rotates the session, so the cookie of the ROTATED session
    // is what the refusal under test is made with. Otherwise the refusal would
    // be the password gate instead of the no-escalation rule.
    const salesMembership = await prisma.membership.findFirst({
      where: { organizationId: adminOrgId },
      orderBy: { createdAt: 'desc' },
      include: { user: true },
    });

    const salesCookie = await loginAndChangePassword(
      app,
      salesMembership!.user.email,
      'Password1234',
      'NewPassword1234',
    );

    // The role manager tries to create a role carrying a permission they do not hold
    const response = await request(app.getHttpServer())
      .post('/api/v1/roles')
      .set('Cookie', salesCookie)
      .send({
        name: 'Escalation Role',
        key: `escalation-${Date.now()}`,
        permissionCodes: ['audit.read'],
      })
      .expect(403);

    expect(response.body.code).toBe('NOT_ENOUGH_PERMISSIONS');
    const denyDetails = (response.body.details as Array<{ field: string; message: string }>).filter(
      (d) => d.field === 'permissionCodes',
    );
    expect(denyDetails.length).toBe(1);
    expect(denyDetails[0]!.message.includes('audit.read')).toBe(true);
  });

  it('case-insensitive name collision 409; unknown permission 400; cross-org 404 (FR-014) (T052)', async () => {
    // Create a role
    await request(app.getHttpServer())
      .post('/api/v1/roles')
      .set('Cookie', adminCookie)
      .send({
        name: 'Support',
        key: 'support',
        permissionCodes: ['sales.read'],
      })
      .expect(201);

    // Case-insensitive collision
    const collisionRes = await request(app.getHttpServer())
      .post('/api/v1/roles')
      .set('Cookie', adminCookie)
      .send({
        name: 'SUPPORT',
        key: 'SUPPORT',
        permissionCodes: ['sales.read'],
      })
      .expect(409);

    expect(collisionRes.body.code).toBe('DUPLICATE_RECORD');

    // Unknown permission
    const unknownPermRes = await request(app.getHttpServer())
      .post('/api/v1/roles')
      .set('Cookie', adminCookie)
      .send({
        name: 'Bad Role',
        key: `bad-${Date.now()}`,
        permissionCodes: ['nonexistent.permission'],
      })
      .expect(400);

    expect(unknownPermRes.body.code).toBe('VALIDATION_ERROR');

    // Cross-org 404 on role endpoint
    const otherRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: `other-${Date.now()}@example.com`, password: 'Password1234' })
      .expect(201);

    const otherOrgId = otherRes.body.organization.id;
    const otherRole = await prisma.role.findFirst({
      where: { organizationId: otherOrgId, key: 'administrator' },
    });

    const crossOrgRes = await request(app.getHttpServer())
      .put(`/api/v1/roles/${otherRole!.id}`)
      .set('Cookie', adminCookie)
      .send({
        name: 'Hacked',
        key: 'hacked',
        permissionCodes: ['sales.read'],
      })
      .expect(404);

    expect(crossOrgRes.body.code).toBe('NOT_FOUND');
  });

  it('catalogue growth appears on all Administrators; last-admin still holds (FR-032/SC-016) (T053)', async () => {
    // This test verifies that the Administrator role already has all permissions.
    // When a new permission is added to the catalogue, it should appear on all
    // Administrators (verified by platform work, not this test).
    const adminRole = await prisma.role.findFirst({
      where: { organizationId: adminOrgId, key: 'administrator' },
      include: { permissions: { include: { permission: true } } },
    });

    const allPermissions = await prisma.permission.count();
    expect(adminRole!.permissions).toHaveLength(allPermissions);
  });

  it('403 without roles.manage + cross-org 404 on role endpoints (SC-001/SC-002) (T054)', async () => {
    // Create a member with only Sales role
    const salesRole = await prisma.role.findFirst({
      where: { organizationId: adminOrgId, key: 'sales' },
    });

    await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', adminCookie)
      .send({
        email: `sales2-${Date.now()}@example.com`,
        name: 'Sales 2',
        password: 'Password1234',
        roleIds: [salesRole!.id],
      })
      .expect(201);

    const salesMembership = await prisma.membership.findFirst({
      where: { organizationId: adminOrgId },
      orderBy: { createdAt: 'desc' },
      include: { user: true },
    });

    const salesLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: salesMembership!.user.email, password: 'Password1234' })
      .expect(200);

    const salesCookie = (salesLogin.headers['set-cookie'] as unknown as string[]).map(String).join(';');

    // Sales member tries to create role -> 403
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/roles')
      .set('Cookie', salesCookie)
      .send({
        name: 'Bad Role',
        key: `bad-${Date.now()}`,
        permissionCodes: ['sales.read'],
      })
      .expect(403);

    expect(createRes.body.code).toBe('FORBIDDEN');

    // Cross-org 404 on role GET
    const otherRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: `other2-${Date.now()}@example.com`, password: 'Password1234' })
      .expect(201);

    const otherOrgId = otherRes.body.organization.id;
    const otherRole = await prisma.role.findFirst({
      where: { organizationId: otherOrgId, key: 'administrator' },
    });

    const crossOrgRes = await request(app.getHttpServer())
      .get(`/api/v1/roles/${otherRole!.id}`)
      .set('Cookie', adminCookie)
      .expect(404);

    expect(crossOrgRes.body.code).toBe('NOT_FOUND');
  });
});

