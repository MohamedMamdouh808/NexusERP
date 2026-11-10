-- RBAC backfill: roles, role_permissions, and membership assignments (feature 006 fix).
--
-- This migration NEVER edits an applied migration. It is a new migration that
-- repairs the data left inconsistent by the earlier rbac_audit_log migration,
-- which created roles for only 9 organizations and left role_permissions empty.
--
-- After this migration:
--   * Every organization has the five default roles with permission links
--     copied from the role templates (role_permissions is not empty).
--   * The earliest ACTIVE membership of each organization is an Administrator.
--   * Every other ACTIVE membership without a role is deactivated (with an
--     audit entry) instead of being assigned a guessed role.
--   * No ACTIVE membership is without a role.

-- ---------------------------------------------------------------------------
-- 1. Backfill role_permissions for all existing roles from role_templates.
--    Idempotent: ON CONFLICT DO NOTHING keeps re-runs safe.
-- ---------------------------------------------------------------------------
INSERT INTO "role_permissions" ("roleId", "permissionId", "createdAt")
SELECT r."id", p."id", now()
FROM "roles" r
JOIN "role_templates" rt ON rt."key" = r."key"
JOIN "role_template_permissions" rtp ON rtp."roleTemplateId" = rt."id"
JOIN "permissions" p ON p."id" = rtp."permissionId"
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Create missing roles for every organization (5 per org from templates).
--    Idempotent: skips roles that already exist for the organization.
-- ---------------------------------------------------------------------------
INSERT INTO "roles" ("id", "key", "name", "description", "isSystem", "organizationId", "createdAt")
SELECT gen_random_uuid(), rt."key", rt."name", rt."description", true, o."id", now()
FROM "organizations" o
CROSS JOIN "role_templates" rt
WHERE NOT EXISTS (
  SELECT 1 FROM "roles" r2
  WHERE r2."organizationId" = o."id" AND r2."key" = rt."key"
);

-- ---------------------------------------------------------------------------
-- 3. Backfill role_permissions for newly created roles.
--    Idempotent: ON CONFLICT DO NOTHING.
-- ---------------------------------------------------------------------------
INSERT INTO "role_permissions" ("roleId", "permissionId", "createdAt")
SELECT r."id", p."id", now()
FROM "roles" r
JOIN "role_templates" rt ON rt."key" = r."key"
JOIN "role_template_permissions" rtp ON rtp."roleTemplateId" = rt."id"
JOIN "permissions" p ON p."id" = rtp."permissionId"
WHERE NOT EXISTS (
  SELECT 1 FROM "role_permissions" rp2
  WHERE rp2."roleId" = r."id" AND rp2."permissionId" = p."id"
);

-- ---------------------------------------------------------------------------
-- 4. Assign Administrator role to the earliest ACTIVE membership of each
--    organization that does not already have a role.
--    Idempotent: ON CONFLICT DO NOTHING.
-- ---------------------------------------------------------------------------
INSERT INTO "membership_roles" ("membershipId", "roleId", "organizationId", "createdAt")
SELECT em."membershipId", r."id", em."organizationId", m."createdAt"
FROM (
  SELECT DISTINCT ON (m."organizationId")
    m."id" AS "membershipId",
    m."organizationId",
    m."createdAt"
  FROM "memberships" m
  WHERE m."isActive" = true
    AND NOT EXISTS (
      SELECT 1 FROM "membership_roles" mr WHERE mr."membershipId" = m."id"
    )
  ORDER BY m."organizationId", m."createdAt" ASC
) em
JOIN "memberships" m ON m."id" = em."membershipId"
JOIN "roles" r ON r."organizationId" = em."organizationId" AND r."key" = 'administrator'
ON CONFLICT ("membershipId", "roleId") DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Audit-log the deactivation of every remaining ACTIVE membership that has
--    no role. userId is NULL because this is a system-initiated backfill, not
--    an actor-driven action.
-- ---------------------------------------------------------------------------
INSERT INTO "audit_logs" (
  "organizationId", "userId", "action", "recordType", "recordId",
  "before", "after", "createdAt"
)
SELECT m."organizationId", NULL, 'members.deactivated', 'membership', m."id",
  jsonb_build_object('isActive', true),
  jsonb_build_object('isActive', false),
  now()
FROM "memberships" m
WHERE m."isActive" = true
  AND NOT EXISTS (
    SELECT 1 FROM "membership_roles" mr WHERE mr."membershipId" = m."id"
  );

-- ---------------------------------------------------------------------------
-- 6. Deactivate every remaining ACTIVE membership that has no role.
-- ---------------------------------------------------------------------------
UPDATE "memberships" m
SET "isActive" = false
WHERE m."isActive" = true
  AND NOT EXISTS (
    SELECT 1 FROM "membership_roles" mr WHERE mr."membershipId" = m."id"
  );
