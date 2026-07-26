# Observability design — metrics, logs, dashboards

**Status:** implemented (2026-07-26) — all four rollout phases landed; see
"Implementation notes" at the end for the deliberate deviations.
**Scope:** every deployed service (portal-api, portal-scanner,
portal-demo-stats, cs2-poller, cs2-enricher, portal-server-agent), the
backup jobs, the host, and the Grafana/Loki/Prometheus stack that reads
them. Companion to `deploy/` (which today has health *gates* at deploy
time but no runtime signal at all — only the API and demo-stats even have
health endpoints).

## 1. Goals / non-goals

Goals, in order:

1. **"Is it broken?" answerable from one page** — a Grafana home dashboard
   where every service, timer, and the host show green/red with one number
   each.
2. **"Why is it broken?" answerable without ssh** — logs (Loki) and
   metrics (Prometheus) correlated by unit name and time.
3. **Silent failure becomes impossible** — everything long-running exports
   a `*_last_success_timestamp_seconds`; alerts fire on staleness, not
   just on crashes (a crash-looping unit is loud; a poller that "runs"
   but has been getting HTTP 403 from Steam for a week is the real enemy —
   exactly the failure class the backup overhaul just fixed for dumps).
4. Capacity floors: know demo-parse memory/duration and DB pool saturation
   before they page us.

Non-goals (now): distributed tracing, per-player analytics (that's product
data, not ops data), multi-box federation, SLO error budgets. The design
leaves room for all four.

## 2. Stack (single box, all loopback)

```
┌─ portal box ────────────────────────────────────────────────────────┐
│  services ──/metrics──▶ Prometheus ──▶ Grafana ◀── Loki ◀── Alloy   │
│      │                   :9090          :3001       :3110     │      │
│      └── journald ────────────────────────────────────────────┘      │
│  node_exporter :9100   postgres_exporter :9187   caddy :2019         │
└──────── Caddy: grafana.<domain> ──▶ 127.0.0.1:3001 ─────────────────┘
```

- **Prometheus** (`:9090`, loopback): 15s scrape, 30d retention. Single
  static scrape config — the ports table below IS the service registry.
- **Grafana** (`:3001`, loopback): fronted by a new `grafana.<domain>`
  Caddy vhost (auto-HTTPS, fourth DNS A record). Grafana's own auth;
  admin password becomes `vault_grafana_admin_password`.
- **Loki** (`:3110`, loopback — NOT the default 3100, which
  portal-demo-stats owns) + **Grafana Alloy** reading journald. Labels:
  `unit`, `level`, `hostname`. 14d retention, filesystem store — logs
  live in journald anyway; Loki is the query index, not the archive.
- **node_exporter** (`:9100`) with `--collector.systemd` (unit states —
  this alone covers "is every portal unit active/failed" including the
  backup timers) and `--collector.textfile` (see §5, backup metrics).
- **postgres_exporter** (`:9187`) over the local socket (peer auth, same
  pattern as pg-backup).
- **Caddy** already exports Prometheus metrics on its admin endpoint
  (`:2019/metrics`, loopback): request rates/latencies per host, TLS cert
  expiry timestamps. Free — just scrape it.
- **ufw stays closed**: nothing new listens publicly; Grafana is the only
  ingress, via Caddy. Remote game hosts are NOT scraped (§4.6).

Deployment: one new `roles/monitoring` ansible role (packages from the
Grafana apt repo, config templates, loopback binds, Caddy vhost gated on
`monitoring_enabled: true`), plus ~5-line `/metrics` listener additions
per Rust service. `versions.yml` and the deb pipeline are untouched —
the stack itself installs from upstream apt, pinned by the role.

## 3. Conventions (all Rust services)

- **Crate**: `metrics` facade + `metrics-exporter-prometheus`
  (`PrometheusBuilder` with `.with_http_listener`). One dependency pair,
  no framework coupling, works identically in axum services and plain
  tokio loops.
