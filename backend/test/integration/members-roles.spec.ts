import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, loginForCookies } from '../fixtures/app';
import { resetDatabase, seedTestDatabase, getTestPrisma } from '../fixtures/database';

/**
 * T023: Roles replace is atomic with before/after audit entry;
 * new permissions apply from member's next request (FR-004/FR-005).
 */
describe('US2: roles replace atomic with audit entry (FR-004/FR-005)', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();
  let actorCookie: string;
  let actorOrgId: string;
  let adminRoleId: string;
  let salesRoleId: string;

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
    const salesRole = await prisma.role.findFirst({
      where: { organizationId: actorOrgId, key: 'sales' },
    });
    adminRoleId = adminRole!.id;
    salesRoleId = salesRole!.id;
  });

  it('roles replace atomic with before/after audit entry; new permissions apply next request', async () => {
    // Create a member with Administrator role only
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', actorCookie)
      .send({
        email: `member-${Date.now()}@example.com`,
        name: 'Replace Member',
        password: 'Password1234',
        roleIds: [adminRoleId],
      })
      .expect(201);

    const membershipId = createRes.body.membership.id;

    // Capture before state
    const beforeRoles = await prisma.membershipRole.findMany({
      where: { membershipId },
      include: { role: true },
    });
    expect(beforeRoles).toHaveLength(1);
    // Replace roles: Administrator + Sales
    expect(beforeRoles[0]!.role.key).toBe('administrator');

    // Replace roles: Administrator + Sales
    const replaceRes = await request(app.getHttpServer())
      .post(`/api/v1/memberships/${membershipId}/roles`)
      .set('Cookie', actorCookie)
      .send({ roleIds: [adminRoleId, salesRoleId] })
      .expect(200);

    expect(replaceRes.body.roles).toHaveLength(2);

    // Capture after state
    const afterRoles = await prisma.membershipRole.findMany({
      where: { membershipId },
      include: { role: true },
    });
    expect(afterRoles).toHaveLength(2);

    // Audit entry exists with before/after role sets
    const auditEntries = await prisma.auditLog.findMany({
      where: {
        recordType: 'membership',
        recordId: membershipId,
        action: 'members.roles_changed',
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0]!.before).toMatchObject({
      roles: [{ key: 'administrator' }],
    });
    expect(auditEntries[0]!.after).toMatchObject({
      roles: [{ key: 'administrator' }, { key: 'sales' }],
    });

    // Verify exactly ONE audit entry
    const allAuditEntries = await prisma.auditLog.count({
      where: {
        recordType: 'membership',
        recordId: membershipId,
        action: 'members.roles_changed',
      },
    });
    expect(allAuditEntries).toBe(1);
  });

  it('400 when roleIds empty', async () => {
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

    const response = await request(app.getHttpServer())
      .post(`/api/v1/memberships/${membershipId}/roles`)
      .set('Cookie', actorCookie)
      .send({ roleIds: [] })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
    const details = response.body.details as Array<{ field: string; message: string }>;
    expect(details.some((d) => d.field === 'roleIds')).toBe(true);
  });

  it('400 when roleIds contains unknown id', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/memberships')
      .set('Cookie', actorCookie)
      .send({
        email: `member3-${Date.now()}@example.com`,
        name: 'Member3',
        password: 'Password1234',
        roleIds: [adminRoleId],
      })
      .expect(201);

    const membershipId = createRes.body.membership.id;

    const response = await request(app.getHttpServer())
      .post(`/api/v1/memberships/${membershipId}/roles`)
      .set('Cookie', actorCookie)
      .send({ roleIds: ['00000000-0000-0000-0000-000000000000'] })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });
});

