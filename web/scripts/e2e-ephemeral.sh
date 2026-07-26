#!/usr/bin/env bash
# Run the Playwright suite against a fully EPHEMERAL stack:
#   - throwaway tmpfs Postgres (docker) — no state survives the run
#   - a dedicated API instance (migrations run on boot, admin bootstrapped fresh)
#   - a dedicated Vite dev server
# None of it touches the long-lived dev DB (5433), the dev API (3000), or a
# running dev Vite (5173). This is the same shape as CI's e2e job — running it
# locally exercises the fresh-database seed path CI depends on.
#
# Usage:
#   ./scripts/e2e-ephemeral.sh [playwright args...]           # instance 0
#   ./scripts/e2e-ephemeral.sh -i 2 e2e/awards.spec.ts        # instance 2
#
# PARALLEL AGENTS — read this before running two at once.
# Every mutable resource below is namespaced by instance id, because this
# script used to hardcode them all. In particular it opens by force-removing
# its Postgres container: with a shared name, a second agent's *startup*
# silently destroyed the first agent's database mid-run, and the damage
# surfaced as unreproducible test failures rather than as an error. Give each
# concurrent agent its own -i, and nothing is shared:
#
#   resource            instance 0            instance N
#   postgres container  portal-e2e-pg         portal-e2e-pg-N
#   postgres port       5434                  5434 + N
#   api port            3001                  3001 + N
#   web port            5174                  5174 + N
#   api log             /tmp/portal-e2e-api.log   /tmp/portal-e2e-api-N.log
#   seeded state        e2e/.seeded-state.json    e2e/.seeded-state.N.json
#   playwright report   playwright-report     playwright-report-N
#   test artefacts      test-results          test-results-N
#
# Instance 0 keeps every historical path, so an existing invocation is
# unchanged. Ports are checked for collisions before anything is started.
#
# STILL SHARED between instances (by design — do not assume isolation):
#   - the api/ checkout and its cargo target dir. Concurrent `cargo build`
#     serialises on cargo's own file lock: safe, just slower. But all
#     instances run whatever Rust source is on disk *now*, so do not edit
#     api/ while parallel runs are in flight.
#   - the api/ git worktree. `git worktree` on web/ does not isolate it —
#     web, api, steam_bot, demoparser and demo-stats-service are separate
#     repos, not one.
set -euo pipefail

# `-i N` must come first, and everything after it is forwarded verbatim to
# playwright. Deliberately not getopts: playwright takes its own long flags
# (--headed, --debug, --grep), and getopts would reject them as unknown
# options before they ever reached it.
INSTANCE=0
if [ "${1:-}" = "-i" ]; then
  INSTANCE="${2:-}"
  shift 2 2>/dev/null || { echo "-i needs a value" >&2; exit 2; }
fi

[[ "${INSTANCE}" =~ ^[0-9]+$ ]] || { echo "instance must be a non-negative integer, got '${INSTANCE}'" >&2; exit 2; }

API_DIR="$(cd "$(dirname "$0")/../../api" && pwd)"
WEB_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Instance 0 keeps the historical names so existing habits keep working.
if [ "${INSTANCE}" -eq 0 ]; then
  SUFFIX=""
else
  SUFFIX="-${INSTANCE}"
fi

PG_NAME="portal-e2e-pg${SUFFIX}"
PG_PORT=$((5434 + INSTANCE))
API_PORT=$((3001 + INSTANCE))
WEB_PORT=$((5174 + INSTANCE))
API_LOG="/tmp/portal-e2e-api${SUFFIX}.log"

export DATABASE_URL="postgres://portal:portal@localhost:${PG_PORT}/portal_e2e"
export VITE_API_URL="http://localhost:${API_PORT}"
export E2E_WEB_PORT="${WEB_PORT}"
export PLAYWRIGHT_BASE_URL="http://localhost:${WEB_PORT}"
export E2E_ADMIN_EMAIL="${E2E_ADMIN_EMAIL:-admin@example.com}"
export E2E_ADMIN_PASSWORD="${E2E_ADMIN_PASSWORD:-AdminPassword123!}"
# Read by e2e/seeded-state-path.ts (global-setup writes, fixtures read) and by
# playwright.config.ts for the artefact directories. Exported here so the
# runner and the tests cannot disagree about which instance they are.
export E2E_INSTANCE="${INSTANCE}"
export E2E_REPORT_DIR="playwright-report${SUFFIX}"
export E2E_RESULTS_DIR="test-results${SUFFIX}"

