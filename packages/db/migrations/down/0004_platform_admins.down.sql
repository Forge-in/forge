-- Reverses 0004_platform_admins.sql.
--
-- DESTRUCTIVE. Dropping platform_admins removes every platform administrator, and since the
-- console has no other way in, the company admin dashboard becomes unreachable until the
-- seed CLI is run again. It exists so CI can prove the migration is reversible against an
-- empty database; it is not a production rollback plan.
--
-- No dependency ordering to worry about between these two: platform_admin_invites has no
-- foreign key to platform_admins (invited_by and accepted_by are deliberately plain uuids,
-- so the audit trail survives the deletion of the actor it names).

DROP TABLE IF EXISTS "platform_admin_invites";
--> statement-breakpoint
DROP TABLE IF EXISTS "platform_admins";
