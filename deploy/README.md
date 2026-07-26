# deploy/

Operational tooling for the community-gaming-portal. Target: a single
**Ubuntu 26.04 LTS** Linode (everything is plain apt + systemd, so Ubuntu
24.04 and Debian 12 work identically) running Postgres, the Rust API, the
demo scanner, the demo-stats parser, Caddy (TLS + reverse proxy + frontend
static serving), and a pg_dump-to-Linode-Object-Storage backup timer.

## Model

Native `.deb` packages + systemd units + Ansible, **not containers in
prod**. Reasoning:

- Rust binaries are small, statically-linked-ish, and ship as a single
  file. `.deb` gives atomic install/upgrade/rollback via apt, ownership
  tracking via `dpkg -L`, and real rollback via version pinning.
- systemd gives process supervision, journald log aggregation, cgroup
  resource limits, and sandboxing (`ProtectSystem=strict` etc.) with
  zero configuration effort.
- Ansible is push-based and agentless — right-sized for one host, scales
  cleanly to three or four without adopting a whole orchestration
  platform. Provisioning uses the `linode.cloud` collection for the same
  reason: one toolchain, no separate Terraform state to babysit.

Dev uses Docker Compose (`../api/docker-compose.yml`) for a Postgres +
MinIO stack. This directory is prod-only.

## Layout

```
deploy/
├── ansible/
│   ├── ansible.cfg
│   ├── requirements.yml        # Galaxy roles + collections (linode.cloud etc.)
│   ├── provision.yml           # Creates the Ubuntu 26.04 Linode (LINODE_TOKEN)
│   ├── site.yml                # Validate → pre-deploy backup → converge
│   ├── inventory/
│   │   └── prod.yml            # Host + domain; `just provision` fills the IP
│   ├── group_vars/
│   │   └── all/
│   │       ├── vars.yml        # Non-secret config
│   │       └── vault.yml       # Ansible Vault: secrets — gitignored, control machine only
│   └── roles/
│       ├── base/               # ops user + key, unattended-upgrades, fail2ban, ufw
│       ├── postgres/           # Postgres 16 (PGDG pin) + portal role + portal_prod DB
│       ├── backups/            # pg_dump → Linode Object Storage, nightly + pre-deploy
│       ├── portal_api/         # Installs the portal-api.deb; renders api.env
│       ├── portal_scanner/     # Installs the portal-scanner.deb; renders scanner.env
│       ├── portal_demo_stats/  # Installs the portal-demo-stats.deb; renders demo-stats.env
│       ├── portal_steam_bot/   # Installs portal-steam-bot.deb (cs2-poller + cs2-enricher); opt-in
│       ├── gameserver_agent/   # CS2 hosts: agent deb + registration + enrollment + MatchZy
│       ├── monitoring/         # Prometheus + Grafana + Loki + Alloy + exporters; opt-in
│       ├── caddy/              # Caddy auto-HTTPS; proxies API + demos.<domain> (+ grafana.)
│       └── portal_web/         # Builds the SPA locally, ships dist → /var/www/portal
├── justfile                    # provision, bootstrap, deploy, deploy-web, logs, ...
└── README.md
```

## Zero-to-running on a fresh Linode

