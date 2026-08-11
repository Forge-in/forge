-- Reverses 0002_rls_policies.sql.
--
-- Order matters: policies depend on current_studio_id(), so the function is dropped last.
-- Note that dropping the policies while leaving RLS ENABLED would deny everything rather
-- than allow everything, so RLS is disabled in the same step to return to the prior state.

DROP INDEX IF EXISTS "memberships_user_id_studio_id_idx";
--> statement-breakpoint
DROP POLICY IF EXISTS "users_visible_within_studio" ON "users";
--> statement-breakpoint
ALTER TABLE "users" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "attendance_tenant_isolation" ON "attendance";
--> statement-breakpoint
ALTER TABLE "attendance" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "attendance" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "memberships_tenant_isolation" ON "memberships";
--> statement-breakpoint
ALTER TABLE "memberships" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "memberships" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "gyms_tenant_isolation" ON "gyms";
--> statement-breakpoint
ALTER TABLE "gyms" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "gyms" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "studios_tenant_isolation" ON "studios";
--> statement-breakpoint
ALTER TABLE "studios" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "studios" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP FUNCTION IF EXISTS current_studio_id();
