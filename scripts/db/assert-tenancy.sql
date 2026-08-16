-- Structural tenancy invariants, asserted against a REAL migrated database.
--
-- This is the highest-leverage guard in the repo. The behavioural tests prove that the
-- tables which exist today isolate correctly; this proves that any table added tomorrow
-- cannot skip the wall. The failure it catches — a new table shipped without a policy —
-- has no symptoms at all: no error, no warning, just a table every studio can read.
--
-- Run in CI after migrations, as any role. Raises (exit code 3) on the first violation set.
--
--   psql "$DATABASE_MIGRATION_URL" -v ON_ERROR_STOP=1 -f scripts/db/assert-tenancy.sql

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------------------
-- Exemptions. Adding a name here is a deliberate, reviewable one-line diff, which is
-- exactly the human judgement worth keeping: everything else is automatic.
-- ---------------------------------------------------------------------------------------
CREATE TEMP TABLE tenancy_config AS
SELECT * FROM (VALUES
  -- GLOBAL: identity is one row per phone across all of Forge, so a trainer at two
  -- studios is one person. Still gets RLS (scoped through memberships) — being global
  -- must not mean any studio-scoped bug can enumerate every phone number on the platform.
  ('users',   'global'),

  -- GLOBAL: a platform administrator belongs to no studio — that is what makes them one —
  -- so there is no studio_id that could scope these rows. What replaces the tenant wall is
  -- the inverse policy: visible ONLY when no studio is pinned, so during ordinary request
  -- handling (which always pins one) both tables are invisible rather than merely filtered.
  -- The one door left is runAsSystem(), which logs every call. See migration 0005.
  ('platform_admins',        'global'),
  ('platform_admin_invites', 'global'),

  -- TENANT ROOT: the only tenant-scoped table with no studio_id column, because its own
  -- id IS the tenant key. Its policy is keyed on id and is checked like any other.
  ('studios', 'tenant_root')
) AS t(table_name, kind);

CREATE TEMP TABLE tenancy_violations AS
WITH tables AS (
  SELECT
    c.oid,
    c.relname,
    c.relrowsecurity,
    c.relforcerowsecurity,
    COALESCE((SELECT kind FROM tenancy_config cfg WHERE cfg.table_name = c.relname), 'tenant')
      AS kind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    -- drizzle's migration journal lives in its own schema, so nothing to exclude by name.
    AND c.relname NOT LIKE '\_\_drizzle%'
),

-- 1. Every tenant table carries the tenant key. -------------------------------------------
missing_column AS (
  SELECT t.relname, 'has no studio_id column' AS problem,
         'Add studioIdColumn() from schema/_base.ts, or exempt it in tenancy_config with a reason.' AS fix
  FROM tables t
  WHERE t.kind = 'tenant'
    AND NOT EXISTS (
      SELECT 1 FROM pg_attribute a
      WHERE a.attrelid = t.oid AND a.attname = 'studio_id'
        AND a.attnum > 0 AND NOT a.attisdropped
    )
),

-- 2. RLS is on, and forced. ---------------------------------------------------------------
-- Two separate failures. Not enabled: policies are inert and every row is visible to
-- everyone. Enabled but not forced: the table OWNER bypasses every policy, so migrations
-- and any admin script read across all tenants while the app looks correctly walled.
rls_disabled AS (
  SELECT t.relname, 'row level security is NOT ENABLED — every policy on it is inert',
         'ALTER TABLE "' || t.relname || '" ENABLE ROW LEVEL SECURITY;'
  FROM tables t WHERE NOT t.relrowsecurity
),
rls_not_forced AS (
  SELECT t.relname, 'row level security is NOT FORCED — the table owner bypasses all policies',
         'ALTER TABLE "' || t.relname || '" FORCE ROW LEVEL SECURITY;'
  FROM tables t WHERE t.relrowsecurity AND NOT t.relforcerowsecurity
),

