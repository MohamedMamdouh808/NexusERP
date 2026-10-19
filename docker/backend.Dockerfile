# syntax=docker/dockerfile:1
#
# NexusERP service image (T033).
#
# Multi-stage so the runtime image carries no compiler, no Prisma CLI, and no dev
# dependencies. Three stages with three jobs:
#
#   deps    - install every dependency from the committed lockfile
#   build   - compile the shared package, then the service, then the Prisma client
#   runtime - production dependencies plus the compiled output, nothing else
#
# `npm ci` rather than `npm install` (FR-049): it installs exactly the committed tree and
# fails if the lockfile and manifest disagree, so an image can never contain a dependency
# that CI did not test.
#
# Workspace layout (002-repo-restructure): shared/, backend/, frontend/ and database/ live
# at the repository root. This image builds shared/ and backend/ and carries the schema
# from database/, which the entrypoint applies before serving.

# ---------------------------------------------------------------------------
# deps
# ---------------------------------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /repo

# Manifests first so the install layer is cached until a dependency actually changes.
# EVERY workspace manifest is copied, not just the ones this image builds: the root
# manifest declares all four as workspaces, so `npm ci` resolves all four before it runs
# and fails outright if one is absent.
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
COPY database/package.json ./database/

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
COPY shared ./shared
COPY backend ./backend
# The schema is not the service's to own, but the generated client must be generated from
# the schema that ships with this image, so the database workspace is present here.
COPY database ./database
# `db:generate` runs through the same wrapper the repository uses, so the schema path the
# image generates from is the one the repository defines rather than a second copy.
COPY scripts/with-root-env.mjs ./scripts/with-root-env.mjs

# The shared package is a workspace dependency, so it must be compiled before the service
# that imports from it.
RUN npm run build --workspace @nexuserp/shared \
 && npm run build --workspace @nexuserp/api

# Generate the Prisma client inside the image against the schema copied above, so the
# client and the schema can never drift between build and run. The schema lives in the
# database workspace, and `db:generate` is the command that already names it.
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
COPY --from=build /repo/shared/dist ./shared/dist
COPY --from=build /repo/shared/package.json ./shared/package.json
COPY --from=build /repo/backend/dist ./backend/dist
COPY --from=build /repo/backend/package.json ./backend/package.json
# The database workspace owns the schema and the migrations, so the image carries them at
# the same relative path the repository uses. The entrypoint applies migrations from here
# before it serves; with no schema in the image, `prisma migrate deploy` could not run at
# all and the container would serve traffic against an unmigrated database.
COPY --from=build /repo/database/prisma ./database/prisma
COPY --from=build /repo/node_modules/.prisma ./node_modules/.prisma

WORKDIR /app/backend
EXPOSE 3000

# Runs unprivileged. A container that runs as root turns any code execution flaw into
# root on the host, which costs nothing to avoid.
USER node

COPY --chmod=755 docker/api-entrypoint.sh /usr/local/bin/api-entrypoint.sh

# tini reaps zombies and forwards signals so SIGTERM reaches the server and the
# container stops promptly. The entrypoint applies migrations before serving (T033).
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/api-entrypoint.sh"]
