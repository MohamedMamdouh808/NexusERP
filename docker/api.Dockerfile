# syntax=docker/dockerfile:1
#
# NexusERP service image (T033).
#
# Multi-stage so the runtime image carries no compiler, no Prisma CLI, and no dev
# dependencies. Three stages with three jobs:
#
#   deps    - install every dependency from the committed lockfile
#   build   - compile the shared package, then the service
#   runtime - production dependencies plus the compiled output, nothing else
#
# `npm ci` rather than `npm install` (FR-049): it installs exactly the committed tree and
# fails if the lockfile and manifest disagree, so an image can never contain a dependency
# that CI did not test.

# ---------------------------------------------------------------------------
# deps
# ---------------------------------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /repo

# Manifests first so the install layer is cached until a dependency actually changes.
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# `npm ci` needs every workspace manifest to exist before it runs, which is why the
# manifests are copied but not the sources.
#
# The root `postinstall` hook runs as part of `npm ci`, so the script it points at has
# to be in the dependency layer. It finds no schema here and exits without generating
# anything, which is the behaviour the hook is designed for; without the file present,
# however, the install itself fails and the image cannot be built at all.
COPY scripts/postinstall.mjs ./scripts/postinstall.mjs

RUN npm ci --workspace @nexuserp/shared --workspace @nexuserp/api --include-workspace-root

# ---------------------------------------------------------------------------
# build
# ---------------------------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /repo

COPY --from=deps /repo/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# The shared package is a workspace dependency, so it must be compiled before the service
# that imports from it.
RUN npm run build --workspace @nexuserp/shared \
 && npm run build --workspace @nexuserp/api

# Generate the Prisma client inside the image against the schema copied above, so the
# client and the schema can never drift between build and run.
RUN npm run db:generate --workspace @nexuserp/api

# ---------------------------------------------------------------------------
# runtime
# ---------------------------------------------------------------------------
FROM node:24-alpine AS runtime
WORKDIR /app

# `tini` gives the process a real init so SIGTERM reaches Node and shutdown hooks run;
# without it, a container stop is a SIGKILL and an in-flight write is cut off mid-commit.
RUN apk add --no-cache tini

ENV NODE_ENV=production \
    PORT=3000

COPY --from=build /repo/package.json ./package.json
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build /repo/apps/api/prisma ./apps/api/prisma
COPY --from=build /repo/node_modules/.prisma ./node_modules/.prisma

WORKDIR /app/apps/api
EXPOSE 3000

# Runs unprivileged. A container that runs as root turns any code execution flaw into
# root on the host, which costs nothing to avoid.
USER node

COPY --chmod=755 docker/api-entrypoint.sh /usr/local/bin/api-entrypoint.sh

# tini reaps zombies and forwards signals so SIGTERM reaches the server and the
# container stops promptly. The entrypoint applies migrations before serving (T033).
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/api-entrypoint.sh"]
