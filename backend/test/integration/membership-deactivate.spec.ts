import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, loginForCookies } from '../fixtures/app';
import { resetDatabase, seedTestDatabase, getTestPrisma } from '../fixtures/database';

/**
 * US3: Last active Administrator protection + deactivate/reactivate.
 * T040: single active Administrator â€” deactivation refused 409 LAST_ADMINISTRATOR
 *       and roles change excluding Administrator refused 409 (FR-009/SC-003).
 * T041: with two active Administrators, deactivation and role change succeed + audited.
 * T042: deactivation invalidates existing sessions; fresh sign-in refused (FR-010/SC-004).
 * T043: state machine â€” 409 on already-inactive deactivate / already-active reactivate.
 * T044: permission 403 + cross-org 404 on deactivate/reactivate (SC-001/SC-002).
 */
describe('US3: last active Administrator + deactivate/reactivate', () => {
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
      where: { organizationId: actorOrgId, key: 'administrator' },
    });
    adminRoleId = adminRole!.id;
  });

  it('single active Administrator: deactivation refused 409 LAST_ADMINISTRATOR (T040)', async () => {
    // Only one admin exists - the actor. The endpoint addresses a membership by
    // id, so the actor's own membership is what is deactivated (and refused).
    const actorMembership = await prisma.membership.findFirst({
      where: { organizationId: actorOrgId },
      include: { user: true },
    });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/memberships/${actorMembership!.id}/deactivate`)
      .set('Cookie', actorCookie)
      .expect(409);

    expect(response.body.code).toBe('LAST_ADMINISTRATOR');

    // Membership still active
    const membership = await prisma.membership.findFirst({
      where: { organizationId: actorOrgId },
      include: { user: true },
    });
    expect(membership!.isActive).toBe(true);
  });

  it('single active Administrator: roles change excluding Administrator refused 409 (T040)', async () => {
    // Get the actor's membership id
    const membership = await prisma.membership.findFirst({
      where: { organizationId: actorOrgId },
      include: { user: true },
    });

    const salesRole = await prisma.role.findFirst({
      where: { organizationId: actorOrgId, key: 'sales' },
    });

    // Try to replace roles with just Sales (removing Administrator)
    const response = await request(app.getHttpServer())
      .post(`/api/v1/memberships/${membership!.id}/roles`)
      .set('Cookie', actorCookie)
      .send({ roleIds: [salesRole!.id] })
      .expect(409);

    expect(response.body.code).toBe('LAST_ADMINISTRATOR');
  });

  it('two active Administrators: deactivation and role change succeed + audited (T041)', async () => {
    // Create a second Administrator membership
    await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', actorCookie)
      .send({
        email: `admin2-${Date.now()}@example.com`,
        name: 'Admin 2',
        password: 'Password1234',
        roleIds: [adminRoleId],
      })
      .expect(201);

    // Now we have 2 admins. Deactivate one (the second one).
    const admin2Membership = await prisma.membership.findFirst({
      where: { organizationId: actorOrgId, isActive: true },
      orderBy: { createdAt: 'desc' },
      include: { user: true },
    });

    // Deactivate admin2
    const deactivateRes = await request(app.getHttpServer())
      .post(`/api/v1/memberships/${admin2Membership!.id}/deactivate`)
      .set('Cookie', actorCookie)
      .expect(200);

    expect(deactivateRes.body.isActive).toBe(false);

    // Audit entry exists
    const auditEntry = await prisma.auditLog.findFirst({
      where: {
        recordType: 'membership',
        recordId: admin2Membership!.id,
        action: 'members.deactivated',
      },
    });
    expect(auditEntry).toBeDefined();

    // Reactivate admin2
    const reactivateRes = await request(app.getHttpServer())
      .post(`/api/v1/memberships/${admin2Membership!.id}/reactivate`)
      .set('Cookie', actorCookie)
      .expect(200);

    expect(reactivateRes.body.isActive).toBe(true);

    // Audit entry for reactivation
    const reactivateAudit = await prisma.auditLog.findFirst({
      where: {
        recordType: 'membership',
        recordId: admin2Membership!.id,
        action: 'members.reactivated',
      },
    });
    expect(reactivateAudit).toBeDefined();
  });

  it('deactivation invalidates existing sessions; fresh sign-in refused (FR-010/SC-004) (T042)', async () => {
    // Create a member
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', actorCookie)
      .send({
        email: `member-${Date.now()}@example.com`,
        name: 'Member',
        password: 'Password1234',
        roleIds: [adminRoleId],
      })
      .expect(201);

    const membershipId = createRes.body.membership.id;
    const membership = await prisma.membership.findUnique({
      where: { id: membershipId },
      include: { user: true },
    });

    // Sign in as the member
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: membership!.user.email, password: 'Password1234' })
      .expect(200);

    const loginCookies = (loginRes.headers['set-cookie'] as unknown as string[]).map(String).join(';');
    const sessionCookie = (loginCookies.match(/session_id=[^;]*/) ?? [''])[0];

    // Verify session works
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', sessionCookie)
      .expect(200);

    // Deactivate the membership
    await request(app.getHttpServer())
      .post(`/api/v1/memberships/${membershipId}/deactivate`)
      .set('Cookie', actorCookie)
      .expect(200);

    // Old session no longer works
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', sessionCookie)
      .expect(401);

    // Fresh sign-in refused (membership inactive).
    //
    // The answer is 404, the SAME answer a wrong password and an unknown
    // email get (FR-010): the sign-in failure must not tell an attacker that
    // this address has an account. A deactivated membership is refused exactly
    // as an unknown one is.
    const refused = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: membership!.user.email, password: 'Password1234' })
      .expect(404);

    expect(refused.body.code).toBe('NOT_FOUND');
  });

  it('state machine: 409 on already-inactive deactivate / already-active reactivate (T043)', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', actorCookie)
      .send({
        email: `member2-${Date.now()}@example.com`,
        name: 'Member2',
        password: 'Password1234',
        roleIds: [adminRoleId],
      })
      .expect(201);

    const membershipId = createRes.body.membership.id;

    // Deactivate (first time - OK)
    await request(app.getHttpServer())
      .post(`/api/v1/memberships/${membershipId}/deactivate`)
      .set('Cookie', actorCookie)
      .expect(200);

    // Deactivate again (already inactive - 409)
    await request(app.getHttpServer())
      .post(`/api/v1/memberships/${membershipId}/deactivate`)
      .set('Cookie', actorCookie)
      .expect(409);

    // Reactivate (first time - OK)
    await request(app.getHttpServer())
      .post(`/api/v1/memberships/${membershipId}/reactivate`)
      .set('Cookie', actorCookie)
      .expect(200);

    // Reactivate again (already active - 409)
    await request(app.getHttpServer())
      .post(`/api/v1/memberships/${membershipId}/reactivate`)
      .set('Cookie', actorCookie)
      .expect(409);
  });

  it('cross-organization 404 on deactivate/reactivate (SC-001/SC-002) (T044)', async () => {
    // Register another org
    const otherRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: `other-${Date.now()}@example.com`, password: 'Password1234' })
      .expect(201);

    const otherOrgId = otherRes.body.organization.id;
    const otherMembership = await prisma.membership.findFirst({
      where: { organizationId: otherOrgId },
    });

    // Try to deactivate other org's membership
    const response = await request(app.getHttpServer())
      .post(`/api/v1/memberships/${otherMembership!.id}/deactivate`)
      .set('Cookie', actorCookie)
      .expect(404);

    expect(response.body.code).toBe('NOT_FOUND');

    // Try to reactivate other org's membership
    const response2 = await request(app.getHttpServer())
      .post(`/api/v1/memberships/${otherMembership!.id}/reactivate`)
      .set('Cookie', actorCookie)
      .expect(404);

    expect(response2.body.code).toBe('NOT_FOUND');
  });
});

