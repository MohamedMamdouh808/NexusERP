-- Repairs applied databases whose compound tables were created by earlier,
-- partially-authored versions of the auth migrations (a composite unique the
-- schema declares, the final foreign-key name on role_permissions, and the
-- roles->organizations foreign key). Every statement is conditional so this
-- migration is a harmless no-op on databases the fixed chain already created
-- correctly. The auth migration itself was also corrected, so freshly migrated
-- databases already have these objects.
CREATE UNIQUE INDEX IF NOT EXISTS "memberships_userId_organizationId_key" ON "memberships" ("userId", "organizationId");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'role_permissions'::regclass AND conname = 'role_permissions_permission_fkey'
  ) THEN
    ALTER TABLE "role_permissions" RENAME CONSTRAINT "role_permissions_permission_fkey" TO "role_permissions_permissionId_fkey";
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'roles'::regclass AND conname = 'roles_organizationId_fkey'
  ) THEN
    ALTER TABLE "roles" ADD CONSTRAINT "roles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
