# Forge — monorepo

One product, four clients, one multi-tenant NestJS backend. pnpm + Turborepo.

```
forge/
├─ apps/
│  ├─ api             @forge/api            NestJS backend (the ONLY backend)
│  ├─ admin           @forge/admin          Next.js  – platform admin dashboard
│  ├─ owner-web       @forge/owner-web      Next.js  – gym owner dashboard
│  ├─ trainer-mobile  @forge/trainer-mobile Expo RN  – trainer app
│  └─ user-mobile     @forge/user-mobile    Expo RN  – gym user app
├─ packages/
│  ├─ shared          @forge/shared         types, zod schemas, roles — imported by everyone
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

**`apps/admin`, `apps/owner-web`** — App Router, with everything that is not a
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

| preset                              | used by              |
| ----------------------------------- | -------------------- |
| `@forge/tsconfig/base.json`         | `@forge/shared`      |
| `@forge/tsconfig/nest.json`         | `api`                |
| `@forge/tsconfig/nextjs.json`       | `admin`, `owner-web` |
| `@forge/tsconfig/react-native.json` | both mobile apps     |

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
pnpm build
pnpm format:check
```

`pnpm dev` ports — fixed rather than auto-assigned, so nothing races for 3000:

| app            | url                   |
| -------------- | --------------------- |
| api            | http://localhost:4000 |
| admin          | http://localhost:3000 |
| owner-web      | http://localhost:3001 |
| trainer-mobile | Metro on 8081         |
| user-mobile    | Metro on 8082         |

`GET http://localhost:4000/health` is the API's liveness probe.

Local infra: Postgres `5432`, MinIO console http://localhost:9001
(`minioadmin` / `minioadmin`), Redis `6379` — unless you've remapped any of them
in a `docker-compose.override.yml`, in which case `docker compose ps` is the
source of truth.

## Conventions

- **Every tenant-scoped table has `gym_id`.** Postgres RLS enforces it; app code sets it from the JWT, never from client input.
- **Schema changes = a migration.** Never edit the DB by hand.
- **Roles/DTOs live in `packages/shared`.** Don't redefine them per app.
- **Config presets live in `packages/*`.** If you find yourself editing the same
  tsconfig or ESLint rule in two apps, it belongs in a preset.
- **Conventional commits** (enforced by commitlint): `feat:`, `fix:`, `chore:` …

## Branching

`main` (protected, deploys to staging) ← PR ← short-lived `feat/*` branches.
Two-person team: keep it this simple. No `develop` unless you feel the need.
