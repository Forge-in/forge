-- Reverses 0003_auth_membership_lookup.sql.
--
-- Dropping these makes cross-studio membership lookup impossible again, which means
-- sign-in stops working — so this is only reversible in the sense that the schema returns
-- to its previous shape, not that the application still functions on it.

DROP INDEX IF EXISTS "memberships_user_id_status_idx";
--> statement-breakpoint
DROP POLICY IF EXISTS "studios_visible_to_members" ON "studios";
--> statement-breakpoint
DROP POLICY IF EXISTS "memberships_self_lookup" ON "memberships";
--> statement-breakpoint
DROP FUNCTION IF EXISTS current_auth_user_id();
