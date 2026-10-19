#!/bin/sh
# Data-surface check (T030, FR-020, FR-021, FR-022, SC-005).
#
# The managed database provider enables an automatic REST surface over the database by
# default. That surface enforces none of the product's rules - no tenant isolation, no
# permission checks - so every table it can reach is reachable by anyone holding a public
# key. Staging must have it off, and "off" must be demonstrated rather than assumed.
#
# What this proves, and what it does not:
#   PROVED  - an anonymous request naming a known table on the project's OWN REST surface
#             is refused and discloses no rows, AND the project itself reports that its Data
#             API is serving no schema. The second half is what makes the first half mean
#             something: a mistyped address, a missing project, and an unrelated error all
#             produce "no rows".
#   NOT PROVED - that the database is unreachable by any other means. This asserts the
#             provider's automatic surface only. The product's own connection does not pass
#             through it and is deliberately unaffected.
#
# Runnable by a reader, without deploying anything (FR-042):
#
#   SUPABASE_PROJECT_REF=<project ref> \
#   SUPABASE_ACCESS_TOKEN=<personal access token> \
#   sh scripts/check-supabase-data-api.sh
#
# Both values are read-only tokens: this check reads the project's configuration and
# changes nothing. It is not a pipeline check, because it asserts against a live project
# that CI does not and must not own (research.md R-013).
#
# Requires a POSIX shell (Git Bash, WSL, or a Linux container) plus `curl`, so it is not
# runnable from Windows PowerShell.

set -eu

# Deliberately explicit tests rather than `${VAR:?message}`. The message argument of `${:?}`
# is re-parsed as a word, so an apostrophe in ordinary prose ("the staging project's
# reference") opens a single-quoted string that never closes, and the whole script fails to
# parse at an unrelated line - observed here as `syntax error near unexpected token ';;'`
# pointing at a `case` block thirty lines away. An explicit test has no such surface.
if [ -z "${SUPABASE_PROJECT_REF:-}" ]; then
  printf 'FAILED: set SUPABASE_PROJECT_REF to the staging project reference\n' >&2
  exit 1
fi
if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  printf 'FAILED: set SUPABASE_ACCESS_TOKEN to a Supabase personal access token\n' >&2
  exit 1
fi

# A table the repository's own schema creates (database/prisma/schema.prisma), so naming it
# cannot accidentally probe a table that does not exist - which would refuse for the wrong
# reason.
TABLE="${TABLE:-permissions}"

REST_URL="https://${SUPABASE_PROJECT_REF}.supabase.co/rest/v1/${TABLE}?select=*&limit=1"
CONFIG_URL="https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/postgrest"

command -v curl >/dev/null 2>&1 || {
  printf 'FAILED: curl is required to run this check\n' >&2
  exit 1
}

WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

log() { printf '  %s\n' "$*"; }
fail() { printf 'FAILED: %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 1. The refusal: an anonymous request for a known table discloses no rows.
# ---------------------------------------------------------------------------
log "1/2  Anonymous request for a known table on the project's own REST surface"
log "     ${REST_URL}"

rest_status=$(curl -s -o "$WORK_DIR/rest.body" -w '%{http_code}' --max-time 30 "$REST_URL" || printf '000')
rest_body=$(cat "$WORK_DIR/rest.body" 2>/dev/null || printf '')

log "     observed status: ${rest_status}"
log "     observed body:   ${rest_body}"

case "$rest_status" in
  000|'')
    fail "the request did not complete. An unreachable or mistyped address is not a closed
       surface; check SUPABASE_PROJECT_REF before reading this as a result"
    ;;
esac

case "$rest_status" in
  2*)
    # The surface answered. The only acceptable answer is an empty result set, and even
    # that is recorded as an answer rather than as a refusal.
    [ "$rest_body" = '[]' ] || fail "the data surface answered ${rest_status} with rows: ${rest_body}"
    log "     the surface answered ${rest_status} and disclosed no rows"
    ;;
  *)
    # Any non-2xx is a refusal. The status is RECORDED rather than compared against a
    # guessed code: the refusal code is the provider's to choose, and pinning a guess
    # would make this check fail for a reason that is not a security finding.
    log "     refused with status ${rest_status}"
    ;;
esac

# The body must not carry a row array however the request was answered.
case "$rest_body" in
  \[*)
    case "$rest_body" in
      '[]') ;;
      *) fail "the response disclosed a row array although the surface should refuse: ${rest_body}" ;;
    esac
    ;;
esac

# ---------------------------------------------------------------------------
# 2. The setting: the project itself reports no schema served by the Data API.
# ---------------------------------------------------------------------------
log "2/2  The project's own Data API configuration, read through the Management API"
log "     ${CONFIG_URL}"

config_status=$(curl -s -o "$WORK_DIR/config.body" -w '%{http_code}' --max-time 30 \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" "$CONFIG_URL" || printf '000')
config_body=$(cat "$WORK_DIR/config.body" 2>/dev/null || printf '')

log "     observed status: ${config_status}"
log "     observed configuration: ${config_body}"

[ "$config_status" = '200' ] || fail "the Management API did not return the Data API
       configuration (status ${config_status}). An unreadable setting is not a disabled one,
       and this check must not pass because the second half of it could not run"

# The provider answers this resource with a `db_schema` field naming the schema the surface
# serves. Its absence means the response shape is not the one this check knows how to read -
# which must fail loudly rather than read as "no schema, therefore disabled".
case "$config_body" in
  *'"db_schema"'*) ;;
  *)
    fail "the configuration carries no db_schema field, so this check cannot tell
       'disabled' from 'not read'. Pin the observed shape here, in one place:
       ${config_body}"
    ;;
esac

served_schema=$(printf '%s' "$config_body" |
  sed -n 's/.*"db_schema"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')

[ -z "$served_schema" ] || fail "the project's Data API is serving schema '${served_schema}':
       every table in it is reachable through a surface that enforces none of the product's
       tenant or permission rules"

log "     the project reports no schema served by the Data API"

printf '\nPASS: the anonymous request is refused and discloses no rows, and the project\n'
printf '      itself reports its Data API serving no schema.\n'
