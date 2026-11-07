-- Enable Row-Level Security on every table in the public schema as defence in depth.
-- The application connects as postgres (which bypasses RLS), and the Supabase API roles
-- then see nothing because no policies are created. RLS is enabled but with zero
-- policies: every row is invisible to roles subject to RLS, which is the correct
-- default-deny posture until policies are explicitly granted.
--
-- No policies are added here. A table with RLS enabled but no policies returns zero
-- rows to any non-superuser role, which is exactly what we want before the Supabase
-- API roles and their policies are defined.

ALTER TABLE "public"."permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."role_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."role_template_permissions" ENABLE ROW LEVEL SECURITY;
