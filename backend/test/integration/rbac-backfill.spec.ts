import type { INestApplication } from '@nestjs/common';
import { createTestApp } from '../fixtures/app';
import { resetDatabase, seedTestDatabase, getTestPrisma } from '../fixtures/database';
import { AccessControlService } from '../../src/modules/access-control/access-control.service';
/**
 * US1 scenario 2: backfill adds exactly five roles to a pre-existing organization
 * and a second run creates no duplicates (SC-008).
 */
describe('US1: backfill idempotency via access control service', () => {
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

  it('adds exactly five roles to a pre-existing organization', async () => {
    const org = await prisma.organization.create({
      data: { name: 'Pre-existing Org' },
    });

    const accessControl = app.get(AccessControlService);
    await accessControl.grantDefaultRolesAndPermissions(org.id);

    const roles = await prisma.role.findMany({
      where: { organizationId: org.id },
      orderBy: { key: 'asc' },
    });

    expect(roles).toHaveLength(5);
    expect(roles.map((r) => r.key).sort()).toEqual([
      'administrator',
      'inventory',
      'manager',
      'purchasing',
      'sales',
    ]);
  });

  it('creates no duplicates when run twice', async () => {
    const org = await prisma.organization.create({
      data: { name: 'Idempotent Org' },
    });

    const accessControl = app.get(AccessControlService);
    await accessControl.grantDefaultRolesAndPermissions(org.id);
    await accessControl.grantDefaultRolesAndPermissions(org.id);

    const roles = await prisma.role.findMany({
      where: { organizationId: org.id },
    });

    expect(roles).toHaveLength(5);
    const keyCounts = roles.reduce(
      (acc, r) => ({ ...acc, [r.key]: (acc[r.key] ?? 0) + 1 }),
      {} as Record<string, number>,
    );
    expect(Object.values(keyCounts).every((c) => c === 1)).toBe(true);
  });
});
