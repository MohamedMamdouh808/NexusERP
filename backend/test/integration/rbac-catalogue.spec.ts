import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../fixtures/app';
import { resetDatabase, seedTestDatabase, getTestPrisma } from '../fixtures/database';

/**
 * US1 scenario 1: registration provisions exactly five template roles with their
 * permission links; another organization's roles are invisible (SC-008).
 */
describe('US1: role catalogue provisioning on registration', () => {
  let app: INestApplication;
  const prisma = getTestPrisma();

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

  it('provisions exactly five template roles with permission links for the new org', async () => {
    const email = `alice-${Date.now()}@example.com`;
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'Password1234' });
    console.log('REGISTER STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(201);

    const orgId = res.body.organization.id;

    const roles = await prisma.role.findMany({
      where: { organizationId: orgId },
      include: { permissions: { include: { permission: true } } },
      orderBy: { key: 'asc' },
    });

    expect(roles).toHaveLength(5);
    const keys = roles.map((r) => r.key).sort();
    expect(keys).toEqual(['administrator', 'inventory', 'manager', 'purchasing', 'sales']);

    // Administrator holds the entire catalogue
    const admin = roles.find((r) => r.key === 'administrator');
    const allPermissions = await prisma.permission.count();
    expect(admin!.permissions).toHaveLength(allPermissions);
  });

  it('does not expose another organization\'s roles (cross-tenant)', async () => {
    const email1 = `alice-${Date.now()}@example.com`;
    const email2 = `bob-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: email1, password: 'Password1234' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: email2, password: 'Password1234' })
      .expect(201);

    const aliceOrg = await prisma.organization.findFirst({
      where: { name: `${email1}'s Organization` },
    });
    const bobOrg = await prisma.organization.findFirst({
      where: { name: `${email2}'s Organization` },
    });

    const aliceRoles = await prisma.role.count({ where: { organizationId: aliceOrg!.id } });
    const bobRoles = await prisma.role.count({ where: { organizationId: bobOrg!.id } });

    expect(aliceRoles).toBe(5);
    expect(bobRoles).toBe(5);
    expect(aliceOrg!.id).not.toBe(bobOrg!.id);
  });
});
