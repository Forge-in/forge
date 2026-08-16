# Multi-stage build for @forge/api.
#
# Nothing in this repo could be deployed before this file existed. The image is the
# deployable artifact regardless of where it runs, so the host choice (Railway/Render now,
# ECS/Fargate + RDS later) stays an infrastructure decision with no application changes.
#
# Build from the REPO ROOT, not from this directory:
#   docker build -f apps/api/Dockerfile -t forge-api .

# ---------------------------------------------------------------------------------------
# Stage 1: prune the monorepo to just what @forge/api needs.
#
# `turbo prune --docker` rather than `pnpm deploy`: pnpm's workspace deploy has enough
# symlink and node-linker sharp edges to eat an afternoon, and turbo prune exists for exactly
# this. It emits `out/json` (manifests only) and `out/full` (sources) — that split is what
# lets the dependency layer cache independently of source edits.
# ---------------------------------------------------------------------------------------
FROM node:22-alpine AS pruner
WORKDIR /repo

RUN corepack enable
COPY . .
RUN pnpm dlx turbo@2 prune --scope=@forge/api --docker

# ---------------------------------------------------------------------------------------
# Stage 2: production dependencies only.
#
# A SEPARATE install rather than `pnpm prune --prod` on the build tree. `prune --prod` is
# interactive ("The modules directories will be removed... Proceed?"), so in a non-TTY build
# it silently does nothing — the first version of this file shipped an 805MB image containing
# the Nest CLI, jest, typescript and drizzle-kit because of exactly that.
# ---------------------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /repo

RUN corepack enable
COPY --from=pruner /repo/out/json/ ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# ---------------------------------------------------------------------------------------
# Stage 3: build. Needs devDependencies, none of which reach the final image.
# ---------------------------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /repo

RUN corepack enable
COPY --from=pruner /repo/out/json/ ./
RUN pnpm install --frozen-lockfile

COPY --from=pruner /repo/out/full/ ./

# Builds @forge/shared and @forge/db first: the API is compiled by tsc and run as
# `node dist/main`, so it cannot import TypeScript from node_modules at runtime.
RUN pnpm turbo run build --filter=@forge/api

# ---------------------------------------------------------------------------------------
# Stage 4: runtime.
# ---------------------------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

# TZ=UTC is not cosmetic. A container inheriting a non-UTC timezone changes what `now()::date`
# and `new Date()` mean, and every business-day boundary here is derived by converting UTC
# into Asia/Kolkata explicitly (see toBusinessDate). A container already in local time
# double-shifts and silently corrupts daily metrics for late-opening branches.
ENV NODE_ENV=production \
    TZ=UTC

# dumb-init as PID 1: Node does not reap zombies or forward signals correctly as PID 1, and
# without SIGTERM reaching the app the shutdown hooks never run — so every deploy severs
# in-flight queries and the resulting burst of 500s gets blamed on the release.
# curl is for HEALTHCHECK only.
RUN apk add --no-cache dumb-init curl

# Production dependency tree from the deps stage, then only the built output. Nothing from
# the builder's node_modules — no compilers, no test runners, no drizzle-kit.
COPY --from=deps    --chown=node:node /repo/node_modules ./node_modules
COPY --from=deps    --chown=node:node /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps    --chown=node:node /repo/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps    --chown=node:node /repo/packages/db/node_modules ./packages/db/node_modules

COPY --from=builder --chown=node:node /repo/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=node:node /repo/apps/api/package.json ./apps/api/package.json
COPY --from=builder --chown=node:node /repo/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=node:node /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder --chown=node:node /repo/packages/db/dist ./packages/db/dist
COPY --from=builder --chown=node:node /repo/packages/db/package.json ./packages/db/package.json

# The .sql files, so this same image can run the migration release step. src/migrate.ts
# resolves them relative to __dirname, which is why they must sit next to dist/.
COPY --from=builder --chown=node:node /repo/packages/db/migrations ./packages/db/migrations

USER node
EXPOSE 4000

# Liveness only, deliberately. /readyz checks Postgres and Redis, and a failing HEALTHCHECK
# gets the container KILLED — pointing it at readiness means one database blip restarts every
# instance at once and hits a recovering database with a herd of cold starts.
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:4000/healthz || exit 1

ENTRYPOINT ["dumb-init", "--"]

# Migrations are NOT run on boot. They are a separate release step before the new version
# starts: two booting instances would race the same DDL, and the runtime role deliberately has
# no DDL privileges — granting them would hand schema rewrite to the most exposed process.
#
# Run this against the SAME image, with DATABASE_MIGRATION_URL (forge_migrator):
#   docker run --rm -e DATABASE_MIGRATION_URL=... forge-api node packages/db/dist/migrate.js
CMD ["node", "apps/api/dist/main.js"]
