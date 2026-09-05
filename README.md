# Forge — monorepo

One product, four clients, one multi-tenant NestJS backend. pnpm + Turborepo.

```
forge/
├─ apps/
│  ├─ api             @forge/api            NestJS backend (the ONLY backend)
│  ├─ company-admin   @forge/company-admin  Next.js  – company admin dashboard
│  ├─ gym-owner       @forge/gym-owner      Next.js  – gym owner dashboard
│  ├─ trainer-mobile  @forge/trainer-mobile Expo RN  – trainer app
│  └─ user-mobile     @forge/user-mobile    Expo RN  – gym user app
├─ packages/
│  ├─ shared          @forge/shared         types, zod schemas, roles — imported by everyone
│  ├─ db              @forge/db             schema, migrations, RLS, withTenant()
│  ├─ theme           @forge/theme          Wrath Core design system (web only)
│  ├─ tsconfig        @forge/tsconfig       TypeScript presets, one per runtime
│  └─ eslint-config   @forge/eslint-config  ESLint presets, one per runtime
├─ docker-compose.yml   # postgres + redis + minio (local infra)
└─ turbo.json
```

Every workspace package is scoped `@forge/*`, so `pnpm --filter @forge/api …`
is unambiguous and nothing can collide with a public package name.

## 0. Prerequisites

- Node 22 (`nvm use` reads `.nvmrc`)
- pnpm 9 (`corepack enable && corepack prepare pnpm@9 --activate`)
- Docker Desktop

> If `corepack enable` fails with an `EPERM` on the Node install directory, it
> needs an admin shell to write its shims. Either run it elevated once, or just
> `npm i -g pnpm@9` — npm's global prefix is per-user and needs no elevation.

## 1. First run

```bash
cp .env.example .env          # then fill in secrets
pnpm install
pnpm infra:up                 # postgres + redis + minio
```

**The two Next apps need their own env file.** Next.js loads `.env` from the app directory,
never from the monorepo root, so the root `API_URL` is invisible to them and every server
action that calls the API throws `API_URL is not set`. One line each, git-ignored:

```bash
echo 'API_URL=http://localhost:4000' > apps/company-admin/.env.local
echo 'API_URL=http://localhost:4000' > apps/gym-owner/.env.local
```

`.env` is git-ignored, so put real local values in it. `JWT_*_SECRET` should be
random (`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`).
`S3_ACCESS_KEY`/`S3_SECRET_KEY` are just MinIO's root creds in dev. MSG91 and
Razorpay stay blank until you actually touch OTP or billing.

**Host port already in use?** Don't edit `docker-compose.yml` — that file is
shared. Add a git-ignored `docker-compose.override.yml` instead, and note that
Compose _appends_ to list fields, so remapping a port needs the `!override` tag:

```yaml
services:
  redis:
    ports: !override # without !override, 6379 stays mapped too
      - '6380:6379'
```

Then point the matching URL in `.env` at the new port.

## 2. Folder layout

Each app owns the same shape, so moving between them costs nothing.

**`apps/api`** — feature-first. Anything reusable across features goes in
`common/`; nothing in `modules/` reaches into a sibling module's internals.

```
src/
├─ main.ts                 # bootstrap only
├─ app.module.ts           # composition root: imports feature modules
├─ config/                 # env schema + typed config providers
├─ common/                 # cross-cutting: filters, guards, interceptors, decorators
└─ modules/
   └─ health/              # one folder per feature: module, controller, service, spec
```

**`apps/company-admin`, `apps/gym-owner`** — App Router, with everything that is not a
route living outside `app/`.

```
src/
├─ app/                    # routes only — layout.tsx, page.tsx, route groups
├─ components/ui/          # presentational components
├─ hooks/                  # client-side React hooks
├─ lib/                    # framework-free helpers, API calls
├─ types/                  # app-local types (cross-app types go in @forge/shared)
└─ styles/globals.css
```

`@/*` maps to `./src/*`, so import `@/components/ui/button`, never `../../..`.

**`apps/trainer-mobile`, `apps/user-mobile`** — `index.ts` at the app root is the
Expo entry point and does nothing but register `src/App.tsx`.

