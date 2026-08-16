-- Value constraints that Drizzle's schema DSL does not express.
--
-- These are enum-shaped columns kept as text rather than as Postgres enums, because
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction and cannot be reversed, which
-- makes every future role or status addition a non-atomic migration. A CHECK constraint
-- is dropped and recreated in one transaction, so adding a value stays a normal migration.
--
-- The role list mirrors Role in @forge/shared. A test asserts the two cannot drift.

ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_role_check"
  CHECK ("role" IN ('platform_admin', 'gym_owner', 'trainer', 'gym_user'));
--> statement-breakpoint

ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_gym_access_check"
  CHECK ("gym_access" IN ('all', 'restricted'));
--> statement-breakpoint

ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_status_check"
  CHECK ("status" IN ('active', 'paused', 'ended'));
--> statement-breakpoint

-- A membership that has ended cannot have ended before it began. Cheap to enforce, and it
-- catches the timezone/ordering mistakes that otherwise surface as negative date ranges in
-- a report months later.
ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_period_check"
  CHECK ("ended_at" IS NULL OR "ended_at" >= "started_at");
--> statement-breakpoint

ALTER TABLE "studios"
  ADD CONSTRAINT "studios_status_check"
  CHECK ("status" IN ('active', 'suspended', 'churned'));
--> statement-breakpoint

ALTER TABLE "gyms"
  ADD CONSTRAINT "gyms_status_check"
  CHECK ("status" IN ('active', 'closed'));
--> statement-breakpoint

-- Phone numbers reach the database only through phoneSchema in @forge/shared, but the
-- database is the last line: an import script or a psql session bypasses the API entirely.
ALTER TABLE "users"
  ADD CONSTRAINT "users_phone_e164_check"
  CHECK ("phone" ~ '^\+[1-9][0-9]{7,14}$');
--> statement-breakpoint

-- business_date must be the date the app derived, not something a client invented.
-- It cannot be verified against checked_in_at in SQL without knowing the studio timezone,
-- so this only bounds it to the two calendar days the instant could possibly fall on —
-- enough to catch a caller that passed a UTC date, or no conversion at all.
ALTER TABLE "attendance"
  ADD CONSTRAINT "attendance_business_date_window_check"
  CHECK (
    "business_date" BETWEEN ("checked_in_at" AT TIME ZONE 'UTC')::date - 1
                        AND ("checked_in_at" AT TIME ZONE 'UTC')::date + 1
  );
