import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, loginForCookies } from '../fixtures/app';
import { resetDatabase, seedTestDatabase, getTestPrisma } from '../fixtures/database';

/**
 * T027: Membership id of another organization returns 404 on roles replace (SC-001).
 */
describe('US2: cross-organization 404 (SC-001)', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();
  let actorCookie: string;
  let actorOrgId: string;
  let adminRoleId: string;
  let otherOrgId: string;

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

    // Register actor with Administrator role in org 1
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

    // Register another user in org 2
    const otherRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: `other-${Date.now()}@example.com`, password: 'Password1234' })
      .expect(201);

    otherOrgId = otherRes.body.organization.id;
  });

  it('roles replace on membership of another org returns 404 (not 403)', async () => {
    // Get a membership from org 2
    const otherMembership = await prisma.membership.findFirst({
      where: { organizationId: otherOrgId },
      include: { user: true },
    });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/memberships/${otherMembership!.id}/roles`)
      .set('Cookie', actorCookie)
      .send({ roleIds: [adminRoleId] })
      .expect(404);

    expect(response.body.code).toBe('NOT_FOUND');
  });

  it('GET /memberships does not return other org memberships', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/memberships')
      .set('Cookie', actorCookie)
      .expect(200);

    // Only actor's own memberships should appear
    expect(response.body.memberships.length).toBe(1);
    // The actor's own membership
    expect(response.body.memberships[0].user.email).toContain('actor-');
  });
});

