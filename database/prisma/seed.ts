/**
 * Reference-data seed.
 *
 * The single seeding entry point for every environment. Invoked by `npm run db:seed`
 * and by Prisma's own seed hook.
 *
 * Idempotent by construction: every write is an upsert keyed on a natural unique key,
 * and the whole thing runs in ONE transaction. Running it twice creates no duplicate
 * permission, no duplicate role template, and no duplicate grant - which is what makes
 * it safe to re-run on every startup and in CI (FR-018).
 *
 * The catalog itself is defined once in `@nexuserp/shared` as version-controlled
 * constants. The AccessControl feature will materialize organization-owned roles from
 * the same constants rather than restating them, so the two cannot disagree
 * (research.md R-016).
 *
 * A tenant-bearing demonstration workspace is NOT created here. It requires the
 * `Organization` table, which belongs to the organization feature (FR-019).
 */

import { PrismaClient } from '@prisma/client';
import {
  PERMISSION_CATALOG,
  ROLE_TEMPLATES,
  type PermissionDefinition,
  type RoleTemplateDefinition,
} from '@nexuserp/shared';

const prisma = new PrismaClient();

/** Fails loudly on a catalog defect rather than loading a partial catalog. */
function assertCatalogIsWellFormed(): void {
  const codes = PERMISSION_CATALOG.map((permission) => permission.code);
  const duplicates = codes.filter((code, index) => codes.indexOf(code) !== index);
  if (duplicates.length > 0) {
    throw new Error(
      `Permission catalog contains duplicate codes: ${[...new Set(duplicates)].join(', ')}. ` +
        'A code must never be defined twice: redefinition silently changes the meaning of a ' +
        'permission already granted to a role.',
    );
  }

  const known = new Set(codes);
  for (const role of ROLE_TEMPLATES) {
    const unknown = role.permissions.filter((code) => !known.has(code));
    if (unknown.length > 0) {
      throw new Error(
        `Role template "${role.key}" grants permissions that are not in the catalog: ` +
          `${unknown.join(', ')}. Add the permission first, or remove the grant.`,
      );
    }
  }
}

async function upsertPermission(
  target: PrismaClient,
  permission: PermissionDefinition,
): Promise<string> {
  const record = await target.permission.upsert({
    where: { code: permission.code },
    update: {
      module: permission.module,
      description: permission.description,
    },
    create: {
      code: permission.code,
      module: permission.module,
      description: permission.description,
    },
  });
  return record.id;
}

async function upsertRoleTemplate(
  target: PrismaClient,
  role: RoleTemplateDefinition,
  permissionIdByCode: ReadonlyMap<string, string>,
): Promise<string> {
  const record = await target.roleTemplate.upsert({
    where: { key: role.key },
    update: {
      name: role.name,
      description: role.description,
      isSystem: true,
    },
    create: {
      key: role.key,
      name: role.name,
      description: role.description,
      isSystem: true,
    },
  });

  // The composite primary key makes a duplicate grant impossible; an upsert keyed on
  // the pair keeps a re-run from failing on a grant it already made.
  for (const code of role.permissions) {
    const permissionId = permissionIdByCode.get(code);
    if (!permissionId) {
      throw new Error(`Permission "${code}" granted by "${role.key}" was not loaded.`);
    }
    await target.roleTemplatePermission.upsert({
      where: {
        roleTemplateId_permissionId: { roleTemplateId: record.id, permissionId },
      },
      update: {},
      create: { roleTemplateId: record.id, permissionId },
    });
  }

  return record.id;
}

/**
 * Loads the reference catalog. Safe to call repeatedly.
 *
 * Exported so an integration test can seed the SAME code path in-process, rather than
 * spawning `npx tsx prisma/seed.ts` as a subprocess. Running the identical function is
 * what makes the idempotency test meaningful: a test that exercised a copy of the logic
 * would prove nothing about the script that ships.
 */
export async function seed(target: PrismaClient = prisma): Promise<SeedSummary> {
  assertCatalogIsWellFormed();

  // One transaction: a partial seed is impossible (Constitution Principle III).
  await target.$transaction(async () => {
    const permissionIdByCode = new Map<string, string>();

    for (const permission of PERMISSION_CATALOG) {
      permissionIdByCode.set(permission.code, await upsertPermission(target, permission));
    }

    for (const role of ROLE_TEMPLATES) {
      await upsertRoleTemplate(target, role, permissionIdByCode);
    }
  });

  const [permissionCount, roleCount, grantCount] = await Promise.all([
    target.permission.count(),
    target.roleTemplate.count(),
    target.roleTemplatePermission.count(),
  ]);

  return { permissionCount, roleCount, grantCount };
}

export interface SeedSummary {
  permissionCount: number;
  roleCount: number;
  grantCount: number;
}

async function main(): Promise<void> {
  const summary = await seed();
  console.log(
    `Seeded ${PERMISSION_CATALOG.length} permissions and ${ROLE_TEMPLATES.length} role templates.`,
  );
  console.log(
    `Reference data now contains ${summary.permissionCount} permissions, ` +
      `${summary.roleCount} role templates, and ${summary.grantCount} grants.`,
  );
}

// Only run when invoked directly. Importing this module from a test must NOT seed.
const invokedDirectly = (() => {
  const entry = process.argv[1] ?? '';
  return entry.endsWith('seed.ts') || entry.endsWith('seed.js');
})();

if (invokedDirectly) {
  main()
    .catch((error: unknown) => {
      console.error('Seeding failed:', error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => {
      void prisma.$disconnect();
    });
}