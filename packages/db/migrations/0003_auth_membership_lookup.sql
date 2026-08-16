-- The one cross-studio read the product genuinely requires.
--
-- THE PROBLEM
--
-- Sign-in has a chicken-and-egg shape. To pin a studio we must first know which studios the
-- caller belongs to — but `memberships` is tenant-scoped, so with no studio pinned its
-- policy denies everything. The lookup that decides the tenant cannot itself be
-- tenant-scoped.
--
-- WHAT WAS REJECTED
--
--   * A BYPASSRLS role owning a SECURITY DEFINER function. Works, but reintroduces a role
--     that can read everything, which is what ADR 0003 set out to avoid. FORCE ROW LEVEL
--     SECURITY also means the table owner is already subject to policies, so the function
--     would need a genuine bypass to be useful.
--   * An `is_platform_admin`-style GUC checked in every policy. This is the backdoor the
--     founders explicitly rejected: one place that sets the flag wrongly exposes every
--     tenant at once.
--
-- WHAT THIS DOES INSTEAD
--
-- A second GUC, `app.auth_user_id`, readable ONLY when no studio is pinned. It widens
-- nothing while a studio IS pinned — during ordinary request handling these policies are
-- unreachable, because `current_studio_id() IS NULL` is false.
--
-- The exposure is deliberately tiny: for one user id, the ids, roles and studio names of
-- their own memberships. No member lists, no attendance, no billing — nothing operational
-- crosses a studio boundary. It is the same shape as the existing users policy, which
-- already permits an unpinned read for the authentication path.
--
-- Set exclusively by withUser() in @forge/db, which never sets a studio at the same time.

CREATE OR REPLACE FUNCTION current_auth_user_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.auth_user_id', true), '')::uuid $$;
--> statement-breakpoint

-- A user may enumerate their OWN memberships, and only with no studio pinned.
-- SELECT only: this path must never be able to create or change a membership.
CREATE POLICY "memberships_self_lookup" ON "memberships"
  FOR SELECT
  USING (
    current_studio_id() IS NULL
    AND current_auth_user_id() IS NOT NULL
    AND "user_id" = current_auth_user_id()
  );
--> statement-breakpoint

-- ...and read the name of a studio they hold a membership in, so the app can render a
-- studio switcher. Bounded by the same membership check, so it cannot enumerate studios.
CREATE POLICY "studios_visible_to_members" ON "studios"
  FOR SELECT
  USING (
    current_studio_id() IS NULL
    AND current_auth_user_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM "memberships" m
      WHERE m."studio_id" = "studios"."id"
        AND m."user_id" = current_auth_user_id()
        AND m."deleted_at" IS NULL
    )
  );
--> statement-breakpoint

-- Supports both policies without a per-row scan.
CREATE INDEX IF NOT EXISTS "memberships_user_id_status_idx"
  ON "memberships" USING btree ("user_id", "status");