```
src/
├─ App.tsx                 # root component
├─ screens/                # one folder per screen
├─ components/
├─ hooks/
└─ lib/
```

**`packages/shared`** — grouped by domain, not by file type. Add a sibling
folder per domain (`billing/`, `gyms/`, `sessions/`) and re-export it from
`src/index.ts`; don't grow flat files at the package root.

```
src/
├─ index.ts                # re-exports each domain barrel
└─ auth/
   ├─ index.ts
   ├─ roles.ts             # Role
   ├─ token.ts             # AuthTokenPayload
   └─ dto.ts               # zod schemas
```

Empty convention folders are held in git by a `.gitkeep`. Delete it when the
folder gets its first real file.

## 3. Shared config

**`@forge/tsconfig`** — apps extend a preset instead of copying compilerOptions:

| preset                              | used by                      |
| ----------------------------------- | ---------------------------- |
| `@forge/tsconfig/base.json`         | `@forge/shared`              |
| `@forge/tsconfig/nest.json`         | `api`                        |
| `@forge/tsconfig/nextjs.json`       | `company-admin`, `gym-owner` |
| `@forge/tsconfig/react-native.json` | both mobile apps             |

`include` / `exclude` / `outDir` stay in each app, because TypeScript resolves
those paths relative to the file that declares them.

The mobile apps use array extends —
`["@forge/tsconfig/react-native.json", "expo/tsconfig.base"]`. Rightmost wins,
so Expo's RN settings (jsx, bundler resolution) take precedence while the
repo-wide strictness flags still apply. `expo/tsconfig.base` is listed in the
app rather than inside `@forge/tsconfig` because it has to resolve from the app.

**`@forge/eslint-config`** — every app's `eslint.config.mjs` is a one-line
re-export of `base`, `nest`, `next`, or `expo`. Add a rule once, it applies
everywhere. The `nest` preset is a factory because type-aware linting needs the
consuming app's directory:

```js
import { nestConfig } from '@forge/eslint-config/nest';
export default nestConfig(import.meta.dirname);
```

The pre-commit hook runs ESLint with `--flag v10_config_lookup_from_file` so a
staged file is linted by **its own app's** preset rather than the root one.
(That flag is the ESLint 10 default; drop it on upgrade. It was renamed from
`unstable_config_lookup_from_file` when it stabilised — the old name still parses
but emits an inactive-flag warning on every commit.)

The root preset also grants Node globals to `scripts/**` and `*.config.*` files.
Without that, `no-undef` flags every `console` and `process` in a build script,
because those files are the only ones in the repo with no app runtime of their own.

`@forge/eslint-config` pins `typescript` itself. Without that pin,
`typescript-eslint` resolved the TypeScript 6 copy the Expo apps pull in, which
it does not support, and every type-aware rule silently degraded to
"type could not be resolved" instead of failing loudly.

### `@forge/shared` is a built package

It compiles to `dist/` (CommonJS + `.d.ts`) rather than exporting raw `.ts`.
The API is compiled by `tsc` and run as `node dist/main`, so it cannot import
TypeScript from `node_modules` at runtime — bundlers can, Node can't. This is
also why `turbo.json` has `typecheck` and `test` depend on `^build`.

Consequence: **after editing `packages/shared`, rebuild it** or the other apps
will keep seeing the old types. A one-off is
`pnpm --filter @forge/shared build`.

### Expo-in-monorepo: no longer a gotcha

Earlier notes here said to hand-write `watchFolders` and
`resolver.nodeModulesPaths` in `metro.config.js`. **Don't** — since SDK 52
`expo/metro-config` detects the workspace root itself, and Expo's monorepo guide
now says to _delete_ those fields. The `metro.config.js` in each mobile app is
just `getDefaultConfig(__dirname)`, kept as the extension point for real
customisation.

If a _native_ build ever fails on pnpm's symlinked layout, the lever is
`node-linker=hoisted` in `.npmrc` — not Metro config.

## 4. Daily commands

