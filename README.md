# Forge — monorepo starter

One product, four clients, one multi-tenant NestJS backend. pnpm + Turborepo.

```
forge/
├─ apps/
│  ├─ api          # NestJS backend (the ONLY backend)
│  ├─ admin        # Next.js  – platform admin dashboard
│  ├─ owner-web    # Next.js  – gym owner dashboard
│  ├─ owner-mobile # Expo RN  – owner + trainer app
│  └─ user-mobile  # Expo RN  – gym user app
├─ packages/
│  └─ shared        # types, zod schemas, roles — imported by everyone
├─ docker-compose.yml   # postgres + redis + minio (local infra)
└─ turbo.json
```

## 0. Prerequisites

- Node 22 (`nvm use` reads `.nvmrc`)
- pnpm 9 (`corepack enable && corepack prepare pnpm@9 --activate`)
- Docker Desktop

> If `corepack enable` fails with `EPERM ... C:\Program Files\nodejs`, it needs an
> admin shell to write its shims. Either run it elevated once, or just
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

## 2. Generate the apps — done, already committed

All five apps exist and are wired up. This section is kept as a record of how
they were made; you should not need to run any of it again.

```bash
# API
pnpm dlx @nestjs/cli new apps/api --skip-git --package-manager pnpm

# Dashboards
pnpm create next-app@latest apps/admin --ts --app --eslint --tailwind --src-dir
pnpm create next-app@latest apps/owner-web --ts --app --eslint --tailwind --src-dir

# Mobile
pnpm create expo-app apps/owner-mobile
pnpm create expo-app apps/user-mobile
```

Each app's `tsconfig.json` extends `../../tsconfig.base.json` and each declares
`"@forge/shared": "workspace:*"`. The base config is Node-oriented, so an app
that needs different module/lib settings overrides just those keys on top:

- **api** keeps `emitDecoratorMetadata` / `experimentalDecorators` — without them
  Nest's DI and validation pipes stop working.
- **admin / owner-web** override to `moduleResolution: bundler` + DOM libs, and
  set `transpilePackages: ['@forge/shared']` in `next.config.ts`.
- **mobile** use array extends — `["../../tsconfig.base.json", "expo/tsconfig.base"]`.
  Rightmost wins, so Expo's RN settings (jsx, bundler resolution) take
  precedence while the repo-wide strictness flags still apply.

### `@forge/shared` is a built package

It compiles to `dist/` (CommonJS + `.d.ts`) rather than exporting raw `.ts`.
The API is compiled by `tsc` and run as `node dist/main`, so it cannot import
TypeScript from `node_modules` at runtime — bundlers can, Node can't. This is
also why `turbo.json` has `typecheck` and `test` depend on `^build`.

Consequence: **after editing `packages/shared`, rebuild it** or the other apps
will keep seeing the old types. `pnpm dev` handles this (shared runs
`tsc --watch`); a one-off is `pnpm --filter @forge/shared build`.

### Expo-in-monorepo: no longer a gotcha

Earlier notes here said to hand-write `watchFolders` and
`resolver.nodeModulesPaths` in `metro.config.js`. **Don't** — since SDK 52
`expo/metro-config` detects the workspace root itself, and Expo's monorepo guide
now says to _delete_ those fields. The `metro.config.js` in each mobile app is
just `getDefaultConfig(__dirname)`, kept as the extension point for real
customisation. Verified: `expo export` bundles `@forge/shared` fine.

If a _native_ build ever fails on pnpm's symlinked layout, the lever is
`node-linker=hoisted` in `.npmrc` — not Metro config.

### Lint setup

`eslint.config.mjs` at the root covers `packages/*` and the `lint-staged`
pre-commit hook. Each app brings its own config and that one wins when ESLint
runs with the app as its cwd: `eslint-config-next` for the dashboards, the
generated typescript-eslint setup for the API, `eslint-config-expo` for mobile.
Keep every app's `eslint` on the same major as the root or the shared plugins
resolve twice.

## 3. Daily commands

```bash
pnpm dev         # all apps in parallel (turbo)
pnpm lint
pnpm typecheck
pnpm test
```

`pnpm dev` ports — fixed rather than auto-assigned, so nothing races for 3000:

| app          | url                   |
| ------------ | --------------------- |
| api          | http://localhost:4000 |
| admin        | http://localhost:3000 |
| owner-web    | http://localhost:3001 |
| owner-mobile | Metro on 8081         |
| user-mobile  | Metro on 8082         |

Local infra: Postgres `5432`, MinIO console http://localhost:9001
(`minioadmin` / `minioadmin`), Redis `6379` — unless you've remapped any of them
in a `docker-compose.override.yml`, in which case `docker compose ps` is the
source of truth.

## Conventions

- **Every tenant-scoped table has `gym_id`.** Postgres RLS enforces it; app code sets it from the JWT, never from client input.
- **Schema changes = a migration.** Never edit the DB by hand.
- **Roles/DTOs live in `packages/shared`.** Don't redefine them per app.
- **Conventional commits** (enforced by commitlint): `feat:`, `fix:`, `chore:` …

## Branching

`main` (protected, deploys to staging) ← PR ← short-lived `feat/*` branches.
Two-person team: keep it this simple. No `develop` unless you feel the need.