-- 3. A policy exists, and it actually references the tenant key. --------------------------
-- Checking for the mere existence of a policy is not enough: `USING (true)` is a policy.
-- Both the read expression and the write expression must mention current_studio_id().
--
-- Note on Postgres semantics: for a FOR ALL policy, omitting WITH CHECK makes the USING
-- expression serve as the write check too. So the effective write expression is
-- COALESCE(with_check, qual) — which is why this checks the coalesced form rather than
-- demanding a literal WITH CHECK clause.
no_policy AS (
  SELECT t.relname, 'has RLS enabled but no policy at all — it denies everything, including the app',
         'Add a tenant isolation policy in a migration.'
  FROM tables t
  WHERE NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = t.oid)
),
policy_ignores_tenant AS (
  SELECT DISTINCT t.relname,
         'policy "' || p.polname || '" does not reference current_studio_id() in its ' ||
           CASE WHEN pg_get_expr(p.polqual, p.polrelid) IS NULL
                  OR pg_get_expr(p.polqual, p.polrelid) NOT LIKE '%current_studio_id%'
                THEN 'USING clause (reads are not tenant-filtered)'
                ELSE 'effective WITH CHECK clause (an INSERT can stamp another studio''s id)'
           END,
         'See migrations/0002_rls_policies.sql for the shape every tenant policy follows.'
  FROM tables t
  JOIN pg_policy p ON p.polrelid = t.oid
  WHERE t.kind <> 'global'
    AND (
      COALESCE(pg_get_expr(p.polqual, p.polrelid), '') NOT LIKE '%current_studio_id%'
      OR COALESCE(
           pg_get_expr(p.polwithcheck, p.polrelid),
           pg_get_expr(p.polqual, p.polrelid),
           ''
         ) NOT LIKE '%current_studio_id%'
    )
),

-- 4. studio_id leads an index. ------------------------------------------------------------
-- Every tenant query filters on studio_id, so an index that does not lead with it cannot
-- serve that filter. Without this, isolation stays correct but every listing degrades to a
-- sequential scan — which looks fine at 3 studios and falls over at 300.
unindexed_tenant_key AS (
  SELECT t.relname, 'studio_id is not the leading column of any index — tenant scans will be sequential',
         'Add an index leading with studio_id, e.g. (studio_id, created_at).'
  FROM tables t
  WHERE t.kind = 'tenant'
    AND EXISTS (
      SELECT 1 FROM pg_attribute a
      WHERE a.attrelid = t.oid AND a.attname = 'studio_id' AND NOT a.attisdropped
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
      WHERE i.indrelid = t.oid AND a.attname = 'studio_id'
    )
),

-- 5. studio_id is a real foreign key to studios(id). --------------------------------------
-- Without it, a typo'd or orphaned studio_id produces rows that belong to no tenant and
-- are therefore invisible to every policy — data that exists, is billed for, and can
-- never be read back.
missing_tenant_fk AS (
  SELECT t.relname, 'studio_id has no foreign key to studios(id) — orphaned rows become unreachable',
         'Add foreignKey({ columns: [t.studioId], foreignColumns: [studios.id] }).'
  FROM tables t
  WHERE t.kind = 'tenant'
    AND EXISTS (
      SELECT 1 FROM pg_attribute a
      WHERE a.attrelid = t.oid AND a.attname = 'studio_id' AND NOT a.attisdropped
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint con
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = con.conkey[1]
      WHERE con.conrelid = t.oid
        AND con.contype = 'f'
        AND a.attname = 'studio_id'
        AND con.confrelid = 'public.studios'::regclass
    )
)

SELECT relname AS "table", problem, fix FROM missing_column
UNION ALL SELECT * FROM rls_disabled
UNION ALL SELECT * FROM rls_not_forced
UNION ALL SELECT * FROM no_policy
UNION ALL SELECT * FROM policy_ignores_tenant
UNION ALL SELECT * FROM unindexed_tenant_key
UNION ALL SELECT * FROM missing_tenant_fk;

\echo ''
\echo '=== tenancy invariants ==='

SELECT
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r') AS tables_checked,
  (SELECT count(*) FROM tenancy_violations) AS violations;

\pset format wrapped
SELECT * FROM tenancy_violations ORDER BY "table";

DO $$
DECLARE
  violation_count int;
BEGIN
  SELECT count(*) INTO violation_count FROM tenancy_violations;

  IF violation_count > 0 THEN
    RAISE EXCEPTION
      '% tenancy invariant violation(s). A table without a working policy is readable by every studio.',
      violation_count;
  END IF;

  RAISE NOTICE 'OK: every table in public is either tenant-scoped with a working policy, or a declared exemption.';
END
$$;
