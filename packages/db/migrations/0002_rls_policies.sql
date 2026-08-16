-- Row-level security. Hand-authored rather than generated, because this is the file that
-- decides whether one studio can read another's data, and it must be reviewable as plain
-- SQL sitting next to the assertions that verify it (scripts/db/assert-tenancy.sql).
--
-- Four rules, each of which is a real failure mode rather than boilerplate:
--
--   1. ENABLE ROW LEVEL SECURITY        - without it, policies are inert
--   2. FORCE ROW LEVEL SECURITY         - without it, the table OWNER bypasses every
--                                         policy, so migrations and admin scripts read
--                                         across all tenants
--   3. USING *and* WITH CHECK           - USING alone filters reads and blocks updating
--                                         someone else's row, but still permits INSERTING
--                                         a row stamped with another studio's id
--   4. NULL context denies              - current_setting(..., true) returns NULL when
--                                         unset; every comparison against NULL is NULL,
--                                         which is not true, so an unpinned connection
--                                         sees nothing. That is the safe direction.

-- Resolves the studio pinned by withTenant(). STABLE, so the planner evaluates it once per
-- query rather than once per row. Empty string is treated as unset so runAsSystem() can
-- clear the context without dropping the setting entirely.
CREATE OR REPLACE FUNCTION current_studio_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.studio_id', true), '')::uuid $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------
-- studios - the tenant root. The ONLY tenant-scoped table without a studio_id column:
-- its own id IS the tenant key. assert-tenancy.sql knows this exception by name.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "studios" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "studios" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "studios_tenant_isolation" ON "studios"
  FOR ALL
  USING ("id" = current_studio_id())
  WITH CHECK ("id" = current_studio_id());
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------
-- gyms, memberships, attendance - ordinary tenant tables, scoped by studio_id.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "gyms" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "gyms" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "gyms_tenant_isolation" ON "gyms"
  FOR ALL
  USING ("studio_id" = current_studio_id())
  WITH CHECK ("studio_id" = current_studio_id());
--> statement-breakpoint

ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "memberships_tenant_isolation" ON "memberships"
  FOR ALL
  USING ("studio_id" = current_studio_id())
  WITH CHECK ("studio_id" = current_studio_id());
--> statement-breakpoint

ALTER TABLE "attendance" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "attendance" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "attendance_tenant_isolation" ON "attendance"
  FOR ALL
  USING ("studio_id" = current_studio_id())
  WITH CHECK ("studio_id" = current_studio_id());
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------
-- users - GLOBAL. Identity is one row per phone across all of Forge, which is what lets a
-- trainer work at two studios without becoming two accounts.
--
-- It still gets RLS, because "global" must not mean "any studio-scoped bug can enumerate
-- every phone number in the platform". A row is visible when:
--
--   (a) a studio is pinned AND that studio has a membership for the user, or
--   (b) no studio is pinned at all - the authentication path, which must look a user up by
--       phone BEFORE it knows which studio they are signing into. That path runs through
--       runAsSystem(), which logs every call with a reason.
--
-- The EXISTS subquery is itself subject to memberships' policy, so it can only ever match
-- memberships in the pinned studio. No recursion: memberships' policy does not read users.
--
-- WITH CHECK deliberately permits inserts with no studio pinned - registration creates the
-- user row before any membership exists.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "users_visible_within_studio" ON "users"
  FOR ALL
  USING (
    current_studio_id() IS NULL
    OR EXISTS (
      SELECT 1 FROM "memberships" m
      WHERE m."user_id" = "users"."id"
        AND m."studio_id" = current_studio_id()
    )
  )
  WITH CHECK (
    current_studio_id() IS NULL
    OR EXISTS (
      SELECT 1 FROM "memberships" m
      WHERE m."user_id" = "users"."id"
        AND m."studio_id" = current_studio_id()
    )
  );
--> statement-breakpoint

-- Supports the EXISTS above without a per-row scan of memberships.
CREATE INDEX IF NOT EXISTS "memberships_user_id_studio_id_idx"
  ON "memberships" USING btree ("user_id", "studio_id");
