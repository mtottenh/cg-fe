#!/usr/bin/env bash
# Run the full Playwright suite against a fully EPHEMERAL stack:
#   - throwaway tmpfs Postgres (docker, port 5434) — no state survives the run
#   - a dedicated API instance on :3001 (migrations run on boot, admin
#     bootstrapped fresh)
#   - a dedicated Vite dev server on :5174
# None of it touches the long-lived dev DB (5433), the dev API (3000), or a
# running dev Vite (5173). This is the same shape as CI's e2e job — running
# it locally exercises the fresh-database seed path CI depends on.
#
# Usage: ./scripts/e2e-ephemeral.sh [playwright args...]
set -euo pipefail

API_DIR="$(cd "$(dirname "$0")/../../api" && pwd)"
WEB_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PG_NAME="portal-e2e-pg"
PG_PORT=5434
API_PORT=3001
WEB_PORT=5174

export DATABASE_URL="postgres://portal:portal@localhost:${PG_PORT}/portal_e2e"
export VITE_API_URL="http://localhost:${API_PORT}"
export E2E_WEB_PORT="${WEB_PORT}"
export PLAYWRIGHT_BASE_URL="http://localhost:${WEB_PORT}"
export E2E_ADMIN_EMAIL="${E2E_ADMIN_EMAIL:-admin@example.com}"
export E2E_ADMIN_PASSWORD="${E2E_ADMIN_PASSWORD:-AdminPassword123!}"

API_PID=""
cleanup() {
  echo "--- teardown"
  [ -n "${API_PID}" ] && kill "${API_PID}" 2>/dev/null || true
  docker rm -f "${PG_NAME}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "--- ephemeral postgres (tmpfs) on :${PG_PORT}"
docker rm -f "${PG_NAME}" >/dev/null 2>&1 || true
docker run --rm -d --name "${PG_NAME}" \
  -p "${PG_PORT}:5432" \
  --tmpfs /var/lib/postgresql/data \
  -e POSTGRES_USER=portal -e POSTGRES_PASSWORD=portal -e POSTGRES_DB=portal_e2e \
  postgres:16-alpine >/dev/null
until docker exec "${PG_NAME}" pg_isready -U portal -d portal_e2e >/dev/null 2>&1; do sleep 1; done

echo "--- building API + CLI (cached when unchanged)"
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
) > /tmp/portal-e2e-api.log 2>&1 &
API_PID=$!
for _ in $(seq 1 60); do
  curl -sf "http://localhost:${API_PORT}/health" >/dev/null && break
  sleep 2
done
curl -sf "http://localhost:${API_PORT}/health" >/dev/null || {
  echo "API failed to start; last log lines:"; tail -20 /tmp/portal-e2e-api.log; exit 1
}

echo "--- bootstrap admin"
(cd "${API_DIR}" && ./target/debug/portal-cli bootstrap admin \
  --username e2e_admin \
  --email "${E2E_ADMIN_EMAIL}" \
  --password "${E2E_ADMIN_PASSWORD}" \
  --display-name "E2E Admin" \
  --force)

echo "--- playwright (fresh seed into an empty database)"
rm -f "${WEB_DIR}/e2e/.seeded-state.json"
cd "${WEB_DIR}"
npx playwright test "$@"