- **Endpoint**: `GET /metrics` on `127.0.0.1:<port>` from this table
  (never on the public service port; never through Caddy):

  | Port | Service | | Port | Service |
  |---|---|---|---|---|
  | 9464 | portal-api | | 9467 | cs2-poller |
  | 9465 | portal-scanner | | 9468 | cs2-enricher |
  | 9466 | portal-demo-stats | | 9469 | portal-server-agent (local-only, §4.6) |

  Configured as `METRICS_ADDR=127.0.0.1:9464` in each `/etc/portal/*.env`
  (empty = disabled, so a deb on a box without the stack changes nothing).
- **Naming**: `portal_<service>_<noun>_<unit>` with Prometheus suffix
  rules (`_total` counters, `_seconds` histograms, gauges bare).
  Every service exports:
  - `*_build_info{version}` gauge=1 — dashboards show what's deployed
    (pairs with `versions.yml`/`just installed`).
  - `*_last_success_timestamp_seconds` per primary loop — the universal
    staleness alert hook.
- **Cardinality budget**: labels are enums, never IDs. No player ids, no
  match ids, no share codes, no file names. Route labels use the axum
  route *template* (`/v1/tournaments/{id}`), not the resolved path.
  Histogram buckets: default web buckets for HTTP; explicit coarse
  buckets (1s…600s) for demo parsing. Target: <2k series/service.

## 4. Per-service metric inventory

### 4.1 portal-api (axum, the big one)

RED on every route + the subsystems that fail independently:

| Metric | Type | Labels |
|---|---|---|
| `portal_api_http_requests_total` | counter | `route`, `method`, `status` |
| `portal_api_http_request_duration_seconds` | histogram | `route`, `method` |
| `portal_api_ws_connections` | gauge | `kind` (lobby, gameserver-agent) |
| `portal_api_ws_messages_total` | counter | `kind`, `direction` |
| `portal_api_db_pool_connections` / `_idle` / `_wait_seconds` | gauges/hist | — (from sqlx `PoolOptions` hooks) |
| `portal_api_auth_failures_total` | counter | `reason` (bad-token, expired, rate-limited) |
| `portal_api_rate_limited_total` | counter | `route-class` |
| `portal_api_s3_ops_total` / `_duration_seconds` | counter/hist | `bucket-role` (evidence, demos), `op`, `outcome` |
| `portal_api_saga_executions_total` | counter | `saga`, `outcome` |
| `portal_api_evidence_processed_total` | counter | `type`, `outcome` |
| `portal_api_migrations_applied_total` + `_last_success_timestamp_seconds` | counter/gauge | — (boot-time) |
| `portal_api_gameserver_agents_connected` | gauge | — |
| `portal_api_gameserver_agent_last_heartbeat_timestamp_seconds` | gauge | `server` (bounded: registered servers) |

Implementation: one axum middleware layer for RED; the rest are
point-instrumentations at existing call sites. The `/health/ready` handler
already knows how to probe DB + demo-service — export its result as
`portal_api_ready` gauge so Prometheus sees what the gate sees.

### 4.2 portal-scanner

`portal_scanner_scan_cycles_total{outcome}` ·
`portal_scanner_scan_duration_seconds` ·
`portal_scanner_objects_seen_total` / `_new_total` ·
`portal_scanner_registered_total{outcome}` (API batch submissions) ·
`portal_scanner_pending_demos` gauge ·
`portal_scanner_api_errors_total{status_class}` ·
`portal_scanner_s3_errors_total` ·
`portal_scanner_last_success_timestamp_seconds` (per loop: scan,
processing).

### 4.3 portal-demo-stats

RED on `/stats/{filename}` + `/health` (route template label, NOT the
filename), plus the parse pipeline — the box's memory hazard:

