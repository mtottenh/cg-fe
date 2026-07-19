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
│   │       └── vault.yml       # Ansible Vault: secrets (encrypted, committed)
│   └── roles/
│       ├── base/               # ops user + key, unattended-upgrades, fail2ban, ufw
│       ├── postgres/           # Postgres 16 (PGDG pin) + portal role + portal_prod DB
│       ├── backups/            # pg_dump → Linode Object Storage, nightly + pre-deploy
│       ├── portal_api/         # Installs the portal-api.deb; renders api.env
│       ├── portal_scanner/     # Installs the portal-scanner.deb; renders scanner.env
│       ├── portal_demo_stats/  # Installs the portal-demo-stats.deb; renders demo-stats.env
│       ├── caddy/              # Caddy auto-HTTPS; proxies API + demos.<domain>
│       └── portal_web/         # Builds the SPA locally, ships dist → /var/www/portal
├── justfile                    # provision, bootstrap, deploy, deploy-web, logs, ...
└── README.md
```

## Zero-to-running on a fresh Linode

```bash
cd deploy

# 0. Tooling: ansible-core + just + gh + yq on your laptop, then
just galaxy                       # install Galaxy roles + collections

# 1. Provision the box (Ubuntu 26.04 LTS, 4 GB, London)
export LINODE_TOKEN=...           # https://cloud.linode.com/profile/tokens
just provision                    # creates the Linode, writes its IP into inventory/prod.yml

# 2. DNS: A records for <portal_domain> AND demos.<portal_domain> → that IP

# 3. Fill in the operator values (checklist below)
$EDITOR ansible/inventory/prod.yml               # portal_domain, caddy_acme_email
ansible-vault create ansible/group_vars/all/vault.yml   # keys: see vault.example.yml

# 4. First converge — fresh boxes only have root's SSH key, so run as root
#    once; roles/base creates the ops user (with your key) for every run after.
just bootstrap-fresh

# 5. Ship the application
just deploy v0.2.1                # portal-api + portal-scanner debs from the GitHub release
just deploy-demo-stats /path/to/portal-demo-stats_X.Y.Z_amd64.deb
just deploy-web                   # builds ../web locally, ships dist/ to /var/www/portal

# 6. One post-install config step: the scanner needs the CS2 game UUID
just db-shell                     #   SELECT id, name FROM games;
$EDITOR ansible/group_vars/all/vars.yml          # set scanner_game_id
just bootstrap                    # re-converge to render scanner.env
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
| `vault_steam_api_key` | Steam Web API key. **Rotate** — the old box leaked it in `.env` |
| `vault_scanner_s3_*`, `vault_demo_stats_s3_*` (optional) | Per-service S3 overrides; default to the `vault_linode_*` pair |

**Non-secret config (`ansible/group_vars/all/vars.yml`)**:

| Value | Meaning |
|---|---|
| `scanner_game_id` | UUID of the CS2 row in `games` (query after first converge; scanner role fails until set) |
| `linode_object_storage_region` etc. | Defaults match the London bucket; adjust if you move |
| `ops_ssh_pubkey_file` | Your public key, installed for the `ops` user |

The vault password itself lives in your password manager — never in the
repo. Commit `vault.yml` only in its encrypted form.

## Flow

Artifacts flow: **tag → CI → release → apt install on box.**

1. `git tag v0.2.1 && git push --tags` in `api/`.
2. `.github/workflows/build-deb.yml` builds `portal-api_0.2.1_amd64.deb`
   and `portal-scanner_0.2.1_amd64.deb`, attaches them to the GitHub
   release.
3. From your laptop: `just deploy v0.2.1`. The justfile downloads the
   debs from the release and runs `ansible-playbook` with the paths.
   site.yml first runs `pg-backup.service` (a seconds-old restore point —
   migrations are forward-only), then installs and restarts.
4. The deb postinst creates users/dirs and reloads systemd; the service's
   startup code runs migrations before binding the port.

The demo-stats deb comes from the sibling `demo-stats-service` repo —
build it there and ship with `just deploy-demo-stats <path-to-deb>`.

Rollback: `just deploy v0.2.0` — apt downgrades, service restarts. DB
migrations are forward-only: if the newer version added a migration you
also need the pre-deploy dump (see the restore runbook below). Keep the
schema backwards-compatible with the previous release for one version, or
use expand/contract migrations.

## Frontend build & ship

`roles/portal_web` (tag `portal_web`, `just deploy-web`):