```bash
pnpm dev         # all apps in parallel (turbo)
pnpm lint        # read-only; pnpm lint:fix to apply fixes
pnpm typecheck
pnpm test
pnpm build       # includes `expo export` for both mobile apps — see below
pnpm format:check
pnpm checks      # structural guardrails — see § 5
pnpm audit:ci    # dependency advisory gate — see § 5
```

`pnpm build` is not only the web apps. The Expo apps build with `expo export`, which is the
only step that resolves the Metro module graph: `tsc --noEmit` type-checks files, but it will
not notice a missing asset, a require of a package that is not a dependency, or a native-only
module imported from shared code. None of those are type errors, and none of them failed
anything until someone opened the app.

`pnpm dev` ports — fixed rather than auto-assigned, so nothing races for 3000:

| app            | url                   |
| -------------- | --------------------- |
| api            | http://localhost:4000 |
| company-admin  | http://localhost:3000 |
| gym-owner      | http://localhost:3001 |
| trainer-mobile | Metro on 8081         |
| user-mobile    | Metro on 8082         |

Product routes live under `/api/v1`. Probes sit outside both the prefix and versioning, so
a load balancer never has to chase a version bump:

| endpoint   | question it answers        | on failure                                      |
| ---------- | -------------------------- | ----------------------------------------------- |
| `/healthz` | is the process alive?      | the container is **killed** and restarted       |
| `/readyz`  | should it receive traffic? | it is pulled from the load balancer, not killed |

`/healthz` deliberately touches nothing external. If it checked Postgres, one database blip
would fail every liveness probe at once and restart every container simultaneously — hitting
a recovering database with a herd of cold starts. `/readyz` checks Postgres and Redis and
returns 503 naming whichever failed.

First run needs the database roles created once — see `.env.example`:

```bash
psql "postgresql://forge:forge_dev_pw@localhost:5432/forge" \
  -v migrator_password=mig_dev_pw -v app_password=app_dev_pw \
  -f packages/db/sql/bootstrap-roles.sql
pnpm --filter @forge/db db:migrate
```

### Getting into the company admin console

The console has no self-signup and no password. Sign-in is a one-time code by SMS, and the
first administrator has a bootstrap problem — there is nobody to invite them — so they are
created by a script that requires database credentials and a human:

```bash
pnpm --filter @forge/db db:seed-admin -- +919876543210 "Sameer Rathore"
```

It **refuses to create a second one**. After the first, the only path is an invite from the
console, which records who approved whom; `--force` exists for a genuine lockout and says so
in the log it prints.

Until BOTH `MSG91_AUTH_KEY` and `MSG91_OTP_TEMPLATE_ID` are set, the code is not sent — it is
logged at `debug` by the console transport, which is why `LOG_LEVEL=debug` is the dev default.
Both, deliberately: MSG91 issues the auth key immediately but the template id only exists after
DLT approval weeks later, and a half-configured gateway that had switched off the console
transport would break local sign-in for exactly that window. Production refuses to boot
without a real gateway, because "the API is healthy and nobody can log in" is the worst
failure mode this system has.

An invite is a **two-factor** activation: the token proves an existing administrator approved
the person, and the SMS code proves possession of the number the invite names. The token is
shown once, to the inviting administrator, and is deliberately **not** sent by SMS — so a SIM
swap alone cannot activate a new administrator.

Console sessions are separate from member sessions and cannot be exchanged for one another:
tokens carry an `aud` claim (`console` vs `app`), and each surface's endpoints reject the
other's. Console sessions are also shorter-lived (12 hours vs 30 days), and suspending an
administrator kills every session they hold immediately rather than at the next token expiry.

Local infra: Postgres `5432`, MinIO console http://localhost:9001
(`minioadmin` / `minioadmin`), Redis `6379` — unless you've remapped any of them
in a `docker-compose.override.yml`, in which case `docker compose ps` is the
source of truth.

## 5. Checks you run yourself

**This repository has no CI.** There is no GitHub Actions workflow, nothing runs on push, and
nothing will tell you a branch is broken. Everything below is a command someone has to type.
That is a deliberate trade, and the cost of it is that these are easy to forget — so the
list is short and the umbrella command is one word.

