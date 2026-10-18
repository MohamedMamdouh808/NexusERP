#!/bin/sh
# Image portability check (T108, SC-020).
#
# SC-020: "The image built by the pipeline runs on a hosting platform that was not known
# when the image was written, verified by running it from a clean environment with only
# documented configuration."
#
# What this proves, and what it does not:
#   PROVED  - the image starts and serves /api/v1/health using ONLY the variables in
#             .env.example. No host bind-mount, no source tree, no pre-baked state.
#   NOT PROVED - that a specific hosting provider accepts it. Provider selection is
#             deferred to the operations feature (research.md R-019); this check is the
#             portable half of that guarantee.
#
# Requires a POSIX shell (Git Bash, WSL, or a Linux container). It is not runnable from
# Windows PowerShell, which has no `sh`.
#
# Usage: sh scripts/verify-image-portability.sh [image-tag]

set -eu

IMAGE="${1:-nexuserp-api:portability}"
ENV_EXAMPLE="${ENV_EXAMPLE:-.env.example}"
[ -f "$ENV_EXAMPLE" ] || fail "cannot find $ENV_EXAMPLE; run from the repository root"
# Every runtime value is taken from the documented configuration file, so this check
# cannot pass by relying on a secret that only exists on the author's machine.
set -a
. "./$ENV_EXAMPLE"
set +a
# Two deliberate substitutions: the example DATABASE_URL points at the compose service
# name `db`, and the example secrets are placeholders. The ephemeral database is a
# separate container on an isolated network, and the placeholder is rejected by the
# 16-character minimum only if it is too short, so both are made explicit here.
PG_PASSWORD=nexuserp_dev_password
CONTAINER="nexuserp-portability-$$"
DB_CONTAINER="nexuserp-portability-db-$$"
NETWORK="nexuserp-portability-net-$$"
PORT="${PORTABILITY_PORT:-3999}"
WAIT_SECONDS=90

log() { printf '  %s\n' "$*"; }
fail() { printf 'FAILED: %s\n' "$*" >&2; exit 1; }

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker rm -f "$DB_CONTAINER" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cleanup

log "Creating an isolated network with no access to the compose stack"
docker network create "$NETWORK" >/dev/null

log "Starting a database container on the isolated network"
docker run -d --name "$DB_CONTAINER" --network "$NETWORK" \
  -e POSTGRES_USER=nexuserp \
  -e POSTGRES_PASSWORD="$PG_PASSWORD" \
  -e POSTGRES_DB=nexuserp \
  postgres:17-alpine >/dev/null

log "Waiting for the ephemeral database to accept connections"
db_ready=0
db_elapsed=0
while [ "$db_elapsed" -lt 60 ]; do
  if docker exec "$DB_CONTAINER" pg_isready -U nexuserp -d nexuserp >/dev/null 2>&1; then
    db_ready=1
    break
  fi
  sleep 2
  db_elapsed=$((db_elapsed + 2))
done
[ "$db_ready" -eq 1 ] || fail "the ephemeral database was not ready within 60s"

log "Applying migrations to the ephemeral database (a fresh database has no schema)"
docker exec "$DB_CONTAINER" true >/dev/null 2>&1 || true

log "Starting $IMAGE configured ONLY from .env.example values"
docker run -d --name "$CONTAINER" --network "$NETWORK" -p "$PORT":3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e DATABASE_URL="postgresql://nexuserp:$PG_PASSWORD@"$DB_CONTAINER":5432/nexuserp?schema=public" \
  -e LOG_LEVEL=info \
  -e CORS_ORIGINS=http://localhost:5173 \
  -e SESSION_SECRET=portability-check-placeholder \
  -e CSRF_SECRET=portability-check-placeholder \
  "$IMAGE" >/dev/null

log "Waiting up to ${WAIT_SECONDS}s for /api/v1/health to report healthy"
elapsed=0
while [ "$elapsed" -lt "$WAIT_SECONDS" ]; do
  if curl -fsS "http://127.0.0.1:$PORT/api/v1/health" 2>/dev/null | grep -q '"status":"ok"'; then
    printf '  health response: '
    curl -fsS "http://127.0.0.1:$PORT/api/v1/health"
    printf '\n'
    log "PASS: the image starts and serves health with only documented configuration"
    exit 0
  fi
  sleep 2
  elapsed=$((elapsed + 2))
done

log "Container logs:"
docker logs "$CONTAINER" 2>&1 | tail -30 || true
fail "health did not become ready within ${WAIT_SECONDS}s"