- **Default — local build, then ship**: `npm ci && npm run build` runs on
  *your machine* (or CI), with `VITE_API_URL=""` → the bundle uses
  same-origin relative URLs (the SPA and API share one Caddy vhost, no
  CORS). The dist/ tree is tarred and unpacked into `/var/www/portal`
  owned by the `caddy` user. Building locally is deliberate: vite +
  vue-tsc want ~2 GB of RAM the Linode doesn't have to spare.
- **CI artifact**: pass
  `-e portal_web_dist_tarball=/path/to/dist.tar.gz` (created with
  `tar -czf dist.tar.gz -C web/dist .`) to skip the local build.
- **On-box build (alternative, not automated)**: needs Node ≥ 20.19
  (Ubuntu 26.04's node is fine; Debian 12's is too old — use NodeSource)
  and a 4 GB box or temporary swap. Clone the repo on the box,
  `cd web && npm ci && VITE_API_URL= npm run build`, then
  `rsync -a --delete dist/ /var/www/portal/ && chown -R caddy:caddy /var/www/portal`.

Note the production bundle **fails fast** if `VITE_API_URL` is undefined
(see `web/src/api/baseUrl.ts`); empty-string means same-origin and is the
value baked by both `web/.env.production` and this role.

## Backups & restore runbook

Nightly 03:15 `pg_dump --format=custom | zstd` to
`/var/lib/portal/backups/` + upload to the `portal-backups` bucket
(`roles/backups`). Additionally, **every** `just deploy` / `just
bootstrap` run of the `portal_api` tag starts `pg-backup.service` first
and waits for it, so a migration never runs without a fresh restore point.

Restore (tested against a scratch DB — the dump is pg_dump custom format
compressed with zstd):

```bash
# 0. Pick a dump: newest local one on the box, or fetch from the bucket
ssh ops@<host> 'ls -t /var/lib/portal/backups/ | head -5'
# aws --endpoint-url=https://gb-lon-1.linodeobjects.com s3 ls s3://portal-backups/

# 1. Stop writers so the restore is consistent
ssh ops@<host> 'sudo systemctl stop portal-api portal-scanner'

# 2. Restore. For a full point-in-time rollback, recreate the DB first:
ssh ops@<host> 'sudo -u postgres dropdb portal_prod && sudo -u postgres createdb -O portal portal_prod'
ssh ops@<host> 'zstd -dc /var/lib/portal/backups/portal_prod_<STAMP>.sql.zst \
    | sudo -u postgres pg_restore -d portal_prod --no-owner --role=portal'

# 3. Restart — the API re-runs any migrations newer than the dump on boot
ssh ops@<host> 'sudo systemctl start portal-api portal-scanner'
ssh ops@<host> 'curl -fsS localhost:3000/health'
```

To rehearse without touching prod data, restore into `portal_restore_test`
instead of dropping `portal_prod` (`createdb portal_restore_test` + the
same `pg_restore -d portal_restore_test`), sanity-query, then drop it.
Rehearse quarterly; a backup you've never restored is a hope, not a
backup.

## Daily ops

```bash
just logs                # journalctl -fu portal-api on the box
just tail-errors         # last 200 lines of ERROR/WARN from journald
just db-shell            # psql into portal_prod over SSH
just deploy v0.2.1       # push a release (with pre-deploy DB snapshot)
just deploy-web          # rebuild + ship the SPA
just status              # systemctl status for all portal-* units
just backup-now          # kick a pg_dump immediately, off-schedule
just ssh                 # plain SSH into the box
```

## Secrets

`ansible/group_vars/all/vault.yml` is an Ansible Vault file. Commit it
encrypted. The password lives in a password manager. `vault.example.yml`
shows every key (see the operator checklist above).

Secrets land on the box in `/etc/portal/api.env`,
`/etc/portal/scanner.env` and `/etc/portal/demo-stats.env`, all
`root:portal 0640`. Nothing writes secrets to journald, and the env files
are `conf-files` in the debs so upgrades won't clobber them.

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

## What's not here yet

- Steam bots (`cs2-poller`, `cs2-enricher`): mirror `portal-scanner`'s
  deb pattern in `../steam_bot/bins/*/Cargo.toml`, then add a
  `roles/portal_bots/` that installs all bot debs at once.
- Monitoring: no Prometheus yet. When added, a `roles/monitoring/` role
  will install node_exporter + Caddy-proxied Grafana.
