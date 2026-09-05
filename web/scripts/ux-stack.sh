#!/usr/bin/env bash
# A LONG-LIVED local stack for looking at the app.
#
# Sibling of e2e-ephemeral.sh, with one deliberate difference: that script tears
# everything down when Playwright exits, which is right for tests and useless
# for a UX walk — you cannot click through a stack that no longer exists. This
# one stays up until you stop it.
#
#   ./scripts/ux-stack.sh up       # postgres + api + vite, then prints the URLs
#   ./scripts/ux-stack.sh status   # what is listening, and is it healthy
#   ./scripts/ux-stack.sh down     # stop everything
#
# Ports are outside the e2e range (instances 0-9 use 5434/3001/5174 upward), so
# this can run alongside a test run without either noticing the other.
set -euo pipefail

WEB_DIR="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$(cd "${WEB_DIR}/../api" && pwd)"

PG_NAME=portal-ux-pg
PG_PORT=5441
API_PORT=3007
WEB_PORT=5180
RUN_DIR="${TMPDIR:-/tmp}/portal-ux"
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD='E2eAdmin!2345'

mkdir -p "${RUN_DIR}"

usage() { sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

require_docker() {
  if docker ps >/dev/null 2>&1; then return 0; fi
  cat >&2 <<'MSG'
Docker is not answering.

  * Docker Desktop not started?   Start it, wait ~60s, try again.
      Windows/WSL: powershell.exe -NoProfile -Command \
        "Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe'"

  * `docker` found but "could not be found in this WSL 2 distro"?
      That message comes from the Windows shim: the engine is running but this
      distro is not integrated. Docker Desktop → Settings → Resources →
      WSL Integration → enable this distro → Apply & Restart.

  * Neither?  Any Postgres 16 on ${PG_PORT} works; export DATABASE_URL and skip
      the container by running the api/vite steps below by hand.
MSG
  exit 1
}

up() {
  require_docker

  if docker ps --format '{{.Names}}' | grep -qx "${PG_NAME}"; then
    echo "--- postgres already running on :${PG_PORT}"
  else
    echo "--- postgres (tmpfs, throwaway) on :${PG_PORT}"
    docker rm -f "${PG_NAME}" >/dev/null 2>&1 || true
    docker run --rm -d --name "${PG_NAME}" \
      -p "${PG_PORT}:5432" \
      --tmpfs /var/lib/postgresql/data \
      -e POSTGRES_USER=portal -e POSTGRES_PASSWORD=portal -e POSTGRES_DB=portal_ux \
      postgres:16-alpine >/dev/null
    until docker exec "${PG_NAME}" pg_isready -U portal -d portal_ux >/dev/null 2>&1; do sleep 1; done
  fi

  # SQLX_OFFLINE, because portal-db has compile-time query macros that would
  # otherwise try to validate against a database that has no schema yet.
  echo "--- building api + cli (first run is slow; cached after)"
  (cd "${API_DIR}" && SQLX_OFFLINE=true cargo build -p portal-app -p portal-cli --quiet)

  local db="postgres://portal:portal@localhost:${PG_PORT}/portal_ux"

  if curl -sf "http://localhost:${API_PORT}/health" >/dev/null 2>&1; then
    echo "--- api already up on :${API_PORT}"
  else
    echo "--- api on :${API_PORT} (migrations run on boot)"
    (cd "${API_DIR}" && DATABASE_URL="${db}" PORT="${API_PORT}" \
      JWT_SECRET="ux-walk-jwt-secret-that-is-long-enough" \
      PORTAL_AUTH_RATE_BURST=10000 PORTAL_AUTH_RATE_PER_SECOND=1000 \
      PORTAL_PUBLIC_URL="http://localhost:${API_PORT}" \
      PORTAL_FRONTEND_URL="http://localhost:${WEB_PORT}" \
      ./target/debug/portal) > "${RUN_DIR}/api.log" 2>&1 &
    for _ in $(seq 1 60); do
      curl -sf "http://localhost:${API_PORT}/health" >/dev/null && break
      sleep 2
    done
    curl -sf "http://localhost:${API_PORT}/health" >/dev/null || {
      echo "api did not come up; last lines of ${RUN_DIR}/api.log:" >&2
      tail -25 "${RUN_DIR}/api.log" >&2
      exit 1
    }
  fi

  echo "--- admin account"
  (cd "${API_DIR}" && DATABASE_URL="${db}" ./target/debug/portal-cli bootstrap admin \
    --username ux_admin --email "${ADMIN_EMAIL}" --password "${ADMIN_PASSWORD}" \
    --display-name "UX Admin" --force >/dev/null)

  if curl -sf "http://localhost:${WEB_PORT}" >/dev/null 2>&1; then
    echo "--- vite already up on :${WEB_PORT}"
  else
    echo "--- vite on :${WEB_PORT}"
    (cd "${WEB_DIR}" && VITE_API_URL="http://localhost:${API_PORT}" \
      npx vite --port "${WEB_PORT}" --strictPort) > "${RUN_DIR}/vite.log" 2>&1 &
    for _ in $(seq 1 40); do
      curl -sf "http://localhost:${WEB_PORT}" >/dev/null && break
      sleep 2
    done
  fi

  cat <<MSG

  web    http://localhost:${WEB_PORT}
  api    http://localhost:${API_PORT}
  admin  ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}
  logs   ${RUN_DIR}/{api,vite}.log

Next: node scripts/ux/seed-world.mjs && node scripts/ux/walk.mjs all
MSG
}

status() {
  printf 'postgres  %s\n' "$(docker ps --filter "name=${PG_NAME}" --format '{{.Status}}' 2>/dev/null || echo 'not running')"
  printf 'api       %s\n' "$(curl -sf "http://localhost:${API_PORT}/health" >/dev/null 2>&1 && echo "healthy on :${API_PORT}" || echo 'down')"
  printf 'vite      %s\n' "$(curl -sf "http://localhost:${WEB_PORT}" >/dev/null 2>&1 && echo "serving on :${WEB_PORT}" || echo 'down')"
}

down() {
  # The API and Vite are backgrounded children of a shell that has already
  # exited, so they are matched by what they listen on rather than by job id.
  for port in "${API_PORT}" "${WEB_PORT}"; do
    pids="$(lsof -ti "tcp:${port}" 2>/dev/null || true)"
    [ -n "${pids}" ] && kill ${pids} 2>/dev/null || true
  done
  docker rm -f "${PG_NAME}" >/dev/null 2>&1 || true
  echo "--- stopped (the database was tmpfs; nothing survives)"
}

case "${1:-}" in
  up) up ;;
  down) down ;;
  status) status ;;
  ""|-h|--help) usage ;;
  *) echo "unknown command: $1" >&2; usage 2 ;;
esac
