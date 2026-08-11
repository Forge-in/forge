# 2. Global users, studio-scoped memberships

- **Status:** Accepted
- **Date:** 2026-08-12

## Context

[ADR 1](0001-tenant-is-the-studio.md) makes the studio the tenant. That forces a question
about identity: if a trainer works at two studios, is that one person or two?

Authentication is phone-OTP and there is no password path, so the phone number is the
identity. If `users` were tenant-scoped, the same number signing up at a second studio
would create a second, unlinked account — with its own login, its own history, and no way
to reconcile the two later without a migration that has to guess.

## Decision

`users` is **global**: one row per phone number across all of Forge. It holds only identity
(phone, name) and carries no `studio_id`.

`memberships(studio_id, user_id, role, ...)` is **tenant-scoped** and holds everything
studio-specific: role, access, joining date, status.

The JWT carries the **active** membership — `tenantId` (the studio), `role`, and
`membershipId` — rather than a list. Switching studio is an explicit
`POST /v1/auth/switch-gym` that reissues the token.

One live membership is permitted per `(studio, user, role)`, not per `(studio, user)`: the
same person being both a trainer and a paying member at the studio they work at is a normal
case, not a data error.

## Consequences

- `users` is one of only two exemptions in `scripts/db/assert-tenancy.sql`. Exemptions are
  a committed, reviewed list precisely so that "global" is never something a table acquires
  by accident.
- Being global does **not** mean unprotected. `users` still has RLS with FORCE. A row is
  visible when the pinned studio has a membership for that user, or when no studio is
  pinned at all — the authentication path, which must find a user by phone _before_ it
  knows which studio they are signing into. That path runs through `runAsSystem()`, which
  logs every call with a reason.
- The failure direction of that policy is safe: if it is wrong, login breaks loudly rather
  than leaking quietly.
- The permissive "no studio pinned" branch is the one genuinely delicate part of the
  design. It is why `runAsSystem()` is deliberately noisy and separately named, rather than
  being a default that a developer reaches for when a query is inconveniently filtered.
- Because the token carries one active membership, every handler gets exactly one studio.
  No handler has to reason about a user who is "in several tenants at once".

## Alternatives considered

**Tenant-scoped users.** One fewer table and `AuthTokenPayload` needs no change. Creates
duplicate accounts for the same phone at the moment a second studio signs them up, and
un-duplicating identities after launch means merging history under real data.

**A list of memberships in the JWT.** Removes the switch endpoint, but every query then
needs to know which membership it is acting under, and a token that grants several tenants
at once is a much larger blast radius if it leaks.
