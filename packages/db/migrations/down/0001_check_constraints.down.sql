-- Reverses 0001_check_constraints.sql.

ALTER TABLE "attendance" DROP CONSTRAINT IF EXISTS "attendance_business_date_window_check";
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_phone_e164_check";
--> statement-breakpoint
ALTER TABLE "gyms" DROP CONSTRAINT IF EXISTS "gyms_status_check";
--> statement-breakpoint
ALTER TABLE "studios" DROP CONSTRAINT IF EXISTS "studios_status_check";
--> statement-breakpoint
ALTER TABLE "memberships" DROP CONSTRAINT IF EXISTS "memberships_period_check";
--> statement-breakpoint
ALTER TABLE "memberships" DROP CONSTRAINT IF EXISTS "memberships_status_check";
--> statement-breakpoint
ALTER TABLE "memberships" DROP CONSTRAINT IF EXISTS "memberships_gym_access_check";
--> statement-breakpoint
ALTER TABLE "memberships" DROP CONSTRAINT IF EXISTS "memberships_role_check";