```bash
cd deploy

# 0. Tooling: ansible-core + just + gh + yq + age on your laptop, then
just galaxy                       # install Galaxy roles + collections
just doctor                       # verifies all of the above

# 1. Provision the box (Ubuntu 26.04 LTS, 4 GB, London)
export LINODE_TOKEN=...           # https://cloud.linode.com/profile/tokens
just provision                    # creates the Linode, writes its IP into inventory/prod.yml

# 2. DNS: A records for <portal_domain> AND demos.<portal_domain> → that IP

# 3. Fill in the operator values (checklist below)
$EDITOR ansible/inventory/prod.yml               # portal_domain, caddy_acme_email
$EDITOR ansible/group_vars/all/vars.yml          # backup_age_public_key (age-keygen)
ansible-vault create ansible/group_vars/all/vault.yml   # keys: see vault.example.yml

# 4. First converge — fresh boxes only have root's SSH key, so run as root
#    once; roles/base creates the ops user (with your key) for every run after.
just bootstrap-fresh

# 5. Ship the application (downloads release debs, verifies SHA256SUMS)
just deploy v0.2.1                # portal-api + portal-scanner debs from the GitHub release
just deploy-demo-stats-release v0.1.0
just deploy-web-release v0.1.0    # portal-web deb from the cg-fe release

# 6. One post-install config step: the scanner needs the CS2 game UUID
just db-shell                     #   SELECT id, name FROM games;
$EDITOR ansible/group_vars/all/vars.yml          # set scanner_game_id
just bootstrap                    # re-converge to render scanner.env

# 7. Pin what you shipped, so future deploys are one command
$EDITOR versions.yml              # api/web/demo_stats tags
just deploy-all                   # anytime after: deploy every pin + verify
```

`site.yml` refuses to run while any inventory or vault value is still a
placeholder, so a missed step fails loudly at the top, not halfway through.

### Provisioning notes

- `provision.yml` uses the **`linode.cloud`** collection (in
  `requirements.yml`). Chosen over Terraform to keep the deploy a single
  Ansible toolchain with no external state — the instance is idempotent on
  its label.
- Image slug is `linode/ubuntu26.04` (Linode's `linode/ubuntuXX.YY`
  convention). It could not be verified without a live token — check with
  `linode-cli images list | grep ubuntu` and override via
  `-e linode_image=...` if needed.
- Default size is `g6-standard-2` (2 vCPU / 4 GB) in `eu-west` (London,
  beside the `gb-lon-1` Object Storage bucket). Demo parsing holds a whole
  .dem in memory, so 4 GB is the recommended floor; a 2 GB `g6-standard-1`
  works if demo-stats concurrency stays at 1.
- `LINODE_TOKEN` is operator-supplied and never stored by this repo.

## Operator checklist — every value you must supply

**Inventory (`ansible/inventory/prod.yml`)** — placeholders rejected by
site.yml:

| Value | Meaning |
|---|---|
| `ansible_host` | Box IP — written by `just provision`, or set manually |
| `portal_domain` | Domain Caddy terminates TLS for (A record → box) |
| `caddy_acme_email` | Let's Encrypt contact address |

**Vault (`ansible/group_vars/all/vault.yml`)** — create with
`ansible-vault create ansible/group_vars/all/vault.yml`, keys per
`vault.example.yml`:

