# 3. Tenant isolation via RLS, enforced by two database roles

- **Status:** Accepted
- **Date:** 2026-08-12

## Context

Isolation could live in application code (every query filters by `studio_id`) or in the
database (row-level security). Application-only filtering fails open: the query that
forgets the predicate returns another studio's data and looks exactly like a working query.

RLS fails closed, but only if it is actually in force. The common way teams ship RLS that
does nothing: **Postgres exempts a table's owner from its own policies** unless the table
also has `FORCE ROW LEVEL SECURITY`. With one connection URL the application connects as
the owner, so every policy is decorative and every isolation test passes for the wrong
reason.

Our local database confirmed the risk — the default `forge` user is a superuser with
`BYPASSRLS`.

## Decision

**RLS is the wall, application filtering is defence in depth.** Queries also filter by
`studio_id` where practical, so one policy bug is not a single point of failure.

**Two database roles:**

| Role             | Purpose                           | Privileges                               |
| ---------------- | --------------------------------- | ---------------------------------------- |
| `forge_migrator` | owns all tables, runs migrations  | NOSUPERUSER, NOBYPASSRLS, no runtime use |
| `forge_app`      | the only role the API connects as | owns nothing, no DDL, NOBYPASSRLS        |

**`FORCE ROW LEVEL SECURITY` on every table**, so even the owner is subject to policies.
Both layers, because either alone has a failure mode: the app role protects runtime, FORCE
protects migrations and one-off admin scripts.

**Every policy carries both `USING` and `WITH CHECK`**, each referencing
`current_studio_id()`. `USING` alone filters reads and blocks updating another studio's
row, but for policies where the write check is omitted the semantics are subtle — being
explicit removes the need to reason about it.

**`withTenant()` is the only door.** The pools are private to `@forge/db`. It opens a
transaction and pins the studio with `set_config('app.studio_id', ..., true)`. The `true`
is the entire safety property: a plain `SET` persists for the life of the pooled
connection, so the next request inherits the previous request's tenant — a cross-tenant
read that passes every single-tenant test and appears only under load.

**A NULL context denies.** `current_setting(..., true)` returns NULL when unset, every
comparison against NULL is NULL, and NULL is not true. An unpinned connection sees nothing.

## Consequences

- Migrations run as a separate release step before the new version boots, never at app
  startup — two instances would race, and boot-time migration would require giving DDL
  rights to the most internet-exposed process.
- `studios` is the one tenant table without a `studio_id` column: its own `id` is the
  tenant key, so its policy is keyed on `id`. `assert-tenancy.sql` knows this by name.
- Creating a studio requires generating its id client-side and pinning it before the
  insert, because `WITH CHECK` compares against the pinned value.
- Two guards, deliberately independent:
  - `scripts/db/assert-tenancy.sql` — structural, run against a real migrated database.
    Catches a table added without `studio_id`, without RLS, without FORCE, with no policy,
    with a policy that ignores the tenant, without an index leading on `studio_id`, or
    without a foreign key to `studios`. Verified to fail on each.
  - `packages/db/src/tenancy.int-test.ts` — behavioural. Runs on a pool of **one
    connection**, so a `SET`-instead-of-`SET LOCAL` regression is caught rather than hidden
    by a fresh connection.
- Composite foreign keys — `(studio_id, gym_id) REFERENCES gyms (studio_id, id)` — make
  cross-tenant references unrepresentable. Policies filter which rows you can _see_; they
  do not validate what a row _points at_. This is the guarantee that survives a bug in
  either RLS or application code.
- `platform_admin` gets **no** RLS bypass. Cross-studio views work by audited impersonation:
  the console pins an explicit studio and the access is logged. One bug in one guard
  therefore cannot expose every tenant at once.
- If a connection pooler is introduced, it must be transaction mode. `SET LOCAL` inside an
  explicit transaction is safe there — which is why every function in `tenant.ts` opens a
  transaction, not because the write needs atomicity.

## Alternatives considered

**Application-level filtering only.** Simpler, no roles to manage, and fails open. Rejected
for a multi-tenant product where the failure is a data breach.

**A single database role.** One URL to configure. Makes the app the table owner, so
policies do not apply to it and the entire scheme is theatre.

**A GUC flag (`app.is_platform_admin`) short-circuiting policies.** Makes cross-studio
queries easy to write, at the cost of a backdoor in every policy — one place that sets the
flag wrongly exposes everything, and the policies become much harder to audit.
