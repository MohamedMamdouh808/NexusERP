-- RBAC fix: ensure earliest ACTIVE membership of each organization is Administrator.
--
-- Migration 20261110000002 assigned Administrator to the earliest membership of
-- each org that had NO roles at all. But some organizations' earliest membership
-- already had non-Administrator roles (e.g. from pre-existing data), so those
-- were skipped. This migration adds Administrator to the earliest ACTIVE
-- membership of every organization that doesn't already have one.
-- Idempotent: ON CONFLICT DO NOTHING.

INSERT INTO "membership_roles" ("membershipId", "roleId", "organizationId", "createdAt")
SELECT em."membershipId", r."id", em."organizationId", m."createdAt"
FROM (
  SELECT DISTINCT ON (m."organizationId")
    m."id" AS "membershipId",
    m."organizationId",
    m."createdAt"
  FROM "memberships" m
  WHERE m."isActive" = true
  ORDER BY m."organizationId", m."createdAt" ASC
) em
JOIN "memberships" m ON m."id" = em."membershipId"
JOIN "roles" r ON r."organizationId" = em."organizationId" AND r."key" = 'administrator'
WHERE NOT EXISTS (
  SELECT 1 FROM "membership_roles" mr
  WHERE mr."membershipId" = em."membershipId"
    AND mr."roleId" = r."id"
)
ON CONFLICT ("membershipId", "roleId") DO NOTHING;
