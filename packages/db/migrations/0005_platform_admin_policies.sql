-- Row-level security and value constraints for the two platform-admin tables.
--
-- Hand-authored for the same reason as 0002: this file decides who can read the list of
-- people who can see every tenant on the platform, and it must be reviewable as plain SQL
-- next to the assertions that verify it (scripts/db/assert-tenancy.sql).
--
-- THE POLICY IS THE MIRROR IMAGE OF THE TENANT ONE
--
-- Every other table asks "is this row's studio the pinned studio?". A platform admin belongs
-- to no studio, so there is no such comparison to make. What replaces it:
--
--   these rows are visible ONLY when NO studio is pinned
--
-- During ordinary request handling a studio is always pinned, so both tables are completely
-- invisible — not filtered, invisible. A bug in any tenant-scoped query, an over-broad JOIN,
-- a hand-written report that forgot a WHERE clause: none of them can reach the platform's
-- administrators or their phone numbers, because the policy denies before filtering begins.
--
-- The only door left open is runAsSystem() in @forge/db, which clears the studio setting and
-- logs every single call with a reason. That is the same narrow, audited path sign-in
-- already uses to find a user by phone, and it is deliberately noisy.
--
-- Fail direction is safe. If this policy is wrong in the restrictive direction, admin
-- sign-in breaks loudly on the first attempt. If the tenant policies were wrong in the same
-- way, data would leak quietly.

-- ---------------------------------------------------------------------------------------
-- platform_admins
-- ---------------------------------------------------------------------------------------
ALTER TABLE "platform_admins" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "platform_admins" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- FORCE matters more here than anywhere else in the schema. Without it the table OWNER
-- (forge_migrator) bypasses the policy, so any migration or one-off admin script would read
-- and write the platform's administrator list while the wall looked intact from the app.
CREATE POLICY "platform_admins_unpinned_only" ON "platform_admins"
  FOR ALL
  USING (current_studio_id() IS NULL)
  WITH CHECK (current_studio_id() IS NULL);
--> statement-breakpoint

-- Mirrors PLATFORM_ADMIN_STATUS in schema/platform-admins.ts. Text plus CHECK rather than a
-- Postgres enum, for the reason given in 0001: ALTER TYPE ... ADD VALUE cannot run inside a
-- transaction, which would make every future status addition a non-atomic migration.
ALTER TABLE "platform_admins"
  ADD CONSTRAINT "platform_admins_status_check"
  CHECK ("status" IN ('active', 'suspended'));
--> statement-breakpoint

-- Status and timestamp cannot disagree.
--
-- This is not tidiness: `suspended_at` is what an incident review reads to answer "when did
-- this account lose access". A service bug that flips the status without stamping the time
-- produces a revocation with no date, and nobody notices until the one time it matters.
ALTER TABLE "platform_admins"
  ADD CONSTRAINT "platform_admins_suspension_check"
  CHECK (("status" = 'suspended') = ("suspended_at" IS NOT NULL));
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------
-- platform_admin_invites
--
-- Same policy. An invite row carries the phone number of someone about to be given
-- platform-wide access, which makes it a target in its own right: knowing that a number has
-- a pending invite tells an attacker exactly which SIM is worth swapping, and when.
-- ---------------------------------------------------------------------------------------
ALTER TABLE "platform_admin_invites" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "platform_admin_invites" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "platform_admin_invites_unpinned_only" ON "platform_admin_invites"
  FOR ALL
  USING (current_studio_id() IS NULL)
  WITH CHECK (current_studio_id() IS NULL);
--> statement-breakpoint

-- An invite is either outstanding, accepted, or revoked — never two of those at once.
-- Without this, a revoke racing an accept leaves a row that reads as both, and the accept
-- path's "is this invite still usable?" question has no single answer.
ALTER TABLE "platform_admin_invites"
  ADD CONSTRAINT "platform_admin_invites_terminal_state_check"
  CHECK (NOT ("accepted_at" IS NOT NULL AND "revoked_at" IS NOT NULL));
--> statement-breakpoint

-- Every terminal transition records who caused it. An invite that was accepted by nobody, or
-- revoked by nobody, is an audit trail with the interesting part missing.
ALTER TABLE "platform_admin_invites"
  ADD CONSTRAINT "platform_admin_invites_accepted_by_check"
  CHECK ("accepted_at" IS NULL OR "accepted_by" IS NOT NULL);
--> statement-breakpoint

ALTER TABLE "platform_admin_invites"
  ADD CONSTRAINT "platform_admin_invites_revoked_by_check"
  CHECK ("revoked_at" IS NULL OR "revoked_by" IS NOT NULL);
--> statement-breakpoint

-- An invite that expired before it was created is a clock or a unit bug (hours passed where
-- milliseconds were expected, or the reverse), and it would present as an invite nobody can
-- ever use for reasons no log line explains.
ALTER TABLE "platform_admin_invites"
  ADD CONSTRAINT "platform_admin_invites_expiry_check"
  CHECK ("expires_at" > "created_at");
