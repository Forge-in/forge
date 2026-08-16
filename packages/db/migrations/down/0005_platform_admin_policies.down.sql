-- Reverses 0005_platform_admin_policies.sql.
--
-- Dropping the policies while leaving RLS ENABLED would deny everything rather than allow
-- everything, so RLS is disabled in the same step to return the tables to their prior shape.
--
-- Note what this leaves behind if it is ever run outside CI: two tables holding the phone
-- numbers of every platform administrator, with no row-level security on them at all.

ALTER TABLE "platform_admin_invites" DROP CONSTRAINT IF EXISTS "platform_admin_invites_expiry_check";
--> statement-breakpoint
ALTER TABLE "platform_admin_invites" DROP CONSTRAINT IF EXISTS "platform_admin_invites_revoked_by_check";
--> statement-breakpoint
ALTER TABLE "platform_admin_invites" DROP CONSTRAINT IF EXISTS "platform_admin_invites_accepted_by_check";
--> statement-breakpoint
ALTER TABLE "platform_admin_invites" DROP CONSTRAINT IF EXISTS "platform_admin_invites_terminal_state_check";
--> statement-breakpoint
DROP POLICY IF EXISTS "platform_admin_invites_unpinned_only" ON "platform_admin_invites";
--> statement-breakpoint
ALTER TABLE "platform_admin_invites" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "platform_admin_invites" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE "platform_admins" DROP CONSTRAINT IF EXISTS "platform_admins_suspension_check";
--> statement-breakpoint
ALTER TABLE "platform_admins" DROP CONSTRAINT IF EXISTS "platform_admins_status_check";
--> statement-breakpoint
DROP POLICY IF EXISTS "platform_admins_unpinned_only" ON "platform_admins";
--> statement-breakpoint
ALTER TABLE "platform_admins" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "platform_admins" DISABLE ROW LEVEL SECURITY;
