# 4. Drizzle as the ORM

- **Status:** Accepted
- **Date:** 2026-08-12

## Context

The data layer had to satisfy three constraints that are unusual together:

1. **Row-level security.** Every query runs inside a transaction that first executes
   `set_config('app.studio_id', ..., true)`. The ORM must not get in the way of owning the
   transaction and the connection.
2. **Reversible migrations.** The PR template already asks for them, and CI proves
   up → down → up.
3. **CommonJS output.** The API runs as `node dist/main`, so anything it imports must be
   requireable at runtime — no TypeScript in `node_modules`.

## Decision

**Drizzle ORM** (`drizzle-orm` + `drizzle-kit` + `pg`), with the schema in
`packages/db/src/schema/` and the package compiled to CommonJS like `@forge/shared`.

Generated migrations are plain reviewable SQL. The **security-critical DDL is hand-authored**
(`0002_rls_policies.sql`): policies, `FORCE ROW LEVEL SECURITY` and grants are the files
that decide whether one studio can read another's data, so they are written and reviewed
directly rather than emitted by a generator.

## Consequences

- We own the `pg.Pool` and the transaction, so pinning the tenant is a normal statement
  rather than an escape hatch.
- Down migrations are hand-written in `migrations/down/`, applied by `src/rollback.ts`
  which also rewinds Drizzle's journal. Drizzle has no native down support — a reasonable
  default, since production rollbacks should follow expand/contract so that reverting the
  _application_ is always sufficient. The value of writing the down file is partly that it
  is the moment you notice a migration drops a column and therefore cannot be reversed.
- No binary engine and no codegen step, so the Docker image stays small and there is no
  musl/glibc engine mismatch to debug at 2am.
- The repo's strict TypeScript settings bite in two predictable places, both handled:
  `noUncheckedIndexedAccess` makes `.returning()` results `T | undefined`, so
  `takeFirstOrThrow()` exists rather than `!` at every call site; `exactOptionalPropertyTypes`
  fights partial updates, so update payloads are built by conditional spread and never by
  assigning `undefined`.
- `drizzle-kit generate` must be re-run after editing the schema. Forgetting is the most
  common Drizzle mistake, so CI should gate on a drift check (`drizzle-kit check`).

## Alternatives considered

**Prisma.** Best DX and ecosystem. Rejected on two specifics rather than on taste: its
migrations are up-only by design, which directly contradicts a rule already written into
our PR template; and its Rust query engine adds a binary to copy into the container image,
with the alpine-musl variant being a recurring source of deploy-time surprises. Setting the
tenant per transaction also requires `$executeRaw` inside an interactive transaction, which
makes the escape hatch the primary code path.

**Kysely + node-pg-migrate.** The best reversible-migration story of the three, and
mechanically identical to Drizzle for RLS. Rejected because there is no schema source of
truth — all DDL is hand-written and types are derived by codegen — which is more ongoing
work than a two-person team should take on for a benefit we get anyway by hand-authoring
only the security DDL.
