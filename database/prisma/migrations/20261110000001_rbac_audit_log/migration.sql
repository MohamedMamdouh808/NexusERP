-- RBAC and audit log (feature 006).
--
-- Order matters: backfill membership_roles BEFORE dropping memberships.roleKey.

-- 1. Delete stale NULL-organization roles (empty role_permissions, no members).
DELETE FROM "roles" WHERE "organizationId" IS NULL;

-- 2. roles: organizationId becomes NOT NULL.
ALTER TABLE "roles" ALTER COLUMN "organizationId" SET NOT NULL;

-- 3. roles: replace global unique on key with composite unique (organizationId, key).
DROP INDEX "roles_key_key";
CREATE UNIQUE INDEX "roles_organizationId_key_key" ON "roles"("organizationId", "key");

-- 4. roles: tighten FK cascade (was ON DELETE SET NULL).
ALTER TABLE "roles" DROP CONSTRAINT "roles_organizationId_fkey";
ALTER TABLE "roles" ADD CONSTRAINT "roles_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. memberships: add composite unique (id, organizationId) for MembershipRole FK reference.
CREATE UNIQUE INDEX "memberships_id_organizationId_key" ON "memberships"("id", "organizationId");

-- 6. roles: add composite unique (id, organizationId) for MembershipRole FK reference.
CREATE UNIQUE INDEX "roles_id_organizationId_key" ON "roles"("id", "organizationId");

-- 7. Create membership_roles join table.
CREATE TABLE "membership_roles" (
    "membershipId" uuid NOT NULL,
    "roleId" uuid NOT NULL,
    "organizationId" uuid NOT NULL,
    "createdAt" timestamp(6) NOT NULL DEFAULT now(),
    CONSTRAINT "membership_roles_pkey" PRIMARY KEY ("membershipId", "roleId"),
    CONSTRAINT "membership_roles_organizationId_membershipId_roleId_key" UNIQUE ("organizationId", "membershipId", "roleId"),
    CONSTRAINT "membership_roles_membershipId_organizationId_fkey"
      FOREIGN KEY ("membershipId", "organizationId")
      REFERENCES "memberships"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "membership_roles_roleId_organizationId_fkey"
      FOREIGN KEY ("roleId", "organizationId")
      REFERENCES "roles"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "membership_roles_organizationId_roleId_idx" ON "membership_roles"("organizationId", "roleId");
CREATE INDEX "membership_roles_organizationId_membershipId_idx" ON "membership_roles"("organizationId", "membershipId");

-- 8. Backfill membership_roles from memberships.roleKey (idempotent via ON CONFLICT).
INSERT INTO "membership_roles" ("membershipId", "roleId", "organizationId", "createdAt")
SELECT m."id", r."id", m."organizationId", m."createdAt"
FROM "memberships" m
JOIN "roles" r ON r."organizationId" = m."organizationId" AND r."key" = m."roleKey"
ON CONFLICT ("membershipId", "roleId") DO NOTHING;

-- 9. memberships: drop superseded roleKey column.
ALTER TABLE "memberships" DROP COLUMN "roleKey";

-- 10. users: add mustChangePassword flag.
ALTER TABLE "users" ADD COLUMN "mustChangePassword" boolean NOT NULL DEFAULT false;

-- 11. Create audit_logs table (append-only; organizationId/userId nullable for anonymous events).
CREATE TABLE "audit_logs" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" uuid,
    "userId" uuid,
    "action" varchar(64) NOT NULL,
    "recordType" varchar(64) NOT NULL,
    "recordId" uuid,
    "before" jsonb,
    "after" jsonb,
    "clientAddress" varchar(64),
    "reasonCode" varchar(32),
    "unknownAccountHash" varchar(64),
    "unknownAccountMarker" varchar(128),
    "createdAt" timestamp(6) NOT NULL DEFAULT now(),
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audit_logs_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "audit_logs_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "audit_logs_organizationId_createdAt_idx" ON "audit_logs"("organizationId", "createdAt");
CREATE INDEX "audit_logs_organizationId_userId_idx" ON "audit_logs"("organizationId", "userId");
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- 12. Row-Level Security on new tables, no policies (FR-023).
--    Following the existing pattern: RLS enabled with zero policies means
--    Supabase API roles (anon, authenticated) see/modify nothing; the app
--    connects as postgres and bypasses RLS. Append-only for the application
--    role is enforced by the absence of any UPDATE/DELETE endpoint or service
--    method on audit_logs (no mutation path exists in code).
ALTER TABLE "public"."membership_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;
