-- Two-role bootstrap. Run ONCE per database, by a superuser, BEFORE the first migration.
-- Not a migration itself: it creates the role that runs migrations, so it cannot be one.
--
-- WHY TWO ROLES
--
-- Postgres exempts a table's OWNER from that table's row-level security policies unless
-- the table also has FORCE ROW LEVEL SECURITY. With a single connection URL the app
-- connects as the owner, so every policy in the schema is decorative and every isolation
-- test passes for the wrong reason. This is the single most common way teams ship "RLS"
-- that does nothing.
--
-- The defence is layered, because either layer alone has a failure mode:
--   1. forge_app is not the owner and has NOBYPASSRLS  -> policies apply to it
--   2. every tenant table has FORCE ROW LEVEL SECURITY -> policies apply to the owner too
--
-- Layer 2 matters even though layer 1 exists, because migrations and any future admin
-- tooling connect as the owner, and a one-off script that "just checks something" should
-- not be able to read across every tenant by accident.
--
-- Usage (passwords are passed unquoted; :'name' quotes them as SQL literals):
--   psql "$SUPERUSER_URL" \
--     -v migrator_password=... -v app_password=... \
--     -f packages/db/sql/bootstrap-roles.sql
--
-- Idempotent: safe to re-run against an existing database.

\set ON_ERROR_STOP on

-- CREATE ROLE has no IF NOT EXISTS, and psql does NOT interpolate :variables inside
-- dollar-quoted blocks — so a DO $$ ... $$ wrapper would embed the literal text
-- ":migrator_password" as the password. \gexec sidesteps both: the SELECT builds the
-- statement (returning zero rows when the role already exists) and \gexec runs it.

-- Owns every table; runs migrations. Cannot bypass RLS, so even schema work is subject to
-- the policies once FORCE is on. Deliberately NOT a superuser.
SELECT format('CREATE ROLE forge_migrator LOGIN PASSWORD %L', :'migrator_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'forge_migrator')
\gexec

ALTER ROLE forge_migrator NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

-- The runtime role. Owns nothing, creates nothing, cannot bypass RLS. This is the only
-- role the API ever connects as.
SELECT format('CREATE ROLE forge_app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'forge_app')
\gexec

ALTER ROLE forge_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

-- Re-set the password on every run so rotation is a matter of re-running this file.
SELECT format('ALTER ROLE forge_migrator PASSWORD %L', :'migrator_password')
\gexec
SELECT format('ALTER ROLE forge_app PASSWORD %L', :'app_password')
\gexec

-- Needed so the migrator can create its own bookkeeping schema ("drizzle", holding the
-- applied-migrations journal). NOCREATEDB above is unrelated — that governs creating
-- databases, not schemas inside one. Granted to the migrator only; the runtime role must
-- never be able to add a schema, since a table created outside the reviewed migration path
-- would arrive with no RLS policy attached.
SELECT format('GRANT CREATE ON DATABASE %I TO forge_migrator', current_database())
\gexec

-- forge_migrator owns the schema so that objects it creates are owned by it rather than
-- by whoever happened to run the bootstrap.
ALTER SCHEMA public OWNER TO forge_migrator;

GRANT USAGE ON SCHEMA public TO forge_app;

-- No CREATE for the app role: it must not be able to add a table (which would arrive with
-- no policies attached and therefore no tenant wall).
REVOKE CREATE ON SCHEMA public FROM forge_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- DML only, and only on what already exists.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO forge_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO forge_app;

-- Tables created by future migrations inherit the same grants automatically. Without this
-- every migration would need a matching GRANT, and the one that forgets fails at runtime
-- with a permission error in production rather than in CI.
ALTER DEFAULT PRIVILEGES FOR ROLE forge_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO forge_app;

ALTER DEFAULT PRIVILEGES FOR ROLE forge_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO forge_app;
