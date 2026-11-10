import type { INestApplication } from '@nestjs/common';
import { createTestApp } from '../fixtures/app';
import { resetDatabase, seedTestDatabase, getTestPrisma } from '../fixtures/database';
import { AccessControlService } from '../../src/modules/access-control/access-control.service';

/**
 * US1 scenario 3: a membership holding Sales + Inventory resolves the union
 * of both roles' permission sets (FR-003).
 */
describe('US1: effective permissions are the union of held roles', () => {
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

  it('resolves the union of permissions for a multi-role membership', async () => {
    const org = await prisma.organization.create({
      data: { name: 'Union Org' },
    });

    const accessControl = app.get(AccessControlService);
    await accessControl.grantDefaultRolesAndPermissions(org.id);

    const salesRole = await prisma.role.findFirst({
      where: { organizationId: org.id, key: 'sales' },
    });
    const inventoryRole = await prisma.role.findFirst({
      where: { organizationId: org.id, key: 'inventory' },
    });

    const user = await prisma.user.create({
      data: { email: 'union@example.com', passwordHash: 'hash' },
    });

    const membership = await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: org.id,
        isActive: true,
      },
    });

    // Link membership to both Sales and Inventory roles
    await prisma.membershipRole.create({
      data: {
        membershipId: membership.id,
        roleId: salesRole!.id,
        organizationId: org.id,
      },
    });
    await prisma.membershipRole.create({
      data: {
        membershipId: membership.id,
        roleId: inventoryRole!.id,
        organizationId: org.id,
      },
    });

    // Resolve effective permissions
    const permissions = await prisma.permission.findMany({
      where: {
        rolePermissions: {
          some: {
            role: {
              memberships: {
                some: { membershipId: membership.id },
              },
            },
          },
        },
      },
      select: { code: true },
    });

    const codes = permissions.map((p) => p.code).sort();

    // Sales permissions
    const salesPerms = await prisma.rolePermission.findMany({
      where: { roleId: salesRole!.id },
      include: { permission: true },
    });

    // Inventory permissions
    const inventoryPerms = await prisma.rolePermission.findMany({
      where: { roleId: inventoryRole!.id },
      include: { permission: true },
    });

    const expected = Array.from(
      new Set([...salesPerms, ...inventoryPerms].map((rp) => rp.permission.code)),
    ).sort();

    expect(codes).toEqual(expected);
    // Union should have more permissions than either role alone
    expect(codes.length).toBeGreaterThan(salesPerms.length);
    expect(codes.length).toBeGreaterThan(inventoryPerms.length);
  });
});
