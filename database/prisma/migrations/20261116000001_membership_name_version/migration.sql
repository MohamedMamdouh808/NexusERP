-- Add a nullable, per-membership display name and a version counter for
-- stale-update protection (feature 014). No new tables. Existing memberships
-- keep name = NULL and version = 1.
ALTER TABLE "memberships"
  ADD COLUMN "name" VARCHAR(100) NULL,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- Backfill is implicit (DEFAULT 1); make the default stick for future rows.
-- (default already set above)
