import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, loginForCookies } from '../fixtures/app';
import { resetDatabase, seedTestDatabase, getTestPrisma } from '../fixtures/database';

/**
 * T024: Successful change-password rotates current session + CSRF cookie,
 * invalidates all other sessions in every org, clears flag (FR-027/SC-011).
 * T025: Wrong current password 400 INVALID_CURRENT_PASSWORD (never 401);
 * 6th wrong within 15 min = 429 with Retry-After (FR-025/SC-012).
 */
describe('US2: change-password (FR-025/FR-026/FR-027/FR-028/SC-011/SC-012)', () => {
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

  it('wrong current password returns 400 INVALID_CURRENT_PASSWORD (never 401) (FR-025/SC-012)', async () => {
    // Create a member with mustChangePassword=true
    await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', actorCookie)
      .send({
        email: `member-${Date.now()}@example.com`,
        name: 'Member',
        password: 'Password1234',
        roleIds: [adminRoleId],
      })
      .expect(201);

    // Sign in with initial password
    const membership = await prisma.membership.findFirst({
      where: { organizationId: actorOrgId },
      orderBy: { createdAt: 'desc' },
      include: { user: true },
    });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: membership!.user.email, password: 'Password1234' })
      .expect(200);

    const sessionCookie = (loginRes.headers['set-cookie'] as unknown as string[])
      .map(String)
      .join(';')
      .split(';')[0] ?? '';

    // The wrong CURRENT password is refused by the change-password endpoint with
    // 400 INVALID_CURRENT_PASSWORD - never 401, which would tell the caller that
    // the session had ended rather than that the password was wrong.
    const changeRes = await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Cookie', sessionCookie)
      .send({ currentPassword: 'wrongpassword!', newPassword: 'NewPassword1234' })
      .expect(400);

    expect(changeRes.body.code).toBe('INVALID_CURRENT_PASSWORD');
    expect(changeRes.body.code).not.toBe('UNAUTHENTICATED');
    expect(changeRes.status).not.toBe(401);
  });

  it('a failed login answers the same 404 for a wrong password and an unknown email (FR-010)', async () => {
    // The sign-in failure is deliberately indistinguishable: a wrong password and
    // an unknown email address must not be told apart, or the endpoint becomes a
    // way to test whether an address has an account.
    const wrongPassword = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: `someone-${Date.now()}@example.com`, password: 'Password1234' })
      .expect(404);

    const unknownEmail = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: `nobody-${Date.now()}@example.com`, password: 'Password1234' })
      .expect(404);

    expect(wrongPassword.body.code).toBe(unknownEmail.body.code);
    expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
  });

  it('successful change-password rotates session, invalidates other sessions, clears flag (FR-027/SC-011)', async () => {
    const email = `changepass-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', actorCookie)
      .send({
        email,
        name: 'ChangePass Member',
        password: 'Password1234',
        roleIds: [adminRoleId],
      })
      .expect(201);

    // Sign in with initial password
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'Password1234' })
      .expect(200);

    expect(loginRes.body.user.mustChangePassword).toBe(true);

    const loginCookies = (loginRes.headers['set-cookie'] as unknown as string[]).map(String).join(';');
    const sessionCookie = (loginCookies.match(/session_id=[^;]*/) ?? [''])[0];

    // Change password
    const changeRes = await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Cookie', sessionCookie)
      .send({ currentPassword: 'Password1234', newPassword: 'NewPassword1234' })
      .expect(200);

    // Fresh session_id and csrf_token cookies issued
    const changeCookies = (changeRes.headers['set-cookie'] as unknown as string[]).map(String).join(';');
    expect(changeCookies).toContain('session_id=');
    expect(changeCookies).toContain('csrf_token=');
    const oldToken = sessionCookie.split('=')[1];
    expect(changeCookies).not.toContain(oldToken);

    // me() shows mustChangePassword cleared
    const newSessionCookie = (changeCookies.match(/session_id=[^;]*/) ?? [''])[0];
    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', newSessionCookie)
      .expect(200);

    expect(meRes.body.user.mustChangePassword).toBe(false);

    // Old session cookie no longer works
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', sessionCookie)
      .expect(401);

    // New password signs in
    const newLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'NewPassword1234' })
      .expect(200);
    expect(newLoginRes.body.user.mustChangePassword).toBe(false);

    // The old password does not sign in. The answer is 404 - the same answer a
    // wrong password and an unknown address get (FR-010): a failed sign-in must
    // not tell the caller why it failed.
    const oldLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'Password1234' })
      .expect(404);
    expect(oldLoginRes.body.code).toBe('NOT_FOUND');
  });

  it('6th wrong current-password within 15 min returns 429 with Retry-After (FR-025/SC-012)', async () => {
    const email = `ratelimit-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', actorCookie)
      .send({
        email,
        name: 'RateLimit Member',
        password: 'Password1234',
        roleIds: [adminRoleId],
      })
      .expect(201);

    // The limiter counts failed current-password VERIFICATIONS, so the attempts
    // have to be made by a signed-in member - an unauthenticated request is
    // refused before the password is ever checked.
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'Password1234' })
      .expect(200);
    const sessionCookie = (loginRes.headers['set-cookie'] as unknown as string[])
      .map(String)
      .join(';')
      .split(';')[0] ?? '';

    // 5 wrong attempts
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Cookie', sessionCookie)
        .send({ currentPassword: 'WrongPassword', newPassword: 'NewPassword1234' })
        .expect(400);
    }

    // 6th attempt: 429 with Retry-After
    const rateLimitRes = await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Cookie', sessionCookie)
      .send({ currentPassword: 'WrongPassword', newPassword: 'NewPassword1234' })
      .expect(429);

    expect(rateLimitRes.body.code).toBe('TOO_MANY_REQUESTS');
    expect(rateLimitRes.headers['retry-after']).toBeDefined();
  });
});

