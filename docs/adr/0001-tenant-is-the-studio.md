# 1. The tenant is the studio, not the gym

- **Status:** Accepted
- **Date:** 2026-08-12

## Context

Forge is sold to gym businesses in India, and those businesses are frequently chains: one
brand, several branches. We had to decide what a "tenant" is before the first table
existed, because the answer becomes a column on every table afterwards.

The original README said _"Every tenant-scoped table has `gym_id`"_, which quietly assumed
one gym = one customer. Two real cases break that:

- A trainer works at two branches, or at two unrelated studios.
- A member of a three-branch chain trains at whichever branch is near them that day.

Under a gym-as-tenant model, both become several disconnected accounts for the same person.
A chain with three branches means a member is billed, counted and reported three times.

## Decision

**The studio is the tenant.** `studio_id` is the column on every tenant-scoped table and
the only value row-level security compares against.

**Gyms are branches inside a studio.** `gym_id` appears where an activity physically
happened — a check-in, an invoice's originating branch. It is a reporting dimension and is
never used for access control.

**Membership is studio-level**, so the default is an all-access chain pass. A member who
signed up at Andheri can train at Bandra with nothing special happening.

`memberships.registered_gym_id` records where someone signed up. It is deliberately not
named `home_gym_id`: "home gym" reads like something you filter by, and eventually someone
would.

A `gym_access` column exists with a constant value of `'all'`. Chains almost always end up
selling a cheaper single-branch pass alongside an all-access one; a text column with one
value costs nothing now, whereas adding it to a live table later is a migration plus a
backfill plus a careful deploy.

## Consequences

- Quotas and billing count at the studio. One person using four branches is one user. If
  we ever want to sell per-branch user limits, that is a different pricing model and this
  schema does not support it without change.
- "Attendance" is two numbers, and reports must say which: `COUNT(*)` is visits,
  `COUNT(DISTINCT business_date)` is active days. A member doing morning cardio at one
  branch and evening weights at another is two visits on one active day.
- There is deliberately **no** unique constraint on
  `(studio_id, membership_id, business_date)` — it would reject the second branch's
  check-in, which is exactly what the all-access pass is meant to allow. Duplicate
  suppression is the idempotency key's job instead.
- Invoices snapshot `gym_id` at issue time, so moving a member between branches does not
  rewrite historical revenue attribution.
- `users` must be global (see [ADR 2](0002-global-users-scoped-memberships.md)), because a
  person can hold memberships at more than one studio.
- The single most likely way to reintroduce the bug this avoids is filtering a query by
  `gym_id` for access. `resolveAccessibleGyms()` is the only function permitted to decide
  reachability, and it has exactly one call site.

## Alternatives considered

**Gym as tenant.** Simplest schema, matches the original `AuthTokenPayload` exactly. Fails
the multi-branch case, which is the normal shape of the Indian market we are selling into.

**Staff-only multi-membership** (trainers can span studios, members cannot). Smaller blast
radius, but it means two identity models to reason about in every query and every guard —
complexity paid on every future feature to avoid one table today.
