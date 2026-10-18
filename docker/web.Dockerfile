# syntax=docker/dockerfile:1
#
# NexusERP web image (T034).
#
# Multi-stage: install, build the static assets, then serve them from a minimal runtime
# that contains no Node build tooling.
#
# IMPORTANT: the built assets are INJECTED into the image, not mounted at runtime. A
# bind-mounted asset directory is the classic pattern for a development setup and it is
# exactly what makes a running container disagree with its own image. This image serves
# the bundle it was built with.
#
# The served assets are the production build (T050). For local development with hot
# reload, run the dev server through `npm run dev --workspace @nexuserp/web` on the host
# rather than rebuilding this image on every change.

# ---------------------------------------------------------------------------
# deps
# ---------------------------------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /repo

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

RUN npm ci --workspace @nexuserp/web --workspace @nexuserp/shared --include-workspace-root

# ---------------------------------------------------------------------------
# build
# ---------------------------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /repo

COPY --from=deps /repo/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
COPY apps/web ./apps/web

# The web app imports types and schemas from the shared package, so it is compiled first.
RUN npm run build --workspace @nexuserp/shared \
 && npm run build --workspace @nexuserp/web

# ---------------------------------------------------------------------------
# runtime
# ---------------------------------------------------------------------------
FROM node:24-alpine AS runtime
WORKDIR /app

# `tini` gives the process a real init so SIGTERM reaches Node. Nothing else is added:
# the static server is a dependency-free script from the repository rather than an
# installed package, so the runtime image contains nothing outside the committed lockfile.
RUN apk add --no-cache tini

COPY --from=build /repo/apps/web/dist ./dist
COPY docker/static-server.mjs ./static-server.mjs

EXPOSE 5173

USER node

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "/app/static-server.mjs"]