# Must match e2e/seeded-state-path.ts exactly — that module is what the tests
# read, this is only the pre-run cleanup of a stale file.
if [ "${INSTANCE}" -eq 0 ]; then
  SEEDED_STATE="${WEB_DIR}/e2e/.seeded-state.json"
else
  SEEDED_STATE="${WEB_DIR}/e2e/.seeded-state.${INSTANCE}.json"
fi

echo "--- instance ${INSTANCE}: pg :${PG_PORT} · api :${API_PORT} · web :${WEB_PORT}"

# Preflight. Fail loudly on a collision rather than half-starting a stack on
# top of someone else's — the whole point of the instance id is that a clash
# is a mistake worth reporting, not something to route around.
for port_pair in "postgres:${PG_PORT}" "api:${API_PORT}" "web:${WEB_PORT}"; do
  name="${port_pair%%:*}"; port="${port_pair##*:}"
  # The probe runs in a subshell, so fd 3 closes with it — do NOT try to close
  # it here. A failed `exec` redirection kills a non-interactive shell outright,
  # ignoring both `set -e` guards and `|| true`, which turned this very check
  # into a silent exit 1.
  if (exec 3<>"/dev/tcp/127.0.0.1/${port}") 2>/dev/null; then
    echo "port ${port} (${name}) is already in use." >&2
    echo "Another instance is probably running — pick a different -i." >&2
    exit 1
  fi
done

if docker ps -a --format '{{.Names}}' | grep -qx "${PG_NAME}"; then
  echo "docker container '${PG_NAME}' already exists." >&2
  echo "Another instance ${INSTANCE} run is live, or a previous one died without" >&2
  echo "cleanup. Remove it with: docker rm -f ${PG_NAME}" >&2
  exit 1
fi

API_PID=""
cleanup() {
  echo "--- teardown (instance ${INSTANCE})"
  [ -n "${API_PID}" ] && kill "${API_PID}" 2>/dev/null || true
  docker rm -f "${PG_NAME}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "--- ephemeral postgres (tmpfs) on :${PG_PORT}"
docker run --rm -d --name "${PG_NAME}" \
  -p "${PG_PORT}:5432" \
  --tmpfs /var/lib/postgresql/data \
  -e POSTGRES_USER=portal -e POSTGRES_PASSWORD=portal -e POSTGRES_DB=portal_e2e \
  postgres:16-alpine >/dev/null
until docker exec "${PG_NAME}" pg_isready -U portal -d portal_e2e >/dev/null 2>&1; do sleep 1; done

echo "--- building API + CLI (cached when unchanged; cargo lock serialises across instances)"
# SQLX_OFFLINE: the compile-time sqlx macros must not validate against the
# ephemeral DB — it is empty until the API boots and runs migrations.
(cd "${API_DIR}" && SQLX_OFFLINE=true cargo build -p portal-app -p portal-cli --quiet)

echo "--- API on :${API_PORT} (migrations run on boot)"
(
  cd "${API_DIR}" &&
  PORT="${API_PORT}" \
  JWT_SECRET="e2e-ephemeral-jwt-secret-that-is-long-enough" \
  PORTAL_AUTH_RATE_BURST=10000 PORTAL_AUTH_RATE_PER_SECOND=1000 \
  PORTAL_PUBLIC_URL="http://localhost:${API_PORT}" \
  PORTAL_FRONTEND_URL="http://localhost:${WEB_PORT}" \
  ./target/debug/portal
) > "${API_LOG}" 2>&1 &
API_PID=$!
for _ in $(seq 1 60); do
  curl -sf "http://localhost:${API_PORT}/health" >/dev/null && break
  sleep 2
done
curl -sf "http://localhost:${API_PORT}/health" >/dev/null || {
  echo "API failed to start; last log lines from ${API_LOG}:"; tail -20 "${API_LOG}"; exit 1
}

echo "--- bootstrap admin"
(cd "${API_DIR}" && ./target/debug/portal-cli bootstrap admin \
  --username e2e_admin \
  --email "${E2E_ADMIN_EMAIL}" \
  --password "${E2E_ADMIN_PASSWORD}" \
  --display-name "E2E Admin" \
  --force)

# P-143: the internal (X-API-Key) pipeline routes need a key the tests know.
# This stack seeds its world over HTTP, never via `seed full`, so the key is
# minted explicitly — `e2e/fixtures/internal-api.fixture.ts` carries its pair.
echo "--- seed internal API key"
(cd "${API_DIR}" && ./target/debug/portal-cli seed internal-api-key)

echo "--- playwright (fresh seed into an empty database)"
rm -f "${SEEDED_STATE}"
cd "${WEB_DIR}"
npx playwright test "$@"
