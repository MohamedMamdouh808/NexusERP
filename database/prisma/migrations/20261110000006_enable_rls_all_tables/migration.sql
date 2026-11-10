-- Row-Level Security on all public tables (feature 006 fix).
--
-- Enables RLS with no policies on every public table except _prisma_migrations.
-- RLS is defence in depth: the application connects as postgres (bypasses RLS),
-- and Supabase API roles (anon, authenticated) see nothing because no policies
-- are created. A table with RLS enabled but no policies returns zero rows to
-- any non-superuser role.
--
-- This migration repairs the data left inconsistent by the earlier
-- 20261110000001_rbac_audit_log migration, which had RLS ALTER TABLE statements
-- that were never executed against the database (db push was used, then the
-- migration was marked as applied without running its SQL).

-- ---------------------------------------------------------------------------
-- Enable RLS on all application tables (idempotent: ALTER TABLE ENABLE ROW LEVEL
-- SECURITY is a no-op when RLS is already enabled)
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."document_sequences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."login_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."membership_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."role_template_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."role_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."warehouses" ENABLE ROW LEVEL SECURITY;