| Key | Meaning |
|---|---|
| `vault_postgres_password` | Postgres `portal` role password (socket auth is primary; this is the TCP fallback) |
| `vault_jwt_secret` | ≥ 32 bytes, `openssl rand -hex 32` |
| `vault_linode_access_key` / `vault_linode_secret_key` | Object Storage keys (evidence, demos, backups). **Rotate** — the old box leaked its pair in the Caddyfile |
| `vault_portal_scanner_api_key` | Portal API key (`cgp_…`) the scanner authenticates with |
| `vault_steam_api_key` | Steam Web API key (also the poller's `STEAM_WEB_API_KEY`). **Rotate** — the old box leaked it in `.env` |
| `vault_scanner_s3_*`, `vault_demo_stats_s3_*` (optional) | Per-service S3 overrides; default to the `vault_linode_*` pair |
| `vault_steam_bot_api_key` (only if bots enabled) | Portal API key (`cgp_…`) the poller + enricher authenticate with |
| `vault_steam_bot_username` / `_password` / `_shared_secret` (only if bots enabled) | Dedicated Steam bot account for the enricher's Game Coordinator login (Prime + CS2), and its Guard TOTP secret |
| `vault_grafana_admin_password` (only if monitoring enabled) | Grafana admin login (≥12 chars; applied on Grafana's first start) |
| `vault_tailscale_auth_key` (only if `monitoring_ingress: tailnet`) | Pre-authorized Tailscale key for the box's first `tailscale up`; unused after joining |
| `vault_gameserver_rcon_passwords` (only if gameservers exist) | Dict of RCON passwords keyed by inventory hostname (CS2 runs with `-usercon`) |
| `vault_alert_webhook_url` (optional) | Webhook Grafana alerts POST to (healthchecks.io / ntfy); `""` keeps alerts UI-only |

**Non-secret config (`ansible/group_vars/all/vars.yml`)**:

| Value | Meaning |
|---|---|
| `scanner_game_id` | UUID of the CS2 row in `games` (query after first converge; scanner role fails until set) |
| `backup_age_public_key` | **Required.** age recipient for off-box backup encryption (`age-keygen`; private key → password manager, NEVER the box) |
| `backup_healthcheck_url` | Optional dead-man's-switch ping (healthchecks.io-style; `$URL` on success, `$URL/fail` on failure) |
| `backup_remote_retention_days` | Bucket lifecycle expiry the backups role applies (default 180) |
| `linode_object_storage_region` etc. | Defaults match the London bucket; adjust if you move |
| `ops_ssh_pubkey_file` | Your public key, installed for the `ops` user |
| `monitoring_enabled` | Opt-in monitoring stack; see "Monitoring" below |
| `monitoring_ingress` | `public` (grafana.<domain> vhost + A record) or `tailnet` (Tailscale Serve, no public exposure) |

`vault.yml` is **gitignored** — it never enters the repo, encrypted or not.
Keep it on the control machine only, encrypt it with `ansible-vault` for
defense-in-depth, and store the vault password in your password manager. If
you lose the control machine, recreate `vault.yml` from `vault.example.yml`.

## Flow

Artifacts flow: **tag → tests → deb → smoke install → release → verified
download → apt install on box.**

1. Bump the Cargo version to match, then `git tag v0.2.1 && git push --tags`
   in `api/`. (The workflow refuses a tag that doesn't equal the package
   version — the deb version comes from Cargo.toml, so this keeps
   `just installed` and the tag telling the same story.)
2. `.github/workflows/build-deb.yml` runs the ci workflow first (a tag on
   a broken commit publishes nothing), builds
   `portal-api_0.2.1-1_amd64.deb` + `portal-scanner_0.2.1-1_amd64.deb`,
   **apt-installs them on a clean runner** (postinst/unit/purge sanity),
   and only then attaches them + `SHA256SUMS` to the GitHub release.
3. From your laptop: `just deploy v0.2.1`. The justfile downloads the debs
   AND the checksums, verifies them, and runs `ansible-playbook`.
   site.yml first runs `pg-backup.service` (a seconds-old restore point —
   migrations are forward-only), then installs and restarts.
4. The deb postinst creates users/dirs and reloads systemd; the service's
   startup code runs migrations before binding the port. Each role ends
   with a **health gate** (API: `/health`; demo-stats: `/health`; pollers:
   unit active), so a converge that exits green means the service is up —
   not just installed.

Same pattern, other repos: `just deploy-demo-stats-release vX.Y.Z`
(csgo-demo-stats), `just deploy-steam-bot-release vX.Y.Z` (cg-steam-bot),
`just deploy-web-release vX.Y.Z` (cg-fe → portal-web deb), or pin
everything in `versions.yml` and run `just deploy-all`.

Rollback: `just deploy v0.2.0` — the roles pass `allow_downgrade`, so apt
accepts the older deb and restarts. DB migrations are forward-only: if the
newer version added a migration you also need the pre-deploy dump (see the
restore runbook below). Keep the schema backwards-compatible with the
previous release for one version, or use expand/contract migrations.

## Frontend build & ship

`roles/portal_web` (tag `portal_web`), three modes in precedence order:

- **Deb (preferred, prod)** — `just deploy-web-release vX.Y.Z` downloads
  the `portal-web_<ver>_all.deb` that cg-fe's `release-web.yml` built from
  the tag (test-gated, smoke-installed, checksummed). dpkg tracks every
  file: upgrades REMOVE stale hashed assets (the tarball modes never do),
  and rollback is deploying the older deb. The first deb deploy clears a
  tarball-era docroot once (untracked files would linger forever).
- **Local build, then ship** (`just deploy-web`, dev iteration): `npm ci
  && npm run build` runs on *your machine*, with `VITE_API_URL=""` → the
  bundle uses same-origin relative URLs (the SPA and API share one Caddy
  vhost, no CORS). The dist/ tree is tarred and unpacked into
  `/var/www/portal` owned by the `caddy` user. Building locally is
  deliberate: vite + vue-tsc want ~2 GB of RAM the Linode doesn't have to
  spare.
- **Tarball**: pass `-e portal_web_dist_tarball=/path/to/dist.tar.gz`
  (created with `tar -czf dist.tar.gz -C web/dist .`) to ship a prebuilt
  dist without the deb.

Note the production bundle **fails fast** if `VITE_API_URL` is undefined
(see `web/src/api/baseUrl.ts`); empty-string means same-origin and is the
value baked by both `web/.env.production` and this role.

## Backups & restore runbook

Three timers (`roles/backups`), all reporting failures through
`backup-failure@.service` (journal tail + optional
`backup_healthcheck_url` dead-man's-switch ping):

| Timer | When | What |
|---|---|---|
| `pg-backup` | nightly 03:15 | `pg_dump \| zstd` → **validated** (`zstd -t`, `pg_restore --list`, sha256 sidecar) → local copy in `/var/lib/portal/backups/` → **age-encrypted** upload to `portal-backups` |
| `config-backup` | weekly | `/etc/portal` archive (env files + the gameserver **agent-ca**, the one thing not re-renderable from vault) → encrypted → `s3://…/config/` |
| `pg-restore-verify` | monthly | newest local dump → `portal_restore_test` → sanity counts → drop. Rehearsal as a mechanism — a backup you've never restored is a hope, not a backup |

Additionally, **every** `just deploy` / `just bootstrap` run of the
`portal_api` tag starts `pg-backup.service` first and waits for it, so a
migration never runs without a fresh restore point.

**Encryption model:** local dumps stay plaintext-zstd (the box holds the
live DB anyway — and it keeps local restores key-free); everything in the
bucket is encrypted to `backup_age_public_key`. The private key lives in
your password manager ONLY. Rationale: the bucket credentials on the box
are the same pair the API uses, so a box or key compromise must not read
historical backups. Remote retention is a bucket lifecycle rule the role
applies (`backup_remote_retention_days`, default 180).

Restore — all confirm-gated, health-checked recipes:

```bash
just backup-list          # local dumps + encrypted bucket copies
just restore /var/lib/portal/backups/portal_prod_<STAMP>.sql.zst
                          # local dump: stop writers → drop/create → pg_restore → restart → /health
just restore-remote portal_prod_<STAMP>.sql.zst ~/path/to/portal-backup.key
                          # bucket copy: fetch .age → decrypt ON the box (key
                          # streams over ssh stdin, never touches its disk)
                          # → checksum verify → same restore flow
just restore-verify       # rehearsal on demand (monthly timer does this too)
```

The manual steps behind `just restore` (for when you need to deviate) are
what they always were: stop `portal-api portal-scanner`, `dropdb` +
`createdb -O portal`, `zstd -dc … | pg_restore --no-owner --role=portal`,
restart — the API re-runs any migrations newer than the dump on boot.

## Daily ops

```bash
just deploy-all          # deploy every versions.yml pin, then verify
just deploy v0.2.1       # api + scanner release (with pre-deploy DB snapshot)
just deploy-web-release v0.1.0   # SPA release deb
just verify              # /health + /health/ready through Caddy + unit status
just logs                # journalctl -fu portal-api on the box
just tail-errors         # last 200 WARN/ERROR lines incl. the backup units
just status              # portal units + backup timers
just installed           # dpkg versions on the box — compare with versions.yml
just backup-now          # dump + config archive immediately, off-schedule
just backup-list         # what restore points exist, local + bucket
just db-shell            # psql into portal_prod over SSH
just ssh                 # plain SSH into the box
```

## Secrets

`ansible/group_vars/all/vault.yml` is an Ansible Vault file that is
**gitignored — never committed** (encrypted or otherwise); it lives only on
your control machine. Encrypt it with `ansible-vault` and keep the password
in a password manager. `vault.example.yml` (tracked, placeholders only)
shows every key (see the operator checklist above).

Secrets land on the box in `/etc/portal/*.env` (api, scanner, demo-stats,
backup, optionally the bots), all `root:portal 0640` (backup.env is
`root:postgres`). Nothing writes secrets to journald. The env files are
seeded by each deb's postinst on first install and never clobbered on
upgrade (they're deliberately NOT dpkg conffiles — Ansible owns their
contents and re-renders them from the vault on every converge).

Two keys exist only outside the vault: the **backup age private key**
(password manager) and the **gameserver agent-ca** (on-box, offsite-copied
by config-backup).

## OS compatibility notes (Ubuntu 26.04 / Debian 12)

- Postgres comes from the **PGDG** apt repo so `postgresql-16` exists
  regardless of what the distro ships by default (Ubuntu 26.04 defaults
  newer than 16). If PGDG hasn't published a suite for a brand-new release
  codename yet, temporarily point the pgdg.list at the previous LTS
  codename.
- Caddy's cloudsmith repo is distro-agnostic (`any-version` suite) —
  works on both.
- `base` installs `acl` (Ansible `become_user: postgres` needs setfacl on
  minimal cloud images) and standard `ufw`/`fail2ban`/`awscli` packages,
  all present in Ubuntu 24.04/26.04 and Debian 12.

## Steam match-tracking bots (opt-in)

Two long-running services in the sibling `../steam_bot` workspace feed the
portal's match/rank pipeline. They are **opt-in** (`portal_steam_bot_enabled`,
default `false`) because the enricher needs a dedicated Steam account:

- **cs2-poller** — discovers new match share codes via the Steam Web API for
  players who opted in with a match-sharing auth code. No Steam account
  needed, just `vault_steam_bot_api_key` + `vault_steam_api_key`.
- **cs2-enricher** — logs into the CS2 Game Coordinator with a **dedicated
  bot account** (never a personal one; needs CS2 in library, ideally Prime),
  fetches full match data by share code, and extracts rank/ELO from the demo.
  Needs `vault_steam_bot_username` / `_password` / `_shared_secret`.

Note this is the **auth-code opt-in** model, not an "add the bot as a friend"
model — players self-serve a Steam match-sharing auth code; nobody has to
friend the bot. (The friend-list lookup exists only in the `cs2-matches` dev
CLI, which is not deployed.)

Build and ship (the deb bundles both services + their systemd units):

```bash
cd ../steam_bot
cargo build --release -p cs2-poller -p cs2-enricher
cargo deb -p cs2-enricher --no-build      # → target/debian/portal-steam-bot_X.Y.Z_amd64.deb

# from deploy/, after setting the vault_steam_bot_* keys:
just deploy-steam-bot ../steam_bot/target/debian/portal-steam-bot_0.1.0_amd64.deb
```

`just deploy-steam-bot` sets `portal_steam_bot_enabled=true` for that run; to
include the bots in every `site.yml` converge, set it in `group_vars`. The
poller and enricher, like the scanner, also need `SCANNER_GAME_ID`-equivalent
config baked in via `steam_bot_game_slug` (default `cs2`).

## Game-server hosts

CS2 boxes running MatchZy + portal-server-agent are fully converged from
the same playbook — per host the only inputs are an SSH login, an entry in
the `gameservers` inventory group (the hostname doubles as the server's
name in the portal registry), and its RCON password in
`vault_gameserver_rcon_passwords`. A converge (`just bootstrap`, or
`just deploy-agent <deb>` for agent-only runs) then:

1. applies `base` hardening with the game + GOTV ports opened in the same
   batch that enables ufw (no player-dropping window),
2. installs the portal-server-agent deb,
3. registers the server in the portal registry and enrolls the agent —
   `portal-cli gameserver create` (idempotent by hostname) + a one-time
   token, delegated to the portal box; the keypair never leaves the game
   host,
4. writes the demo-upload block into MatchZy's `config.cfg`
   (`gameserver_matchzy_config_path`; the block comes from
   `/etc/portal/agent/matchzy_portal.cfg`, persisted by enroll),
5. gates on the unit being active AND the portal actually receiving
   heartbeats (any status but `offline` — `error` just means the CS2
   server's RCON isn't up yet).

Prerequisites: `gameserver_integration_enabled: true`, the
`agents.<domain>` DNS record, and a portal-api deb new enough to ship the
`portal-cli gameserver create` command. The agent CA is generated
automatically by the portal_api role on its first converge with the
integration enabled. Enrollment is one-time per host: re-converges skip
it while `/etc/portal/agent/client.pem` exists; to re-enroll, revoke via
`portal-cli gameserver revoke`, delete `/etc/portal/agent`, and re-run.

## Monitoring

Opt-in via `monitoring_enabled: true` (docs/observability-design.md is the
full design). One role (`roles/monitoring`) installs, all loopback-bound:

- **Prometheus** :9090 — 15s scrape, 30d retention. The scrape config is
  generated from `monitoring_metrics_ports` in `group_vars/all/vars.yml`;
  that dict is the §3 port registry (portal-api 9464, scanner 9465,
  demo-stats 9466, poller 9467, enricher 9468).
- **Grafana** :3001 — reached via one of two ingress modes
  (`monitoring_ingress`):
  - `public` (default): `grafana.<domain>` Caddy vhost + fourth DNS A
    record. Note the ACME cert lands in Certificate Transparency logs,
    which publicly advertises the Grafana.
  - `tailnet`: Tailscale Serve terminates HTTPS on the machine's ts.net
    name and proxies to loopback — no public vhost, no DNS record, no CT
    entry. Needs MagicDNS + HTTPS Certificates enabled on the tailnet and
    `vault_tailscale_auth_key` for the first converge (single-use is fine;
    once joined, later converges skip `tailscale up`). Break-glass when
    the tailnet is down: `ssh -L 3001:127.0.0.1:3001`. Funnel (public
    exposure via Tailscale) is never enabled.

  Login `admin` / `vault_grafana_admin_password` in both modes (seeded on
  first start; rotate later with `grafana-cli admin reset-admin-password`).
  Dashboards (home / API / pipeline / bots / agents / logs) and the alert
  rules are provisioned from the role — edits in the UI don't survive a
  converge.
- **Loki** :3110 (3100 belongs to portal-demo-stats) + **Alloy** tailing
  journald with labels `{unit, level, hostname}`, 14d retention. journald
  stays the archive; Loki is the query index.
- **node_exporter** :9100 with the systemd collector (unit/timer states)
  and the textfile collector — the backup scripts drop
  `portal_backup_last_{success_timestamp,size_bytes,duration}_seconds`
  into `/var/lib/node_exporter/textfile/`, and a daily probe exports TLS
  cert expiry per vhost.
- **postgres_exporter** :9187 over the local socket (peer auth, runs as
  postgres), **Caddy** admin :2019 scraped for per-vhost edge RED.

Alerts (Grafana-managed, provisioned): ServiceDown, UnitFailed, ApiUnready,
StaleLoop, BackupStale (26h — no-data also fires), ConfigBackupStale,
RestoreRehearsalFailed (32d), GcSessionDown, AgentOffline, DiskFull,
CertExpiry (14d), DbPoolSaturated, DemoParseConcurrency, plus two
Loki-derived rules (error-spam per unit, pg-backup journal silence).
Delivery: `vault_alert_webhook_url` (optional webhook contact point).

Enabling the stack also renders `METRICS_ADDR=127.0.0.1:<port>` into each
service's `/etc/portal/*.env` — re-run the service roles (or a full
`just bootstrap`) after flipping the flag so the services start their
loopback exporters. A deb on a box without the stack keeps `METRICS_ADDR`
unset and starts no listener. `just monitoring-status` checks the stack
end-to-end.

## What's not here yet
