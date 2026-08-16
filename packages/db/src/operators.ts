/**
 * Query operators, re-exported so consumers never import `drizzle-orm` directly.
 *
 * THE REASON THIS FILE EXISTS
 *
 * drizzle-orm declares an OPTIONAL peer dependency on @opentelemetry/api. When
 * @opentelemetry/* was added to apps/api, pnpm resolved a second physical copy of
 * drizzle-orm — same version 0.44.7, different peer hash:
 *
 *   apps/api      -> .pnpm/drizzle-orm@0.44.7_@opentelemetry+api@1.9.1_...
 *   packages/db   -> .pnpm/drizzle-orm@0.44.7_@types+pg@8.21.0_pg@8.23.0
 *
 * Two copies mean two structurally identical but nominally DIFFERENT `SQL<unknown>` types, so
 * every `where(eq(...))` written in apps/api stopped assigning to the `where` of a table
 * defined in packages/db. The error is a wall of generics that says nothing about peer
 * resolution, and it appeared from an unrelated dependency install.
 *
 * Routing every consumer through this file means the repo has exactly ONE drizzle instance —
 * the one packages/db resolves — and no future optional peer can split it again. An ESLint
 * rule enforces the same thing, because a comment is not a guarantee.
 *
 * Add re-exports here as features need them.
 */
export {
  and,
  asc,
  between,
  count,
  desc,
  eq,
  exists,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  ne,
  not,
  notInArray,
  or,
  sql,
  sum,
} from 'drizzle-orm';

export type { SQL, Column } from 'drizzle-orm';