`portal_demo_stats_parse_jobs_total{outcome, source}` ·
`portal_demo_stats_parse_duration_seconds` (coarse buckets) ·
`portal_demo_stats_parse_bytes` histogram (demo size) ·
`portal_demo_stats_jobs_in_flight` gauge (should be ≤1 on the 4 GB box —
alert if the concurrency assumption ever breaks) ·
`portal_demo_stats_cache_hits_total` / `_misses_total` (stats dir) ·
`portal_demo_stats_s3_fetches_total{outcome}` ·
`portal_demo_stats_last_success_timestamp_seconds`.

### 4.4 cs2-poller — promotion to a proper daemon

Today (`bins/cs2-poller/src/main.rs:167`) it's a `loop { poll-everyone;
sleep }` with clap+env config: no listener, no graceful shutdown, no
health signal beyond "the process exists", and one slow Steam call
stretches the whole cycle. Promotion, in the same spirit as the other
services (no framework, ~100 lines):

1. `tokio::select!` main loop: ticker + `signal::ctrl_c`/SIGTERM →
   in-flight cycle finishes, then clean exit (systemd `TimeoutStopSec`
   stops being a race).
2. Jittered ticker (avoid thundering-herd against Steam on multi-bot
   futures) with per-cycle deadline = `poll_interval` (an overrunning
   cycle is skipped-and-counted, not queued).
3. Loopback HTTP listener (hyper, no axum needed): `/metrics` + `/healthz`
   (200 iff last cycle < 3×interval ago) — systemd unit gains
   `Type=notify` + watchdog later if we want belt-and-braces.
4. `sd_notify` READY for ordered startup (optional, cheap).

Metrics: `cs2_poller_tracked_players` gauge ·
`cs2_poller_cycles_total{outcome}` · `cs2_poller_cycle_duration_seconds` ·
`cs2_poller_steam_requests_total{outcome}` (outcome: ok, auth-expired,
rate-limited, error — **auth-expired per player is the top operator
signal**: it means a player's match-sharing auth code needs refreshing) ·
`cs2_poller_sharecodes_discovered_total` ·
`cs2_poller_submissions_total{outcome}` ·
`cs2_poller_last_success_timestamp_seconds`.

### 4.5 cs2-enricher

The Game Coordinator session is the fragile part — make its state a
first-class metric: `cs2_enricher_gc_session_up` gauge ·
`cs2_enricher_gc_reconnects_total{reason}` ·
`cs2_enricher_logon_failures_total{reason}` (bad creds vs Steam Guard vs
rate-limit — each needs a different human response) ·
`cs2_enricher_matches_enriched_total{outcome}` ·
`cs2_enricher_enrich_duration_seconds` ·
`cs2_enricher_queue_depth` gauge (pending share codes from the portal) ·
`cs2_enricher_rank_extractions_total{outcome}` ·
`cs2_enricher_last_success_timestamp_seconds`. Same daemon-promotion
items as the poller (it shares the loop-and-sleep shape).

### 4.6 portal-server-agent — aggregate, don't scrape

Agents run on OTHER PEOPLE'S game hosts: Prometheus must not need inbound
reach to them, and their operators shouldn't need ours. Two tiers:

- **Primary (portal-side aggregation)**: the API already receives
  heartbeats and get5_status over the agent WS — export per-server gauges
  from the API's registry (§4.1: `agents_connected`,
  `agent_last_heartbeat_timestamp_seconds{server}`). Alerts about agents
  come from the portal's metrics. Zero new network paths.
- **Secondary (local diagnostics)**: the agent itself serves
  `127.0.0.1:9469/metrics` for the game-host operator:
  `agent_ws_connected` gauge · `agent_reconnects_total` ·
  `agent_backoff_seconds` gauge · `agent_heartbeats_sent_total` ·
  `agent_rcon_commands_total{command,outcome}` ·
  `agent_rcon_duration_seconds` · `agent_demo_uploads_total{outcome}`.
  Documented in the cg-server-agent README; never scraped by us.

### 4.7 Backups, DB, host, Caddy (no code changes)

- **Backup jobs → textfile collector**: the Phase-4 scripts
  (`pg-backup.sh`, `config-backup.sh`, `restore-verify.sh`) each append a
  3-line `.prom` file to `/var/lib/node_exporter/textfile/` on completion:
  `portal_backup_last_success_timestamp_seconds{job}`,
  `portal_backup_last_size_bytes{job}`,
  `portal_backup_last_duration_seconds{job}`. This + the healthcheck-URL
  ping gives belt AND braces; the `backup-failure@` path stays for logs.
- **postgres_exporter**: connections, TPS, cache hit ratio, table bloat,
  replication-free single-node defaults. Watch `pg_locks` during deploys
  (migration lock contention is our known deploy risk).
- **node_exporter**: disk (demo cache + backups partition!), memory
  (demo parses), CPU, plus `systemd` collector for unit/timer states.
- **Caddy `:2019/metrics`**: per-vhost RED from the edge + TLS cert
  `not_after` (alert at <14 days — covers ACME renewal failures).

## 5. Logs (Loki)

journald is already the single log destination (every unit, structured
fields free). Alloy tails it with labels `{unit, level}` only — message
content stays unindexed (Loki's model; keeps it tiny). Retention 14d.
Two derived signals worth alert rules directly from Loki:
`level=error` rate per unit (catches error-spam that never trips a
metric), and absence of pg-backup log lines across 26h (redundant with
the textfile metric — intentionally).

Log hygiene items found while designing (fix during implementation):
services log at info per-cycle even when idle (poller every 60s) — move
idle cycles to debug so Loki's error-rate signal stays meaningful.

## 6. Starter alert set

| Alert | Expr sketch | Why |
|---|---|---|
| ServiceDown | `up == 0` or systemd unit ≠ active, 5m | any exporter/unit dead |
| ApiUnready | `portal_api_ready == 0`, 5m | what the deploy gate checks, continuously |
| StaleLoop | `time() - *_last_success_timestamp_seconds > 3×interval` | poller/scanner/enricher silently wedged |
| BackupStale | `time() - portal_backup_last_success{job="pg-backup"} > 26h` | THE one that must never be silent |
| RestoreRehearsalFailed | textfile metric age > 32d | monthly rehearsal missed/failed |
| GcSessionDown | `cs2_enricher_gc_session_up == 0`, 15m | needs human (Steam Guard etc.) |
| AgentOffline | `time() - agent_last_heartbeat{server} > 90s`, 5m | matches the portal's own offline rule |
| DiskFull | node_exporter <15% free on / and backups mount | demo cache + dumps growth |
| CertExpiry | caddy cert `not_after - time() < 14d` | ACME renewal failure |
| DbPoolSaturated | pool in-use / max > 0.8, 10m | capacity floor |

Delivery: Grafana alerting → the existing `backup_healthcheck_url`
provider family (healthchecks.io/ntfy/email) — no new pager service; one
`vault_alert_webhook_url` covers it.

## 7. Rollout phases

1. **Stack + free metrics** (no service code): `roles/monitoring`
   (Prometheus, Grafana, Loki, Alloy, node_exporter+systemd+textfile,
   postgres_exporter, Caddy scrape, grafana vhost + DNS), backup-script
   `.prom` emission, home dashboard from systemd/node/postgres/caddy
   signals, alerts: ServiceDown/BackupStale/DiskFull/CertExpiry.
2. **HTTP services**: portal-api middleware + subsystem counters,
   demo-stats parse metrics; ApiUnready/DbPool alerts; RED dashboards.
3. **Daemonize + instrument the bots**: cs2-poller promotion (§4.4),
   cs2-enricher (§4.5), portal-scanner counters; StaleLoop/GcSessionDown
   alerts.
4. **Agent visibility**: API-side aggregation gauges + admin dashboard
   panel; local agent metrics in the cg-server-agent deb; AgentOffline
   alert. Log-hygiene pass (§5).

Each phase is independently shippable through the existing deb pipeline;
phase 1 is pure `deploy/` work and can land alongside any of the others.

## 8. Open questions (decide before phase 1)

- Grafana anonymous read-only for league admins, or operator-only?
  (Default: operator-only.)
- Prometheus retention 30d on the 80 GB Linode disk — fine at this series
  budget (~50 MB/day) but recheck after phase 3.
- Alloy vs promtail: promtail is in maintenance mode → Alloy, unless the
  apt story on Ubuntu 26.04 argues otherwise at implementation time.
- Does `metrics-exporter-prometheus`'s tiny HTTP listener satisfy the
  poller's `/healthz` too, or does the poller grow a 20-line hyper
  service for both? (Lean: one listener serving both paths.)


## 9. Implementation notes (2026-07-26)

All four phases are implemented. Deviations from the design above, each
deliberate:

- **CertExpiry**: Caddy's admin endpoint does not reliably export
  certificate `not_after`, so a daily `cert-expiry-metrics.timer` probes
  each vhost through the local listener with openssl and writes
  `portal_tls_cert_not_after_timestamp_seconds{domain}` via the textfile
  collector. The alert treats no-data as firing.
- **§8 listener question**: resolved with a shared `crates/portal-daemon`
  (steam_bot workspace) serving BOTH `/metrics` and `/healthz` from one
  hand-rolled hyper listener — the exporter's bundled listener answers any
  path with metrics, which would make `/healthz` a lie. `/healthz` is
  200 iff the last successful cycle is younger than 3×interval.
- **Label spelling**: Prometheus labels cannot contain `-`, so
  `bucket-role` → `bucket_role`, `route-class` → `route_class`.
- **DB pool wait**: sqlx exposes no acquire-time hook;
  `portal_api_db_pool_wait_seconds` is sampled by timing a real acquire
  every 15s in the metrics sampler (accurate under saturation, which is
  when it matters). Pool/WS gauges are sampled from the managers rather
  than counted at connect/disconnect sites so they can never drift.
- **Rate limiting**: counted in the RED middleware (any 429 leaving the
  router), labelled with the route template as the route class.
- **StaleLoop**: one generic rule over
  `{__name__=~".*_last_success_timestamp_seconds"}` at 15m (3× the slowest
  loop) instead of per-loop thresholds; per-service `/healthz` staleness
  stays at 3× each bot's own interval.
- **agent_demo_uploads_total**: not implemented — the agent never touches
  demo files (MatchZy uploads directly to the portal), so uploads are
  visible as `portal_api_s3_ops_total{bucket_role="demos"}` instead.
- **Enricher structural fix** (found during §4.5 work): the enricher used
  to connect to the GC once and exit on failure; a session that died
  mid-run marked every pending match failed at batch_size/cycle. It now
  reconnects with backoff, classifies logon failures
  (bad-creds/steam-guard/rate-limit), and treats a closed GC stream as
  session death rather than per-match failure.
- **Alerting**: Grafana-managed provisioned rules (files under
  `roles/monitoring`), delivery via the optional vault_alert_webhook_url
  contact point; rules are read-only in the UI by design.
- **Ingress modes** (added post-implementation): `monitoring_ingress:
  public | tailnet`. `tailnet` drops the grafana.<domain> vhost, DNS
  record, and CT-logged ACME cert entirely — Tailscale Serve terminates
  HTTPS on the machine's ts.net name and proxies to loopback Grafana,
  which never leaves 127.0.0.1. Chosen over plain WireGuard because the
  operator already runs the Tailscale client, Serve preserves the
  loopback-only bind invariant (plain WG would need Grafana bound to the
  wg interface), and ts.net HTTPS keeps secure cookies + a stable name.
  SSH stays the break-glass path.
