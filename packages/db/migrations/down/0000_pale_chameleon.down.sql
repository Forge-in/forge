-- Reverses 0000_pale_chameleon.sql.
--
-- Reverse dependency order: attendance references memberships and gyms; memberships
-- references gyms, users and studios; gyms references studios.
--
-- DESTRUCTIVE. This drops the tables and everything in them. It exists so CI can prove the
-- migration is reversible against an empty database; it is not a production rollback plan.
-- In production, schema changes follow expand/contract so that reverting the APPLICATION
-- is always sufficient and the schema never has to move backwards.

DROP TABLE IF EXISTS "attendance";
--> statement-breakpoint
DROP TABLE IF EXISTS "memberships";
--> statement-breakpoint
DROP TABLE IF EXISTS "gyms";
--> statement-breakpoint
DROP TABLE IF EXISTS "users";
--> statement-breakpoint
DROP TABLE IF EXISTS "studios";
