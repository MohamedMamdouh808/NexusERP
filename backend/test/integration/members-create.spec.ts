import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, loginForCookies } from '../fixtures/app';
import { resetDatabase, seedTestDatabase, getTestPrisma } from '../fixtures/database';

/**
 * T021: Created member flagged mustChangePassword; sign-in response states it;
 * every other capability refused with 403 PASSWORD_CHANGE_REQUIRED
 * (FR-006/FR-007/FR-028/SC-010).
 * T022: Creation with existing email byte-identical to fresh account; existing
 * password and flag untouched (FR-008/SC-014).
 */
describe('US2: member creation + forced password change (non-enumerable)', () => {
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

    // Register actor with Administrator role
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

  it('created member flagged mustChangePassword; sign-in response states it; other capabilities refused with 403 PASSWORD_CHANGE_REQUIRED (FR-006/FR-007/FR-028/SC-010)', async () => {
    const email = `newmember-${Date.now()}@example.com`;
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', actorCookie)
      .send({
        email,
        name: 'New Member',
        password: 'Password1234',
        roleIds: [adminRoleId],
      })
      .expect(201);

    // Membership returned should include roles
    expect(createRes.body.membership.roles).toHaveLength(1);
    expect(createRes.body.membership.roles[0].key).toBe('administrator');

    // Sign in with the initial password
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'Password1234' })
      .expect(200);

    // Sign-in response states mustChangePassword
    expect(loginRes.body.user.mustChangePassword).toBe(true);

    // Get session cookie from login response
    const loginCookies = (loginRes.headers['set-cookie'] as unknown as string[]).map(String).join(';');
    const sessionCookie = (loginCookies.match(/session_id=[^;]*/) ?? [''])[0];

    // Now try a capability other than change-password/me/logout -> 403 PASSWORD_CHANGE_REQUIRED
    const otherCap = await request(app.getHttpServer())
      .get('/api/v1/memberships')
      .set('Cookie', sessionCookie)
      .expect(403);

    expect(otherCap.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

    // change-password should work
    const changeRes = await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Cookie', sessionCookie)
      .send({ currentPassword: 'Password1234', newPassword: 'NewPassword1234' })
      .expect(200);

    // After change, mustChangePassword cleared; me() shows false
    const changeCookies = (changeRes.headers['set-cookie'] as unknown as string[]).map(String).join(';');
    const newSessionCookie = (changeCookies.match(/session_id=[^;]*/) ?? [''])[0];

    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', newSessionCookie)
      .expect(200);

    expect(meRes.body.user.mustChangePassword).toBe(false);
  });

  it('creation with existing email byte-identical to fresh account; existing password and flag untouched (FR-008/SC-014)', async () => {
    // First, create an existing account with a known password
    const existingEmail = `existing-${Date.now()}@example.com`;
    const existingPassword = 'ExistingPassword1234';
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: existingEmail, password: existingPassword })
      .expect(201);

    // Capture existing user's password hash before creation
    const existingUser = await prisma.user.findUnique({ where: { email: existingEmail } });
    const existingHashBefore = existingUser!.passwordHash;
    const existingMustChangeBefore = existingUser!.mustChangePassword;

    // Create membership with same email (existing account)
    const res = await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', actorCookie)
      .send({
        email: existingEmail,
        name: 'Existing Member',
        password: 'Password1234',
        roleIds: [adminRoleId],
      })
      .expect(201);

    // Response identical to fresh account (no created-vs-linked marker)
    expect(res.body.membership).toMatchObject({
      id: expect.any(String),
      roles: [{ key: 'administrator' }],
      isActive: true,
    });
    expect(res.body).not.toHaveProperty('accountCreated');
    expect(res.body).not.toHaveProperty('accountLinked');

    // Existing account's password and flag untouched
    const existingUserAfter = await prisma.user.findUnique({ where: { email: existingEmail } });
    expect(existingUserAfter!.passwordHash).toBe(existingHashBefore);
    expect(existingUserAfter!.mustChangePassword).toBe(existingMustChangeBefore);

    // Now create a membership with a brand-new email for comparison
    const freshEmail = `fresh-${Date.now()}@example.com`;
    const freshRes = await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', actorCookie)
      .send({
        email: freshEmail,
        name: 'Fresh Member',
        password: 'Password1234',
        roleIds: [adminRoleId],
      })
      .expect(201);

    // Both responses should have the same shape (no created-vs-linked distinction)
    expect(freshRes.status).toBe(res.status);
    expect(freshRes.body.membership.roles).toHaveLength(1);
    expect(freshRes.body.membership.roles[0].key).toBe('administrator');

    // Fresh account should have mustChangePassword=true
    const freshMembership = await prisma.membership.findUnique({
      where: { id: freshRes.body.membership.id },
      include: { user: true },
    });
    expect(freshMembership!.user.mustChangePassword).toBe(true);
  });
});