```bash
pnpm checks        # structural guardrails (details below)
pnpm audit:ci      # dependency advisories, gated by scripts/audit-allowlist.json
pnpm lint:repo     # files outside every workspace, which `turbo run lint` cannot reach
pnpm format:check  # repo-wide Prettier
```

`pnpm checks` runs four scripts. Run `pnpm build` first if you want the second one to verify
`dist/` targets instead of skipping them.

| script                         | catches                                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `check-workspace-scripts.mjs`  | a workspace with no `test`/`lint`/`typecheck`, so `turbo run` skips it silently                          |
| `check-package-files.mjs`      | an `exports`/`files` path that does not resolve on disk                                                  |
| `check-repo-hygiene.mjs`       | foreign lockfiles, orphan workspace folders, `.nvmrc` drifting from the Dockerfile, a non-exact pnpm pin |
| `db/check-migration-drift.mjs` | a schema edit with no matching migration generated                                                       |

### Before a release, or after touching the schema

The database guarantees cannot be checked without a database. Bring infra up (`pnpm infra:up`),
apply migrations, then:

```bash
# 1. Every tenant-scoped table has RLS. A table shipped without a policy has NO symptoms:
#    no error, no warning, just a table every studio can read.
psql "$DATABASE_MIGRATION_URL" -v ON_ERROR_STOP=1 -f scripts/db/assert-tenancy.sql

# 2. The migration actually reverses. Proves the PR checklist box rather than trusting it,
#    and catches a down-migration that drops a policy the up-migration does not recreate.
pnpm --filter @forge/db db:rollback
psql "$SUPERUSER_URL" -tAc "select count(*) from pg_tables where schemaname='public'"  # expect 0
pnpm --filter @forge/db db:migrate
psql "$DATABASE_MIGRATION_URL" -v ON_ERROR_STOP=1 -f scripts/db/assert-tenancy.sql

# 3. Cross-tenant isolation, and the API end to end against real Postgres and Redis.
pnpm turbo run test:int
pnpm turbo run test:e2e
```

### The API image

`apps/api/Dockerfile` is the deployable artefact and nothing verifies it automatically. Build
it from the repo root, not from `apps/api`:

```bash
docker build -f apps/api/Dockerfile -t forge-api .
```

Worth knowing if you ever check its size: Docker Desktop defaults to the containerd image
store, where `docker image inspect --format '{{.Size}}'` reports the COMPRESSED size — roughly
90 MB for an image whose real uncompressed size is ~320 MB. `docker history` sums the actual
layers. Migrations are a separate release step, run against the same image:

```bash
docker run --rm -e DATABASE_MIGRATION_URL=... forge-api node packages/db/dist/migrate.js
```

## Conventions

- **The tenant is the STUDIO, not the gym.** A studio is the business that buys Forge;
  gyms are its branches. Every tenant-scoped table has `studio_id`, Postgres RLS enforces
  it, and app code sets it from the verified JWT — never from client input. Enforced by
  `scripts/db/assert-tenancy.sql` — run it against a migrated database (§ 5); it has no
  symptoms if you skip it.
- **`gym_id` records where something happened, never who may see it.** A membership is
  sold at the studio, so an all-access chain pass is the default: filtering by
  `registered_gym_id` would silently turn it into a single-branch pass. Access is resolved
  once per request by `resolveAccessibleGyms()` into `accessibleGymIds`.
- **`withTenant()` is the only door to the database.** The pools are private to
  `@forge/db`; nothing else may open a connection. It pins the studio with
  `set_config(..., true)` inside a transaction — a plain `SET` would leak the tenant to the
  next request on that pooled connection.
- **Schema changes = a migration**, with a matching file in `migrations/down/`. Never edit
  the DB by hand. Prove up → down → up yourself before merging (§ 5).
- **Roles/DTOs live in `packages/shared`.** Don't redefine them per app.
- **Config presets live in `packages/*`.** If you find yourself editing the same
  tsconfig or ESLint rule in two apps, it belongs in a preset.
- **Conventional commits** (enforced by commitlint): `feat:`, `fix:`, `chore:` …

## Branching

`main` (protected, deploys to staging) ← PR ← short-lived `feat/*` branches.
Two-person team: keep it this simple. No `develop` unless you feel the need.
